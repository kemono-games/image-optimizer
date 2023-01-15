import hash from 'object-hash'

import { CachaParams } from '@/types'

import redisClient from './redis'

export class Locker {
  private key: string
  constructor(params: CachaParams) {
    this.key = `image_lock:${hash(params)}`
  }

  lock = async () => {
    await redisClient.setex(this.key, 10, '1')
  }

  unlock = async () => {
    await redisClient.del(this.key)
  }

  isLocked = async () => {
    const lock = await redisClient.get(this.key)
    return !!lock
  }
}
