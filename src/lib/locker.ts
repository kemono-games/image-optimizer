import redisClient from './redis'

export class Locker {
  private key: string
  constructor(key: string) {
    this.key = `image_lock:${key}`
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
