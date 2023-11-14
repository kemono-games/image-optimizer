import MQInOne from 'mq-in-one'

import Logger from '@/lib/logger'
import { ImageFormat } from '@/types'

import { config } from './config'

const logger = Logger.get('mq')
const mq = new MQInOne(config.mq.config, config.mq.type, logger)

export type MQMessage = { cacheKey: string } & (
  | {
      type: 'image'
      params: {
        url: string
        format: ImageFormat
        w?: number
        h?: number
        q?: number
      }
    }
  | {
      type: 'animation'
      params: {
        url: string
        format: 'mp4' | 'webm'
      }
    }
)

export const mqAddTask = (payload: MQMessage) =>
  mq.pushMessage(JSON.stringify(payload))

export const mqPolling = (
  callback: (err: null | Error, msg: MQMessage) => void,
) =>
  mq.pollingMessage(30, (err, msg) => {
    if (err) return callback(err, msg)
    callback(err, JSON.parse(msg.content))
  })
