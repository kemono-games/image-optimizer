import express from 'express'
import morgan from 'morgan'

import imageRouter from './routes/image'

const app = express()
app.use(morgan('dev'))
app.use(express.urlencoded({ extended: false }))

app.head('/health', (_, res) => res.send('ok'))
app.use('/image', imageRouter)

app.listen(process.env.PORT || 3100)
