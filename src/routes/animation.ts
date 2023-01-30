import { Router } from 'express'
import ffmpeg from 'fluent-ffmpeg'

import { cacheWithRevalidation } from '@/lib/cacheWithRevalidation'
import { config } from '@/lib/config'
import { D, E } from '@/lib/fp'
import Logger from '@/lib/logger'

const logger = Logger.get('animation optimize')

const router = Router()
router.get('/', async (req, res) => {
  const { query } = req
  const params = D.struct({
    url: D.string,
    format: D.literal('mp4', 'webm'),
  }).decode(query)
  if (E.isLeft(params)) {
    res.writeHead(400)
    return res.end('Missing parameter')
  }
  const { url, format } = params.right
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
      revalidate: async () => {
        const command = ffmpeg(videoUrl.toString())
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
      },
      callback: (cacheStatus, data) =>
        new Promise<void>((resolve) => {
          res.writeHead(200, {
            'Content-Type': `video/${format}`,
            'Cache-Control': 'public, max-age=31536000, must-revalidate',
            'x-image-cache': cacheStatus.toUpperCase(),
          })
          logger.info(`[${cacheStatus.toUpperCase()}] ${url}, format:${format}`)
          data.pipe(res)
          data.on('end', resolve)
        }),
    })
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500)
      res.end('Internal server error')
    }
  }
})

export default router
