import path from 'path'
import { Worker } from 'worker_threads'

import { mqPolling } from '@/lib/mns'

console.log('start polling')

// fix sharp lib not found: https://sharp.pixelplumbing.com/install#worker-threads
require('sharp')

mqPolling((err, msg) => {
  if (err) console.error(err)
  console.log('event data', msg)
  process.env.FC_CUSTOM_CONTAINER_EVENT = JSON.stringify(msg)
  new Worker(path.resolve(__dirname, '../../dist/worker/index.js'))
})
