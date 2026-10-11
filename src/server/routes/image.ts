import { Router } from 'express'

import { config } from '@/lib/config'
import { D, E } from '@/lib/fp'
import { parseSourceUrl } from '@/lib/url'

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

  const imageUrl = parseSourceUrl(url)
  if (E.isLeft(imageUrl)) {
    res.writeHead(400)
    return res.end(imageUrl.left)
  }

  const targetFormat = resolveTargetFormat(options.format, headers.accept)
  if (!targetFormat) {
    res.writeHead(400)
    return res.end('Unsupported format')
  }

  await serveOptimizedImage(res, {
    url,
    fetchUrl: config.urlParser(imageUrl.right.toString()),
    options,
    targetFormat,
  })
})

export default router
