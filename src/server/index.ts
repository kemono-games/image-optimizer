import cors from 'cors'
import express from 'express'
import fs from 'fs'
import helmet from 'helmet'
import morgan from 'morgan'

import { config } from '@/lib/config'
import Logger from '@/lib/logger'
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

import animationRouter from './routes/animation'
import imageRouter from './routes/image'

const logger = Logger.get('express')
const app = express()

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  })
  app.use(Sentry.Handlers.requestHandler())
  app.use(Sentry.Handlers.tracingHandler())
}

const corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(
  morgan('dev', {
    ...(config.log.accessLog === 'stdout'
      ? {}
      : {
          stream: fs.createWriteStream(config.log.accessLog, { flags: 'a' }),
        }),
    skip: (req) => req.path === '/health',
  }),
)
app.use(express.urlencoded({ extended: false }))

app.options('*', cors(corsOptions))
app.all('/health', (_, res) => res.send('ok'))
app.use('/image', imageRouter)
app.use('/animation', animationRouter)

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
