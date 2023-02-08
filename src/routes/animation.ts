import { Router } from 'express'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import { CreateReadStreamOptions } from 'fs/promises'
import { PassThrough } from 'node:stream'

import { cacheWithRevalidation } from '@/lib/cacheWithRevalidation'
import { config } from '@/lib/config'
import { D, E } from '@/lib/fp'
import Logger from '@/lib/logger'

const logger = Logger.get('animation optimize')

const router = Router()

const parseQuery = (query: any) => {
  const params = D.struct({
    url: D.string,
    format: D.literal('mp4', 'webm'),
  }).decode(query)
  if (E.isLeft(params)) {
    return null
  }
  return params.right
}

const revalidate =
  (url: string, format: 'mp4' | 'webm') =>
  async (): Promise<[null, PassThrough]> => {
    const command = ffmpeg(url)
      .setFfprobePath(config.gifOptimize.ffprobePath)
      .setFfmpegPath(config.gifOptimize.ffmpegPath)
      .noAudio()
      .format(format)
    const stream =
      format === 'mp4'
        ? command
            .videoCodec('libx264')
            .outputOptions([
              '-pix_fmt yuv420p',
              '-movflags +faststart',
              '-movflags frag_keyframe+empty_moov',
              "-filter:v crop='floor(in_w/2)*2:floor(in_h/2)*2'",
            ])
            .pipe()
        : command
            .videoCodec('libvpx-vp9')
            .outputOptions(['-b:v 0', '-crf 40'])
            .pipe()
    return [null, stream]
  }

router.head('/', async (req, res) => {
  const { query } = req
  const params = parseQuery(query)
  if (params === null) {
    res.writeHead(400)
    return res.end('Missing parameter')
  }
  const { url, format } = params
  let videoUrl: URL
  try {
    videoUrl = new URL(url)
  } catch (err) {
    res.writeHead(400)
    return res.end(err.message || 'Invalid URL')
  }

  const cacheKey = { url, format }

  try {
    await cacheWithRevalidation({
      cacheKey,
      revalidate: revalidate(videoUrl.toString(), format),
      callback: (cacheStatus, cachePath) =>
        new Promise<void>((resolve) => {
          const stat = fs.statSync(cachePath)
          res.writeHead(200, {
            'Accept-Ranges': 'bytes',
            'Content-Length': stat.size,
            'Content-Type': `video/${format}`,
            'Cache-Control': 'public, max-age=31536000, must-revalidate',
            'x-image-cache': cacheStatus.toUpperCase(),
          })
          res.end()
          logger.info(`[${cacheStatus.toUpperCase()}] ${url}, format:${format}`)
          resolve()
        }),
    })
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
  let videoUrl: URL
  try {
    videoUrl = new URL(url)
  } catch (err) {
    res.writeHead(400)
    return res.end(err.message || 'Invalid URL')
  }

  const cacheKey = { url, format }

  try {
    await cacheWithRevalidation({
      cacheKey,
      revalidate: revalidate(videoUrl.toString(), format),
      callback: (cacheStatus, cachePath) =>
        new Promise<void>((resolve) => {
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
          res.setHeader(
            'Cache-Control',
            'public, max-age=31536000, must-revalidate',
          )
          if (range !== -1 && range !== -2) {
            res.setHeader(
              'Content-Range',
              `bytes ${start || 0}-${end || stat.size - 1}/${stat.size}`,
            )
            res.setHeader('Accept-Ranges', 'bytes')
          }
          const data = fs.createReadStream(cachePath, options)
          data.pipe(res)
          data.on('end', resolve)
        }),
    })
  } catch (err) {
    logger.error(err)
    if (!res.headersSent) {
      res.writeHead(500)
      res.end('Internal server error')
    }
  }
})

export default router
