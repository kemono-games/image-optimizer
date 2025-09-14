import crypto from 'crypto'
import fs from 'fs'
import fsPromise from 'fs/promises'
import hash from 'object-hash'
import path from 'path'
import { PassThrough } from 'stream'

import { config } from '@/lib/config'
import Logger from '@/lib/logger'
import {
  CacheParams,
  ImageCacheParams,
  AnimationCacheParams,
  FfprobeCacheParams,
} from '@/types'
import { CacheStrategy, CacheOptions, CacheDataType } from '@/types/cache'

import { Locker } from './locker'
import redisClient from './redis'
import { delay } from './utils'

const logger = Logger.get('cache')

const getCacheFilePath = (hash: string) => {
  return path.join(config.cachePath, hash.slice(0, 2), hash.slice(2, 4), hash)
}

abstract class BaseCache<T> implements CacheStrategy<T> {
  protected key: string

  constructor(params: CacheParams) {
    this.key = `cache:v2:${hash(params)}`
  }

  abstract get(): Promise<[T | null, number]>
  abstract set(data: T): Promise<void>

  protected async setExpire(ttl: number = config.ttl): Promise<void> {
    await redisClient.expire(this.key, ttl)
  }
}

class FileCache extends BaseCache<string> {
  constructor(params: ImageCacheParams | AnimationCacheParams) {
    super(params)
    this.key = `image_cache:v2:${hash(params)}`
  }

  async get(): Promise<[string | null, number]> {
    const cached = await redisClient.hgetall(this.key)
    const { file, timestamp } = cached

    if (!file) return [null, 0]

    const filePath = getCacheFilePath(file)
    if (!fs.existsSync(filePath)) {
      await redisClient.del(this.key)
      return [null, 0]
    }

    await this.setExpire()
    const age = Math.floor((Date.now() - parseInt(timestamp)) / 1000)
    return [filePath, age]
  }

  async set(data: string | PassThrough): Promise<void> {
    if (typeof data === 'string') {
      throw new Error('FileCache.set expects a PassThrough stream')
    }

    const stream = data as PassThrough

    return new Promise<void>((resolve, reject) => {
      const bufs: Buffer[] = []
      const cipher = crypto.createHash('sha1')

      stream.on('data', (chunk) => {
        bufs.push(chunk)
        cipher.update(chunk)
      })

      stream.on('end', async () => {
        const buffer = Buffer.concat(bufs)
        const fileHash = cipher.digest('hex')
        const filePath = getCacheFilePath(fileHash)
        const dir = path.dirname(filePath)

        fs.mkdirSync(dir, { recursive: true })

        try {
          await Promise.all([
            redisClient.hmset(this.key, {
              file: fileHash,
              timestamp: `${Date.now()}`,
            }),
            fsPromise.writeFile(filePath, buffer),
          ])
          await this.setExpire()
          resolve()
        } catch (err) {
          logger.error('Error while create image cache: ', err)
          reject(err)
        }
      })

      stream.on('error', reject)
    })
  }
}

class JsonCacheImpl<T = any> extends BaseCache<T> {
  constructor(params: FfprobeCacheParams) {
    super(params)
  }

  async get(): Promise<[T | null, number]> {
    const cached = await redisClient.hgetall(this.key)
    const { data, timestamp, dataType } = cached

    if (!data || dataType !== 'json') return [null, 0]

    const age = Math.floor((Date.now() - parseInt(timestamp)) / 1000)

    try {
      const jsonData = JSON.parse(data)
      return [jsonData, age]
    } catch (err) {
      logger.error('Error while parsing json cache: ', err)
      await redisClient.del(this.key)
      return [null, 0]
    }
  }

  async set(data: T): Promise<void> {
    const jsonString = JSON.stringify(data)

    try {
      await redisClient.hmset(this.key, {
        data: jsonString,
        timestamp: `${Date.now()}`,
        dataType: 'json',
      })
      await this.setExpire(86400)
    } catch (err) {
      logger.error('Error while create json cache: ', err)
      throw err
    }
  }
}

function createCache(params: CacheParams): CacheStrategy<any> {
  switch (params.type) {
    case 'image':
    case 'animation':
      return new FileCache(params)
    case 'ffprobe':
      return new JsonCacheImpl(params)
    default:
      throw new Error(`Unknown cache type: ${(params as any).type}`)
  }
}

export async function getWithCache<T extends CacheParams>(
  options: CacheOptions<T>,
): Promise<void> {
  const { cacheKey, fetcher, callback } = options
  const cache = createCache(cacheKey)
  const cacheLocker = new Locker(cacheKey)

  const [cached, age] =
    process.env.NODE_ENV === 'development'
      ? ([null, 0] as [null, number])
      : await cache.get()

  const update = async () => {
    if (await cacheLocker.isLocked()) return

    const start = Date.now()
    await cacheLocker.lock()

    try {
      const result = await fetcher()

      if (cacheKey.type === 'image' || cacheKey.type === 'animation') {
        const [error, data] = result as [string] | [null, PassThrough]
        if (error) throw new Error(error)
        await cache.set(data)
      } else {
        await cache.set(result)
      }

      logger.info(`process cost: ${Date.now() - start}ms`)
    } catch (err) {
      throw err
    } finally {
      await cacheLocker.unlock()
    }
  }

  if (cached) {
    return callback('hit', cached as CacheDataType<T>, age)
  } else {
    update()
    await delay(10)

    while (await cacheLocker.isLocked()) {
      await delay(10)
    }

    const [newCached, newAge] = await cache.get()
    if (!newCached) {
      throw new Error(
        'Cache file not available after processing, or process timed out',
      )
    }
    return callback('miss', newCached as CacheDataType<T>, newAge || 0)
  }
}

export const clean = async () => {
  const logger = Logger.get('clean')
  logger.info('Start cleaning cache')

  const walk = async (dir: string): Promise<void> => {
    logger.info(`Cleaning cache in ${dir}`)
    const files = await fsPromise.readdir(dir)

    for (const file of files) {
      const filePath = path.join(dir, file)
      const stat = await fsPromise.stat(filePath)

      if (stat.isDirectory()) {
        await walk(filePath)
      } else {
        const age = (Date.now() - stat.atime.getTime()) / 1000
        if (age > config.ttl) {
          logger.info(`Delete cache file: ${filePath}`)
          await fsPromise.unlink(filePath)
        }
      }
    }
  }

  const walkAndDeleteEmptyFolder = async (dir: string): Promise<void> => {
    const files = await fsPromise.readdir(dir)

    if (files.length === 0) {
      logger.info(`Delete empty folder: ${dir}`)
      await fsPromise.rmdir(dir)
      return
    }

    for (const file of files) {
      const filePath = path.join(dir, file)
      const stat = await fsPromise.stat(filePath)

      if (stat.isDirectory()) {
        await walkAndDeleteEmptyFolder(filePath)
      }
    }
  }

  await walk(config.cachePath)
  await walkAndDeleteEmptyFolder(config.cachePath)
  process.exit(0)
}
