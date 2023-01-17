module.exports = {
  domains: [
    // Add your domains here
  ],
  cachePath: './cache',
  redisConfig: {
    host: 'localhost',
    port: 6379,
    db: 0,
    // password: '123456',
  },
  revalidate: 300,
  ttl: 24 * 60 * 60,
  cleanSchedule: '0 2 * * *',
  urlParser: (url) => url,
  log: {
    accessLog: 'stdout',
    serverLog: 'stdout',
    serverLogLevel: 'info',
  },
  sentryDsn: '',
}
