import { Router } from 'express'
import { pipe } from 'fp-ts/lib/function'
import { NumberFromString } from 'io-ts-types'
import { PassThrough } from 'node:stream'

import { returnOriginalFormats, supportedFormats, supportedTargetFormats } from '@/consts'
import { cacheWithRevalidation } from '@/lib/cacheWithRevalidation'
import { config } from '@/lib/config'
import { D, O } from '@/lib/fp'
import http from '@/lib/http'
import Logger from '@/lib/logger'
import { optimizeImage } from '@/lib/optimizer'

const logger = Logger.get('image optimize')

export const paramsDecoder = (params: any) => ({
  url: pipe(D.string.decode(params.url), O.fromEither, O.toUndefined),
  width: pipe(NumberFromString.decode(params.w), O.fromEither, O.toUndefined),
  height: pipe(NumberFromString.decode(params.h), O.fromEither, O.toUndefined),
  quality: pipe(
    NumberFromString.decode(params.q),
    O.fromEither,
    O.getOrElse(() => 75),
  ),
})

const router = Router()
router.get('/', async (req, res) => {
  const { query, headers } = req
  const params = paramsDecoder(query)
  if (!params.url) {
    res.writeHead(400)
    return res.end('Missing url parameter')
  }

  let imageUrl: URL
  try {
    imageUrl = new URL(params.url)
  } catch (err) {
    res.writeHead(400)
    return res.end(err.message || 'Invalid URL')
  }

  const allowDomains = config.domains ?? []
  if (!allowDomains.includes(imageUrl.hostname)) {
    res.writeHead(400)
    return res.end('Domain not allowed')
  }

  const { accept } = headers
  const acceptFormats =
    accept
      ?.split(',')
      .map((e) => e.split(';'))
      .flat()
      .filter((e) => e.startsWith('image/'))
      .filter((e) => supportedTargetFormats.includes(e)) ?? []
  const targetFormat = acceptFormats[0] ?? 'image/jpeg'

  const cacheKey = { ...params, targetFormat }

  try {
    await cacheWithRevalidation({
      cacheKey,
      revalidate: async () => {
        const { data, headers: imageHeaders } = await http.get(
          config.urlParser(imageUrl.toString()),
          {
            responseType: 'stream',
          },
        )
        const contentType = imageHeaders['content-type']
        if (!contentType || !supportedFormats.includes(contentType)) {
          return ['Unsupported format']
        }

        if (returnOriginalFormats.includes(contentType)) {
          return [null, data]
        }

        const transformer = optimizeImage({
          contentType: targetFormat,
          width: params.width,
          height: params.height,
          quality: params.quality,
        })
        data.pipe(transformer)
        const stream = transformer.pipe(new PassThrough())
        return [null, stream]
      },
      callback: (cacheStatus, data) =>
        new Promise<void>((resolve) => {
          res.writeHead(200, {
            'Content-Type': targetFormat,
            'Cache-Control': 'public, max-age=31536000, must-revalidate',
            'x-image-cache': cacheStatus.toUpperCase(),
          })
          logger.info(
            `[${cacheStatus.toUpperCase()}] ${params.url}, W:${
              params.width
            }, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
          )
          data.pipe(res)
          data.on('end', resolve)
        }),
    })
  } catch (err) {
    logger.error(
      `${err.message} ${params.url}, W:${params.width}, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
    )
    if (!res.headersSent) {
      res.writeHead(500)
      res.end('Internal server error')
    }
  }
})

export default router
