import { Router } from 'express'
import { pipe } from 'fp-ts/lib/function'
import { NumberFromString } from 'io-ts-types'
import hash from 'object-hash'

import { formatToMimeMap, mimeToFormatMap, supportedTargetFormats } from '@/consts'
import { getWithCache } from '@/lib/cache'
import { config } from '@/lib/config'
import { D, E, O } from '@/lib/fp'
import Logger from '@/lib/logger'

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
      w: pipe(NumberFromString.decode(params.w), O.fromEither, O.toUndefined),
      h: pipe(NumberFromString.decode(params.h), O.fromEither, O.toUndefined),
      q: pipe(
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
  const targetFormat = mimeToFormatMap[acceptFormats[0]] ?? 'jpg'

  const cacheKey = hash({ ...params, targetFormat })

  try {
    const payload = {
      cacheKey,
      type: 'image' as const,
      params: {
        format: targetFormat,
        ...params,
      },
    }
    const [cacheStatus, cachePath, age] = await getWithCache(payload, 15)
    logger.info(
      `[${cacheStatus.toUpperCase()}] ${params.url}, W:${params.w}, H:${
        params.h
      }, Q:${params.q}, ${targetFormat}`,
    )
    return res.sendFile(cachePath, {
      headers: {
        'Content-Type': formatToMimeMap[targetFormat],
        'Cache-Control': 'public, max-age=31536000, must-revalidate',
        'X-Image-Cache': cacheStatus.toUpperCase(),
        'X-Image-Age': `${age}`,
      },
    })
  } catch (err) {
    logger.error(
      `${err.message} ${params.url}, W:${params.w}, H:${params.h}, Q:${params.q}, ${targetFormat}`,
    )
    if (!res.headersSent) {
      res.writeHead(500)
      res.end('Internal server error')
    }
  }
})

export default router
