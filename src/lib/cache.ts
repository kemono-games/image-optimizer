import crypto from 'crypto'
import fs, { ReadStream } from 'fs'
import fsPromise from 'fs/promises'
import hash from 'object-hash'
import path from 'path'
import { PassThrough } from 'stream'

import { config } from '@/lib/config'
import Logger from '@/lib/logger'
import { CachaParams } from '@/types'

import { Locker } from './locker'
import redisClient from './redis'

const logger = Logger.get('cache')
const getCacheFilePath = (hash: string) => {
  return path.join(config.cachePath, hash.slice(0, 2), hash.slice(2, 4), hash)
}

export class Cache {
  private key: string
  private cacheLocker: Locker

  constructor(params: CachaParams) {
    this.key = `image_cache:${hash(params)}`
    this.cacheLocker = new Locker(params)
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

  set = (data: PassThrough) =>
    new Promise<void>((resolve, reject) => {
      const bufs = []
      const cipher = crypto.createHash('sha1')
      data.on('data', (chunk) => {
        bufs.push(chunk)
        cipher.update(chunk)
      })
      data.on('end', async () => {
        const data = Buffer.concat(bufs)
        const fileHash = cipher.digest('hex')
        fs.mkdirSync(
          getCacheFilePath(fileHash).split('/').slice(0, -1).join('/'),
          {
            recursive: true,
          },
        )
        try {
          const prevCached = await redisClient.hgetall(this.key)
          await Promise.all([
            redisClient.hset(this.key, {
              file: fileHash,
              timestamp: `${Date.now()}`,
            }),
            fsPromise.writeFile(getCacheFilePath(fileHash), data),
          ])
          resolve()
          if (prevCached && prevCached.file && prevCached.file !== fileHash) {
            fs.unlink(getCacheFilePath(prevCached.file), () => undefined)
          }
        } catch (err) {
          logger.error('Error while create image cache: ', err)
          reject(err)
        }
      })
    })
}

export const clean = async () => {
  logger.time('clean cache cost')
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
      fs.unlink(getCacheFilePath(file), (err) => logger.error(err))
    }
  }
  logger.timeEnd('clean cache cost')
}
