import { Router } from 'express'
import fs from 'fs'
import { CreateReadStreamOptions } from 'fs/promises'
import hash from 'object-hash'

import { getWithCache } from '@/lib/cache'
import { D, E } from '@/lib/fp'
import Logger from '@/lib/logger'
import { MQMessage } from '@/lib/mns'

const logger = Logger.get('animation optimize')

const router = Router()

const videoTaskParamsDecoder = D.struct({
  url: D.string,
  format: D.literal('mp4', 'webm'),
})

const parseQuery = (query: any) => {
  const params = videoTaskParamsDecoder.decode(query)
  if (E.isLeft(params)) {
    return null
  }
  return params.right
}

router.head('/', async (req, res) => {
  const { query } = req
  const params = parseQuery(query)
  if (params === null) {
    res.writeHead(400)
    return res.end('Missing parameter')
  }
  const { url, format } = params
  try {
    new URL(url)
  } catch (err) {
    res.writeHead(400)
    return res.end(err.message || 'Invalid URL')
  }

  const cacheKey = hash({ url, format })

  try {
    const payload: MQMessage = {
      cacheKey,
      type: 'animation' as const,
      params,
    }
    const [cacheStatus, cachePath, age] = await getWithCache(payload)
    const stat = fs.statSync(cachePath)
    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': stat.size,
      'Content-Type': `video/${format}`,
      'Cache-Control': 'public, max-age=31536000, must-revalidate',
      'X-Image-Cache': cacheStatus.toUpperCase(),
      'X-Image-Age': `${age}`,
    })
    res.end()
    logger.info(`[${cacheStatus.toUpperCase()}] ${url}, format:${format}`)
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500)
      res.end('Internal server error')
    }
  }
})

router.get('/', async (req, res) => {
  const { query } = req
  const params = parseQuery(query)
  if (params === null) {
    res.writeHead(400)
    return res.end('Missing parameter')
  }
  const { url, format } = params
  try {
    new URL(url)
  } catch (err) {
    res.writeHead(400)
    return res.end(err.message || 'Invalid URL')
  }

  const cacheKey = hash({ url, format })

  try {
    const payload: MQMessage = {
      cacheKey,
      type: 'animation' as const,
      params,
    }
    const [cacheStatus, cachePath, age] = await getWithCache(payload)
    logger.info(`[${cacheStatus.toUpperCase()}] ${url}, format:${format}`)
    const stat = fs.statSync(cachePath)
    const range = req.range(stat.size)

    const options: CreateReadStreamOptions = {}
    let start
    let end

    if (range !== -1 && range !== -2 && range?.type === 'bytes') {
      const [part] = range
      options.start = part.start
      start = part.start
      if (part.end) {
        options.end = part.end
        end = part.end
      }
    }

    let retrievedLength
    if (start !== undefined && end !== undefined) {
      retrievedLength = end + 1 - start
    } else if (start !== undefined) {
      retrievedLength = stat.size - start
    } else if (end !== undefined) {
      retrievedLength = end + 1
    } else {
      retrievedLength = stat.size
    }

    res.setHeader('Content-Length', retrievedLength)
    res.setHeader('Content-Type', `video/${format}`)
    res.setHeader('Cache-Control', 'public, max-age=31536000, must-revalidate')
    res.setHeader('X-Image-Cache', cacheStatus.toUpperCase())
    res.setHeader('X-Image-Age', `${age}`)
    if (range !== -1 && range !== -2) {
      res.setHeader(
        'Content-Range',
        `bytes ${start || 0}-${end || stat.size - 1}/${stat.size}`,
      )
      res.setHeader('Accept-Ranges', 'bytes')
    }
    const data = fs.createReadStream(cachePath, options)
    data.pipe(res)
    data.on('end', () => res.end())
  } catch (err) {
    logger.error(err)
    if (!res.headersSent) {
      res.writeHead(500)
      res.end('Internal server error')
    }
  }
})

export default router
