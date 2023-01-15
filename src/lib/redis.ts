import Redis from 'ioredis'

import { config } from './config'

const redisClient = new Redis({
  ...config.redisConfig,
})

export default redisClient
