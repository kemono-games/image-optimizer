const { execSync } = require('child_process')

// Try to get default path of ffmpeg and ffprobe
const ffmpegPath = execSync('which ffmpeg').toString().trim()
const ffprobePath = execSync('which ffprobe').toString().trim()

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
  urlParser: (url) => url,
  log: {
    accessLog: 'stdout',
    serverLog: 'stdout',
    serverLogLevel: 'info',
  },
  gifOptimize: {
    ffmpegPath,
    ffprobePath,
  },
  avif: true,
  sentryDsn: '',
  ttl: 60 * 60 * 24 * 30, // 30 days
}
