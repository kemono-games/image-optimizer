import express from 'express'
import fs from 'fs'
import morgan from 'morgan'

import { config } from './lib/config'
import imageRouter from './routes/image'

const app = express()
app.use(
  morgan(
    'dev',
    config.log.accessLog === 'stdout'
      ? undefined
      : {
          stream: fs.createWriteStream(config.log.accessLog, { flags: 'a' }),
        },
  ),
)
app.use(express.urlencoded({ extended: false }))

app.head('/health', (_, res) => res.send('ok'))
app.use('/image', imageRouter)

app.listen(process.env.PORT || 3100)
