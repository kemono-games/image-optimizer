import crypto from 'crypto'
import fs from 'fs'
import fsPromise from 'fs/promises'
import hash from 'object-hash'
import path from 'path'
import { PassThrough } from 'stream'

import { AVIF } from '@/consts'
import { config } from '@/lib/config'
import Logger from '@/lib/logger'
import { CachaParams, CacheParams } from '@/types'

import { Locker } from './locker'
import redisClient from './redis'
import { delay } from './utils'

const logger = Logger.get('cache')
const getCacheFilePath = (hash: string) => {
  return path.join(config.cachePath, hash.slice(0, 2), hash.slice(2, 4), hash)
}

export class ImageCache {
  private key: string

  constructor(params: CachaParams) {
    this.key = `image_cache:v2:${hash(params)}`
  }
  get = async (): Promise<[null] | [string, number]> => {
    const cached = await redisClient.hgetall(this.key)
    const { file, timestamp } = cached
    if (!file) return [null]
    const filePath = getCacheFilePath(file)
    if (!fs.existsSync(filePath)) {
      await redisClient.del(this.key)
      return [null]
    }
    redisClient.expire(this.key, config.ttl)
    const age = Math.floor((Date.now() - parseInt(timestamp)) / 1000)
    return [filePath, age]
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
            redisClient.hmset(this.key, {
              file: fileHash,
              timestamp: `${Date.now()}`,
            }),
            fsPromise.writeFile(getCacheFilePath(fileHash), data),
          ])
          redisClient.expire(this.key, config.ttl)
          resolve()
        } catch (err) {
          logger.error('Error while create image cache: ', err)
          reject(err)
        }
      })
    })
}

// JSON 缓存类，专门处理 JSON 数据
export class JsonCache {
  private key: string

  constructor(params: CacheParams) {
    this.key = `cache:v2:${hash(params)}`
  }

  // JSON 数据缓存 - 直接存储在 Redis 中
  setJson = async (data: any): Promise<void> => {
    const jsonString = JSON.stringify(data)

    try {
      await redisClient.hmset(this.key, {
        data: jsonString,
        timestamp: `${Date.now()}`,
        dataType: 'json',
      })
      // 设置 1 天的 TTL (86400 秒)
      redisClient.expire(this.key, 86400)
    } catch (err) {
      logger.error('Error while create json cache: ', err)
      throw err
    }
  }

  // 获取 JSON 数据
  getJson = async (): Promise<[null] | [any, number]> => {
    const cached = await redisClient.hgetall(this.key)
    const { data, timestamp, dataType } = cached

    if (!data || dataType !== 'json') return [null]

    const age = Math.floor((Date.now() - parseInt(timestamp)) / 1000)

    try {
      const jsonData = JSON.parse(data)
      return [jsonData, age]
    } catch (err) {
      logger.error('Error while parsing json cache: ', err)
      await redisClient.del(this.key)
      return [null]
    }
  }
}

type CacheStatus = 'hit' | 'miss'

// 统一的缓存函数，根据缓存键类型自动选择缓存策略
export const getWithCache = async <T>(options: {
  cacheKey: CacheParams
  fetcher: () => Promise<T | [string] | [null, PassThrough]>
  callback: (
    cacheStatus: CacheStatus,
    data: T | string,
    age: number,
  ) => Promise<void>
}) => {
  const { cacheKey, fetcher, callback } = options
  const cacheLocker = new Locker(cacheKey)

  if (cacheKey.type === 'image') {
    // 图片缓存逻辑
    const cache = new ImageCache(cacheKey as any)
    const [cached, age] =
      process.env.NODE_ENV === 'development' ? [null] : await cache.get()

    const update = async () => {
      if (await cacheLocker.isLocked()) return
      const start = Date.now()
      await cacheLocker.lock()
      try {
        const result = await fetcher()
        const [error, data] = result as [string] | [null, PassThrough]
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
      return callback('hit', cached as T, age)
    } else {
      update()
      await delay(10)
      while (await cacheLocker.isLocked()) {
        await delay(10)
      }
      const [cached, age] = await cache.get()
      return callback('miss', cached as T, age)
    }
  } else {
    // JSON 缓存逻辑
    const cache = new JsonCache(cacheKey)
    const [cached, age] =
      process.env.NODE_ENV === 'development' ? [null] : await cache.getJson()

    const update = async () => {
      if (await cacheLocker.isLocked()) return
      const start = Date.now()
      await cacheLocker.lock()
      try {
        const data = await fetcher()
        await cache.setJson(data)
        logger.info(`process cost: ${Date.now() - start}ms`)
      } catch (err) {
        throw err
      } finally {
        await cacheLocker.unlock()
      }
    }

    if (cached) {
      return callback('hit', cached as T, age)
    } else {
      update()
      await delay(10)
      while (await cacheLocker.isLocked()) {
        await delay(10)
      }
      const [cached, age] = await cache.getJson()
      return callback('miss', cached as T, age || 0)
    }
  }
}

// 为了向后兼容，保留 getWithJsonCache 作为 getWithCache 的别名
export const getWithJsonCache = getWithCache

export const clean = async () => {
  const logger = Logger.get('clean')
  logger.info('Start cleaning cache')
  const walk = (dir: string) => {
    logger.info(`Cleaning cache in ${dir}`)
    const files = fs.readdirSync(dir)
    files.forEach((file) => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        walk(filePath)
      } else {
        const age = (Date.now() - stat.atime.getTime()) / 1000
        if (age > config.ttl) {
          logger.info(`Delete cache file: ${filePath}`)
          fs.unlinkSync(filePath)
        }
      }
    })
  }
  walk(config.cachePath)

  const walkAndDeleteEmptyFolder = (dir: string) => {
    const files = fs.readdirSync(dir)
    if (files.length === 0) {
      logger.info(`Delete empty folder: ${dir}`)
      fs.rmdirSync(dir)
    }
    files.forEach((file) => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        walkAndDeleteEmptyFolder(filePath)
      }
    })
  }
  walkAndDeleteEmptyFolder(config.cachePath)
  process.exit(0)
}
