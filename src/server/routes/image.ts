import { Router } from 'express'

import { config } from '@/lib/config'
import { D, E } from '@/lib/fp'

import {
  optimizeOptionsDecoder,
  resolveTargetFormat,
  serveOptimizedImage,
} from '../serve-image'

const router = Router()
router.get('/', async (req, res) => {
  const { query, headers } = req
  const _url = D.string.decode(query.url)
  const _resp = optimizeOptionsDecoder(query)
  if (E.isLeft(_url) || E.isLeft(_resp)) {
    res.writeHead(400)
    return res.end('Bad Input')
  }
  const url = _url.right
  const options = _resp.right

  if (!url) {
    res.writeHead(400)
    return res.end('Missing url parameter')
  }

  let imageUrl: URL
  try {
    imageUrl = new URL(url)
  } catch (err) {
    res.writeHead(400)
    return res.end(err.message || 'Invalid URL')
  }

  const allowDomains = config.domains ?? []
  if (!allowDomains.includes(imageUrl.hostname)) {
    res.writeHead(400)
    return res.end('Domain not allowed')
  }

  const targetFormat = resolveTargetFormat(options.format, headers.accept)
  if (!targetFormat) {
    res.writeHead(400)
    return res.end('Unsupported format')
  }

  await serveOptimizedImage(res, {
    url,
    fetchUrl: config.urlParser(imageUrl.toString()),
    options,
    targetFormat,
  })
})

export default router
