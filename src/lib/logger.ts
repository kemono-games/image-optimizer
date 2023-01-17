import fs from 'fs'
import Logger from 'js-logger'

import { config } from './config'

Logger.useDefaults()
if (config.log.serverLog !== 'stdout') {
  const stream = fs.createWriteStream(config.log.serverLog, { flags: 'a' })

  process.on('SIGTERM', () => {
    stream.end()
  })
  Logger.setHandler((messages, context) => {
    stream.write(`[${context.level}] ${messages}\n`)
  })
}
export default Logger
