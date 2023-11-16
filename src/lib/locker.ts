import redisClient from './redis'

export class Locker {
  private key: string
  private timeout: number
  constructor(key: string, timeout = 15) {
    this.key = `image_lock:${key}`
    this.timeout = timeout
  }

  lock = async () => {
    await redisClient.setex(this.key, this.timeout, '1')
  }

  unlock = async () => {
    await redisClient.del(this.key)
  }

  isLocked = async () => {
    const lock = await redisClient.get(this.key)
    return !!lock
  }
}
