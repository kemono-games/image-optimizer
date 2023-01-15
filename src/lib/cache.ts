import crypto from 'crypto'
import fs, { ReadStream } from 'fs'
import fsPromise from 'fs/promises'
import hash from 'object-hash'
import path from 'path'

import { config } from '@/lib/config'
import { CachaParams } from '@/types'

import redisClient from './redis'

export const get = async (
  params: CachaParams,
): Promise<[null] | [ReadStream, boolean]> => {
  const key = hash(params)
  const cacheKey = `image_cache:${key}`
  const cached = await redisClient.hgetall(cacheKey)
  const { timestamp, file } = cached
  if (!timestamp || !file) return [null]
  const filePath = path.join(config.cacheDir, file)
  if (Date.now() - parseInt(timestamp) > config.ttl * 1000) {
    redisClient.del(cacheKey)
    fs.unlink(filePath, () => undefined)
    return [null]
  }
  const revalidate = Date.now() - parseInt(timestamp) > config.revalidate * 1000
  if (!fs.existsSync(filePath)) {
    redisClient.del(cacheKey)
    return [null]
  }
  return [fs.createReadStream(filePath), revalidate]
}

export const set = async (params: CachaParams, data: Buffer) => {
  const key = hash(params)
  const cacheKey = `image_cache:${key}`
  const fileHash = crypto.createHash('sha1').update(data).digest('hex')
  const filePath = path.join(config.cacheDir, fileHash)
  try {
    await Promise.all([
      redisClient.hset(cacheKey, {
        file: fileHash,
        timestamp: `${Date.now()}`,
      }),
      fsPromise.writeFile(filePath, data),
    ])
  } catch (err) {
    console.error('Error while create image cache: ', err)
  }
}
