import cron from 'node-cron'

import Logger from '@/lib/logger'

import { clean } from './lib/cache'
import { config } from './lib/config'

const logger = Logger.get('tasks')
cron.schedule(config.cleanSchedule, async () => {
  logger.info('Start clean cache...')
  await clean()
  logger.info('Clean cache done.')
})
