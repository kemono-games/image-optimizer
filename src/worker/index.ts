import { PassThrough } from 'stream'

import { Cache } from '@/lib/cache'
import { E } from '@/lib/fp'
import { Locker } from '@/lib/locker'
import Logger from '@/lib/logger'

import { optimizeAnimation } from './handler/animation'
import { optimizeImage } from './handler/image'
import { eventDecoder } from './lib/decoder'

const logger = Logger.get('worker')

const event = process.env.FC_CUSTOM_CONTAINER_EVENT
logger.info('Event payload:', event)
if (!event) {
  logger.error('FC_CUSTOM_CONTAINER_EVENT is empty')
  process.exit(1)
}

const _event = eventDecoder.decode(JSON.parse(event))
if (E.isLeft(_event)) {
  logger.error('Invalid event payload:', _event.left)
  process.exit(1)
}

const payload = _event.right

const handler = async () => {
  const { cacheKey, type, params } = payload
  const cache = new Cache(cacheKey)
  const locker = new Locker(cacheKey)

  logger.info('Start processing:', payload)
  const start = Date.now()

  let stream: PassThrough
  if (type === 'image') {
    logger.info('Image optimize')
    const [error, _stream] = await optimizeImage({
      url: params.url,
      format: params.format,
      width: params.w,
      height: params.h,
      quality: params.q,
    })
    if (error) {
      logger.error('Optimize image error:', error)
      return process.exit(1)
    }
    stream = _stream
  } else if (type === 'animation') {
    logger.info('Animation optimize')
    const [error, _stream] = await optimizeAnimation(params.url, params.format)
    if (error) {
      logger.error('Optimize animation error:', error)
      return process.exit(1)
    }
    stream = _stream
  }

  if (stream) {
    await cache.set(stream)
    await locker.unlock()
    logger.info('Finish processing. Cost:', Date.now() - start, 'ms')
    return process.exit(0)
  }

  logger.error('Unknown type:', type)
  process.exit(1)
}

handler()
