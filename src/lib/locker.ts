import hash from 'object-hash'

import { CachaParams, CacheParams } from '@/types'

import redisClient from './redis'

export class Locker {
  private key: string
  constructor(params: CachaParams | CacheParams) {
    this.key = `lock:${hash(params)}`
  }

  lock = async () => {
    await redisClient.setex(this.key, 120, '1')
  }

  unlock = async () => {
    await redisClient.del(this.key)
  }

  isLocked = async () => {
    const lock = await redisClient.get(this.key)
    return !!lock
  }
}
