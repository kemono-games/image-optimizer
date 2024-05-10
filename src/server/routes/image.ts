import { Router } from 'express'
import { pipe } from 'fp-ts/lib/function'
import fs from 'fs'
import { NumberFromString } from 'io-ts-types'
import { PassThrough } from 'node:stream'

import {
  AVIF,
  returnOriginalFormats,
  supportedFormats,
  supportedTargetFormats,
} from '@/consts'
import { getWithCache } from '@/lib/cache'
import { config, shouldUseOssCompressionForAvif } from '@/lib/config'
import { D, E, O } from '@/lib/fp'
import http from '@/lib/http'
import Logger from '@/lib/logger'
import { optimizeImage } from '@/lib/optimizer'

const logger = Logger.get('image optimize')

const paramsDecoder = (params: any) =>
  pipe(
    pipe(
      D.struct({
        url: D.string,
      }),
      D.intersect(
        D.partial({
          w: D.string,
          h: D.string,
          q: D.string,
        }),
      ),
    ).decode(params),
    E.map((params) => ({
      url: pipe(O.some(params.url), O.toUndefined),
      width: pipe(
        NumberFromString.decode(params.w),
        O.fromEither,
        O.toUndefined,
      ),
      height: pipe(
        NumberFromString.decode(params.h),
        O.fromEither,
        O.toUndefined,
      ),
      quality: pipe(
        NumberFromString.decode(params.q),
        O.fromEither,
        O.getOrElse(() => 75),
      ),
    })),
  )

const router = Router()
router.get('/', async (req, res) => {
  const { query, headers } = req
  const _resp = paramsDecoder(query)
  if (E.isLeft(_resp)) {
    res.writeHead(400)
    return res.end('Bad Input')
  }
  const params = _resp.right

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
      ?.replace('jpg', 'jpeg')
      .toLowerCase()
      .split(',')
      .map((e) => e.split(';'))
      .flat()
      .filter((e) => e.startsWith('image/'))
      .filter((e) => supportedTargetFormats.includes(e)) ?? []
  const targetFormat = acceptFormats[0] ?? 'image/jpeg'

  const cacheKey = { ...params, targetFormat }

  try {
    await getWithCache({
      cacheKey,
      async fetcher() {
        if (shouldUseOssCompressionForAvif(imageUrl)) {
          const processStr = ['image', 'auto-orient,1', 'format,avif']
          processStr.push(`quality,q_${params.quality}`)
          const resize = []
          if (params.width || params.height) {
            resize.push('resize', 'm_lfit')
            if (params.width) resize.push(`w_${params.width}`)
            if (params.height) resize.push(`h_${params.height}`)
            processStr.push(resize.join(','))
          }
          imageUrl.searchParams.set('x-oss-process', processStr.join('/'))
          const { data } = await http.get(
            config.urlParser(imageUrl.toString()),
            {
              responseType: 'stream',
            },
          )
          return [null, data]
        }
        const { data, headers: imageHeaders } = await http.get(
          config.urlParser(imageUrl.toString()),
          {
            responseType: 'stream',
          },
        )
        const contentType = imageHeaders['content-type']
          ?.replace('jpg', 'jpeg')
          .toLowerCase()
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
      callback(cacheStatus, cachePath, age) {
        return new Promise<void>((resolve) => {
          res.writeHead(200, {
            'Content-Type': targetFormat,
            'Cache-Control':
              'public, max-age=31536000, s-max-age=31536000, must-revalidate',
            'x-image-cache': cacheStatus.toUpperCase(),
            'x-image-age': `${age}`,
          })
          logger.info(
            `[${cacheStatus.toUpperCase()}] ${params.url}, W:${
              params.width
            }, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
          )
          const data = fs.createReadStream(cachePath)
          data.pipe(res)
          data.on('end', () => {
            res.end()
            resolve()
          })
        })
      },
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
