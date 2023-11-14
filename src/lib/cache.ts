import crypto from 'crypto'
import fs from 'fs'
import fsPromise from 'fs/promises'
import path from 'path'
import { PassThrough } from 'stream'

import { config } from '@/lib/config'
import Logger from '@/lib/logger'

import { Locker } from './locker'
import { mqAddTask, MQMessage } from './mns'
import redisClient from './redis'
import { delay } from './utils'

const logger = Logger.get('cache')
const getCacheFilePath = (hash: string) => {
  return path.resolve(
    config.cachePath,
    hash.slice(0, 2),
    hash.slice(2, 4),
    hash,
  )
}

export class Cache {
  private key: string

  constructor(key: string) {
    this.key = `image_cache:${key}`
  }
  get = async (): Promise<[null] | [string, number]> => {
    const cached = await redisClient.hgetall(this.key)
    const { file, timestamp } = cached
    if (!file) return [null]
    const filePath = getCacheFilePath(file)
    if (!fs.existsSync(filePath)) {
      await Promise.all([
        redisClient.del(this.key),
        redisClient.zrem('cache_access_count', this.key),
      ])
      return [null]
    }
    await redisClient.zincrby('cache_access_count', 1, this.key)
    return [filePath, Math.floor((Date.now() - parseInt(timestamp)) / 1000)]
  }

  set = (data: PassThrough) =>
    new Promise<void>(async (resolve, reject) => {
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
          await Promise.all([
            redisClient.hset(this.key, {
              file: fileHash,
              timestamp: `${Date.now()}`,
            }),
            fsPromise.writeFile(getCacheFilePath(fileHash), data),
          ])
          resolve()
        } catch (err) {
          logger.error('Error while create image cache: ', err)
          reject(err)
        }
      })
    })
}

type CacheStatus = 'hit' | 'miss'
export const getWithCache = async (
  payload: MQMessage,
): Promise<[CacheStatus, string, number]> => {
  const cacheKey = payload.cacheKey
  const cacheLocker = new Locker(cacheKey)
  const cache = new Cache(cacheKey)

  while (await cacheLocker.isLocked()) {
    await delay(10)
  }
  const [cached, age] = await cache.get()

  if (cached) {
    // Cache hit
    return ['hit', cached, age]
  } else {
    // cache miss
    if (!(await cacheLocker.isLocked())) {
      // if not locked, lock it and fetch
      await cacheLocker.lock()
      try {
        await mqAddTask(payload)
        await delay(10)
      } catch (err) {
        await cacheLocker.unlock()
        throw err
      }
    }

    // wait for cache to be created
    while (await cacheLocker.isLocked()) {
      await delay(10)
    }
    const [cached, age] = await cache.get()
    return ['miss', cached, age]
  }
}
