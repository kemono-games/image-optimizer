import crypto from 'crypto'
import fs, { ReadStream } from 'fs'
import fsPromise from 'fs/promises'
import hash from 'object-hash'
import path from 'path'

import { config } from '@/lib/config'
import { CachaParams } from '@/types'

import redisClient from './redis'

const getCacheFilePath = (hash: string) => {
  return path.join(config.cacheDir, hash.slice(0, 2), hash.slice(2, 4), hash)
}
export class Cache {
  private key: string
  constructor(params: CachaParams) {
    this.key = `image_cache:${hash(params)}`
  }
  get = async (): Promise<[null] | [ReadStream, boolean]> => {
    const cached = await redisClient.hgetall(this.key)
    const { timestamp, file } = cached
    if (!timestamp || !file) return [null]
    if (Date.now() - parseInt(timestamp) > config.ttl * 1000) {
      redisClient.del(this.key)
      fs.unlink(getCacheFilePath(file), () => undefined)
      return [null]
    }
    const revalidate =
      Date.now() - parseInt(timestamp) > config.revalidate * 1000
    if (!fs.existsSync(getCacheFilePath(file))) {
      redisClient.del(this.key)
      return [null]
    }
    return [fs.createReadStream(getCacheFilePath(file)), revalidate]
  }

  set = async (data) => {
    const fileHash = crypto.createHash('sha1').update(data).digest('hex')
    fs.mkdirSync(getCacheFilePath(fileHash).split('/').slice(0, -1).join('/'), {
      recursive: true,
    })
    try {
      await Promise.all([
        redisClient.hset(this.key, {
          file: fileHash,
          timestamp: `${Date.now()}`,
        }),
        fsPromise.writeFile(getCacheFilePath(fileHash), data),
      ])
    } catch (err) {
      console.error('Error while create image cache: ', err)
    }
  }
}

export const clean = async () => {
  const keys = await redisClient.keys('image_cache:*')
  for (const key of keys) {
    const cached = await redisClient.hgetall(key)
    const { timestamp, file } = cached
    if (!timestamp || !file) {
      redisClient.del(key)
      continue
    }
    if (Date.now() - parseInt(timestamp) > config.ttl * 1000) {
      redisClient.del(key)
      fs.unlink(getCacheFilePath(file), () => undefined)
    }
  }
}