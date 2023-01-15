import userConfig from '../../optimizer.config'

export const defaultConfig = {
  domains: [],
  cacheDir: './cache',
  redisConfig: {
    host: 'localhost',
    port: 6379,
    db: 0,
  },
  revalidate: 300,
  ttl: 24 * 60 * 60,
  cleanSchedule: '0 2 * * *',
  urlParser: (url: string) => url,
}

export const config = { ...defaultConfig, ...userConfig }
