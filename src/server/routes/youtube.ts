import { Router } from 'express'

import { E } from '@/lib/fp'
import Logger from '@/lib/logger'
import { isValidVideoId, resolveThumbnailUrl } from '@/lib/youtube'

import {
  optimizeOptionsDecoder,
  resolveTargetFormat,
  serveOptimizedImage,
} from '../serve-image'

const logger = Logger.get('youtube thumbnail')

const router = Router()
router.get('/:id', async (req, res) => {
  const { id } = req.params
  if (!isValidVideoId(id)) {
    res.writeHead(400)
    return res.end('Invalid video id')
  }

  const _resp = optimizeOptionsDecoder(req.query)
  if (E.isLeft(_resp)) {
    res.writeHead(400)
    return res.end('Bad Input')
  }
  const options = _resp.right

  const targetFormat = resolveTargetFormat(options.format, req.headers.accept)
  if (!targetFormat) {
    res.writeHead(400)
    return res.end('Unsupported format')
  }

  let url: string | null
  try {
    url = await resolveThumbnailUrl(id)
  } catch (err) {
    logger.error(`Resolve thumbnail failed. Id: ${id}`, err)
    res.writeHead(500)
    return res.end('Internal server error')
  }
  if (!url) {
    res.writeHead(404)
    return res.end('Thumbnail not found')
  }

  await serveOptimizedImage(res, { url, fetchUrl: url, options, targetFormat })
})

export default router
