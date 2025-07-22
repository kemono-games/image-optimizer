import fs from 'fs'

import { config } from '@/lib/config'
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    sendDefaultPii: true,
  })
}

const { ffmpegPath, ffprobePath } = config.gifOptimize
if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
  console.error(
    'ffmpeg or ffprobe not found, please check your config file and make sure they are installed.',
  )
  process.exit(1)
}

require('./server')
