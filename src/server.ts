import express from 'express'
import fs from 'fs'
import morgan from 'morgan'

import Logger from '@/lib/logger'
import * as Sentry from '@sentry/node'
import * as Tracing from '@sentry/tracing'

import { config } from './lib/config'
import imageRouter from './routes/image'

const logger = Logger.get('express')
const app = express()

if (config.sentryDsn) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Express({ app }),
    ],
    tracesSampleRate: 0.3,
  })
  app.use(Sentry.Handlers.requestHandler())
  app.use(Sentry.Handlers.tracingHandler())
}

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

if (config.sentryDsn) {
  app.use(Sentry.Handlers.errorHandler())
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(function onError(err, req, res, next) {
  logger.error(err)
  res.statusCode = 500
  res.end('Internal Server Error\n')
})

const port = process.env.PORT || 3100
app.listen(port, () => logger.log(`Listening on port ${port}`))
