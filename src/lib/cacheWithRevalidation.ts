import { PassThrough } from 'stream'

import Logger from '@/lib/logger'

import { Cache } from './cache'
import { Locker } from './locker'
import { delay } from './utils'

const logger = Logger.get('cache manager')

type CacheStatus = 'hit' | 'miss' | 'revalidate'
export const cacheWithRevalidation = async (options: {
  cacheKey: any
  revalidate: () => Promise<[string] | [null, PassThrough]>
  callback: (cacheStatus: CacheStatus, cachePath: string) => Promise<void>
}) => {
  const { cacheKey, revalidate, callback } = options
  const cacheLocker = new Locker(cacheKey)
  const cache = new Cache(cacheKey)

  const [cached, needRevalidate] = await cache.get()

  const update = async () => {
    if (await cacheLocker.isLocked()) return
    const start = Date.now()
    // revalidate or cache miss
    await cacheLocker.lock()
    try {
      const [error, data] = await revalidate()
      if (error) throw new Error(error)
      await cache.set(data)
      logger.info(`Updated cost: ${Date.now() - start}ms`)
    } catch (err) {
      throw err
    } finally {
      await cacheLocker.unlock()
    }
  }

  if (cached && !needRevalidate) {
    // Cache hit and not revalidate
    return callback('hit', cached)
  } else if (cached && needRevalidate) {
    // Cache hit and revalidate but has a running task
    await callback('revalidate', cached)
    return update()
  } else {
    // Cache miss but has a running task
    update()
    await delay(10)
    while (await cacheLocker.isLocked()) {
      await delay(10)
    }
    const [cached] = await cache.get()
    return callback('miss', cached)
  }
}
