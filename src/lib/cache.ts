import crypto from 'crypto'
import fs from 'fs'
import fsPromise from 'fs/promises'
import hash from 'object-hash'
import path from 'path'
import { PassThrough } from 'stream'

import { config } from '@/lib/config'
import Logger from '@/lib/logger'
import { CachaParams } from '@/types'

import { Locker } from './locker'
import redisClient from './redis'
import { delay } from './utils'

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
  get = async (): Promise<[null] | [string, number]> => {
    while (await this.cacheLocker.isLocked()) {
      await delay(10)
    }
    const [_, cached] = await Promise.all([
      this.cacheLocker.lock(),
      redisClient.hgetall(this.key),
    ])
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
    await Promise.all([
      redisClient.zincrby('cache_access_count', 1, this.key),
      this.cacheLocker.unlock(),
    ])
    return [filePath, Math.floor((Date.now() - parseInt(timestamp)) / 1000)]
  }

  set = (data: PassThrough) =>
    new Promise<void>(async (resolve, reject) => {
      while (await this.cacheLocker.isLocked()) {
        await delay(10)
      }
      await this.cacheLocker.lock()
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
        } finally {
          await this.cacheLocker.unlock()
        }
      })
    })
}

type CacheStatus = 'hit' | 'miss'
export const getWithCache = async (options: {
  cacheKey: any
  fetcher: () => Promise<[string] | [null, PassThrough]>
  callback: (
    cacheStatus: CacheStatus,
    cachePath: string,
    age: number,
  ) => Promise<void>
}) => {
  const { cacheKey, fetcher, callback } = options
  const cacheLocker = new Locker(cacheKey)
  const cache = new Cache(cacheKey)

  const [cached, age] = await cache.get()

  const update = async () => {
    if (await cacheLocker.isLocked()) return
    const start = Date.now()
    // cache miss
    await cacheLocker.lock()
    try {
      const [error, data] = await fetcher()
      if (error) throw new Error(error)
      await cache.set(data)
      logger.info(`process cost: ${Date.now() - start}ms`)
    } catch (err) {
      throw err
    } finally {
      await cacheLocker.unlock()
    }
  }

  if (cached) {
    // Cache hit
    return callback('hit', cached, age)
  } else {
    update()
    await delay(10)
    while (await cacheLocker.isLocked()) {
      await delay(10)
    }
    const [cached, age] = await cache.get()
    return callback('miss', cached, age)
  }
}
