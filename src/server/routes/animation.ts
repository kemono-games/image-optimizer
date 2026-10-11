import { Router } from 'express'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import { CreateReadStreamOptions } from 'fs/promises'
import { PassThrough } from 'node:stream'

import { getWithCache } from '@/lib/cache'
import { config } from '@/lib/config'
import { D, E } from '@/lib/fp'
import Logger from '@/lib/logger'
import { parseSourceUrl } from '@/lib/url'

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

const revalidate =
  (url: string, format: 'mp4' | 'webm') =>
  async (): Promise<[null, PassThrough]> => {
    const command = ffmpeg(url)
      // 纵深防御：禁止 ffmpeg 通过 file:、concat:、subfile: 等协议读取本地资源
      .inputOptions(['-protocol_whitelist http,https,tcp,tls'])
      .setFfprobePath(config.gifOptimize.ffprobePath)
      .setFfmpegPath(config.gifOptimize.ffmpegPath)
      .noAudio()
      .format(format)
    const stream = new PassThrough()
    // ffmpeg 出错（如源地址 404）时必须把 error 转发到下游，否则 command 上的
    // unhandled 'error' 事件会直接让整个 Node 进程崩溃。
    // stdout 不能自动 end 下游：stdout 关闭早于进程退出，失败时下游会先收到
    // 'end'，把不完整的结果写进缓存；改为由 ffmpeg 的 end/error 决定结束方式
    command
      .on('error', (err) => stream.destroy(err))
      .on('end', () => stream.end())
    if (format === 'mp4') {
      command
        .videoCodec('libx264')
        .outputOptions([
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-movflags frag_keyframe+empty_moov',
          "-filter:v crop='floor(in_w/2)*2:floor(in_h/2)*2'",
        ])
        .pipe(stream, { end: false })
    } else {
      command
        .videoCodec('libvpx-vp9')
        .outputOptions([
          '-b:v 0',
          '-crf 40',
          // GIF 解码为 bgra 时 ffmpeg 会自动选 gbrap，libvpx-vp9 拒绝该格式导致转码失败；
          // 限定为 yuva420p/yuv420p，由 ffmpeg 按输入挑选：透明 GIF 保留 alpha，其余不带 alpha
          '-filter:v format=yuva420p|yuv420p',
          // 默认参数下 VP9 极慢，容易超过 cache lock 的等待上限
          '-row-mt 1',
          '-cpu-used 4',
        ])
        .pipe(stream, { end: false })
    }
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
  const videoUrl = parseSourceUrl(url)
  if (E.isLeft(videoUrl)) {
    res.writeHead(400)
    return res.end(videoUrl.left)
  }

  const cacheKey = { url, format, type: 'animation' as const }

  try {
    await getWithCache({
      cacheKey,
      fetcher: revalidate(config.urlParser(videoUrl.right.toString()), format),
      callback: (cacheStatus, cachePath: string, age) =>
        new Promise<void>((resolve) => {
          const stat = fs.statSync(cachePath)
          res.writeHead(200, {
            'Accept-Ranges': 'bytes',
            'Content-Length': stat.size,
            'Content-Type': `video/${format}`,
            'Cache-Control':
              'public, max-age=31536000, s-max-age=31536000, immutable',
            'x-image-cache': cacheStatus.toUpperCase(),
            'x-image-age': `${age}`,
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
  const videoUrl = parseSourceUrl(url)
  if (E.isLeft(videoUrl)) {
    res.writeHead(400)
    return res.end(videoUrl.left)
  }

  const cacheKey = { url, format, type: 'animation' as const }

  try {
    await getWithCache({
      cacheKey,
      fetcher: revalidate(config.urlParser(videoUrl.right.toString()), format),
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
            'public, max-age=31536000, s-max-age=31536000, immutable',
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
