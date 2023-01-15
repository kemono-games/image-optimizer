import axios from 'axios'
import { pipe } from 'fp-ts/lib/function'
import { delay } from 'fp-ts/lib/Task'
import { NumberFromString } from 'io-ts-types'
import http from 'node:http'
import querystring from 'node:querystring'

import pkg from '../package.json'
import { Cache } from './lib/cache'
import { config } from './lib/config'
import { D, O } from './lib/fp'
import { Locker } from './lib/locker'
import { optimizeImage } from './lib/optimizer'

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

const client = axios.create({
  headers: {
    'User-Agent': `Kemono Games Image Optimizer/${pkg.version}}`,
    'Accept-Encoding': 'br;q=1.0, gzip;q=0.8, *;q=0.1',
  },
  responseType: 'arraybuffer',
  timeout: 10000,
})

const server = http.createServer(async (req, res) => {
  const { method, url, headers } = req

  if (method !== 'GET') {
    res.writeHead(405)
    return res.end('Method not allowed')
  }

  const qs = url.split('?')[1] ?? ''
  const params = paramsDecoder(querystring.parse(qs))
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

  const { data } = await client.get(imageUrl.toString())
  const { accept } = headers
  const acceptFormats =
    accept
      ?.split(',')
      .map((e) => e.split(';'))
      .flat()
      .filter((e) => e.startsWith('image/')) ?? []
  const targetFormat = acceptFormats[0] ?? 'image/jpeg'

  res.writeHead(200, {
    'Content-Type': targetFormat,
  })

  const cacheLocker = new Locker({ ...params, targetFormat })
  const cache = new Cache({ ...params, targetFormat })

  while (await cacheLocker.isLocked()) {
    await delay(100)
  }
  const [cached, revalidate] = await cache.get()
  if (cached) {
    console.log(
      `[Hit] ${params.url}, W:${params.width}, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
    )
    cached.pipe(res)
  } else {
    console.log(
      `[Miss] ${params.url}, W:${params.width}, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
    )
  }

  if (revalidate) {
    console.log(
      `[Revalidating] ${params.url}, W:${params.width}, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
    )
  }

  if (!cached || revalidate) {
    await cacheLocker.lock()
    const buffer = await optimizeImage({
      data,
      contentType: targetFormat,
      width: params.width,
      height: params.height,
      quality: params.quality,
    })
    if (!cached) res.end(buffer)
    await cache.set(buffer)
    await cacheLocker.unlock()
    console.log(
      `[Updated] ${params.url}, W:${params.width}, H:${params.height}, Q:${params.quality}, ${targetFormat}`,
    )
  }
})

server.listen(process.env.PORT || '3100')
