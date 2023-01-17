import axios from 'axios'
import { Router } from 'express'
import { pipe } from 'fp-ts/lib/function'
import { NumberFromString } from 'io-ts-types'
import { ReadStream } from 'node:fs'

import { returnOriginalFormats, supportedFormats, supportedTargetFormats } from '@/consts'
import { Cache } from '@/lib/cache'
import { config } from '@/lib/config'
import { D, O } from '@/lib/fp'
import { Locker } from '@/lib/locker'
import { optimizeImage } from '@/lib/optimizer'
import { delay } from '@/lib/utils'

import pkg from '../../package.json'

const client = axios.create({
  headers: {
    'User-Agent': `Kemono Games Image Optimizer/${pkg.version}}`,
    'Accept-Encoding': 'br;q=1.0, gzip;q=0.8, *;q=0.1',
  },
  responseType: 'arraybuffer',
  timeout: 10000,
})

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
  const startTime = Date.now()
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

  const cacheLocker = new Locker({ ...params, targetFormat })
  const cache = new Cache({ ...params, targetFormat })

  const [cached, revalidate] = await cache.get()
  if (cached) {
    console.log(
      `[Hit ${Date.now() - startTime}ms] ${params.url}, W:${params.width}, H:${
        params.height
      }, Q:${params.quality}, ${targetFormat}`,
    )
    res.writeHead(200, {
      'Content-Type': targetFormat,
      'Cache-Control': 'public, max-age=31536000, must-revalidate',
      'x-image-cache': revalidate ? 'REVALIDATED' : 'HIT',
    })
    cached.pipe(res)
  }

  if (cached && !revalidate) {
    // Cache hit and not revalidate
    return
  } else if (cache && revalidate) {
    // Cache hit and revalidate
    if (await cacheLocker.isLocked()) {
      return
    }
  } else {
    // Cache miss
    if (await cacheLocker.isLocked()) {
      let cached: ReadStream | null = null
      while (!cached) {
        await delay(100)
        const [res] = await cache.get()
        cached = res
      }
      res.writeHead(200, {
        'Content-Type': targetFormat,
        'Cache-Control': 'public, max-age=31536000, must-revalidate',
        'x-image-cache': revalidate ? 'REVALIDATED' : 'HIT',
      })
      console.log(
        `[Miss ${Date.now() - startTime}ms] ${params.url}, W:${
          params.width
        }, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
      )
      return cached.pipe(res)
    }
  }

  if (revalidate) {
    console.log(
      `[Revalidating ${Date.now() - startTime}ms] ${params.url}, W:${
        params.width
      }, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
    )
  }

  await cacheLocker.lock()
  try {
    const { data, headers: imageHeaders } = await client.get(
      config.urlParser(imageUrl.toString()),
    )
    const contentType = imageHeaders['content-type']
    if (!contentType || !supportedFormats.includes(contentType)) {
      await cacheLocker.unlock()
      res.writeHead(400, {
        'Content-Type': 'plain/text',
      })
      return res.end('Unsupported format')
    }

    let buffer: Buffer
    let sendContentType: string
    if (returnOriginalFormats.includes(contentType)) {
      buffer = data
      sendContentType = contentType
    } else {
      buffer = await optimizeImage({
        data,
        contentType: targetFormat,
        width: params.width,
        height: params.height,
        quality: params.quality,
      })
      sendContentType = targetFormat
    }
    if (!cached) {
      console.log(
        `[Miss ${Date.now() - startTime}ms] ${params.url}, W:${
          params.width
        }, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
      )
      res.writeHead(200, {
        'Content-Type': sendContentType,
        'Cache-Control': 'public, max-age=31536000, must-revalidate',
        'x-image-cache': 'MISS',
      })
      res.end(buffer)
    }
    await cache.set(buffer)
    console.log(
      `[Updated ${Date.now() - startTime}ms] ${params.url}, W:${
        params.width
      }, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
    )
  } catch (err) {
    console.error(
      `[Error ${Date.now() - startTime}ms] ${err.message} ${params.url}, W:${
        params.width
      }, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
    )
  } finally {
    await cacheLocker.unlock()
  }
})

export default router
