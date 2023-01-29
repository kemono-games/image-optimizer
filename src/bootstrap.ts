import fs from 'fs'

import { config } from '@/lib/config'

const { ffmpegPath, ffprobePath } = config.gifOptimize
if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
  console.error(
    'ffmpeg or ffprobe not found, please check your config file and make sure they are installed.',
  )
  process.exit(1)
}

require('./server')
require('./task')
