require('dotenv').config()
import axios from 'axios'
import { pipe } from 'fp-ts/lib/function'
import { NumberFromString } from 'io-ts-types'
import http from 'node:http'
import querystring from 'node:querystring'
import { PassThrough } from 'node:stream'

import * as cache from '@/lib/cache'

import pkg from '../package.json'
import { config } from './lib/config'
import { D, O } from './lib/fp'
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

  console.log(imageUrl)
  const { data } = await client.get(imageUrl.toString())
  const { accept } = headers
  const acceptFormats =
    accept
      ?.split(',')
      .map((e) => e.split(';'))
      .flat()
      .filter((e) => e.startsWith('image/')) ?? []
  console.log(acceptFormats)
  const targetFormat = acceptFormats[0] ?? 'image/jpeg'

  res.writeHead(200, {
    'Content-Type': targetFormat,
  })

  // const cached = cache.get({ ...params, targetFormat })
  // if (cached) {
  //   return cached.pipe(res)
  // }

  console.log(params)
  const transformer = optimizeImage({
    data,
    contentType: targetFormat,
    width: params.width,
    height: params.height,
    quality: params.quality,
  })

  const stream1 = transformer.pipe(new PassThrough())
  const stream2 = transformer.pipe(new PassThrough())
  stream1.pipe(res)
  stream2.pipe(cache.set({ ...params, targetFormat }))
})

server.listen(process.env.PORT || '3100')
