import cron from 'node-cron'

import { clean } from './lib/cache'
import { config } from './lib/config'

cron.schedule(config.cleanSchedule, async () => {
  console.log('Start clean cache...')
  await clean()
  console.log('Clean cache done.')
})
