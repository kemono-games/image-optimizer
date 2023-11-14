import sharp from 'sharp'
import { PassThrough } from 'stream'

import { returnOriginalFormats, supportedFormats, WEBP } from '@/consts'
import { config } from '@/lib/config'

import http from '../lib/http'

export async function optimizeImage({
  url,
  format,
  quality,
  width,
  height,
}: {
  url: string
  format: 'jpg' | 'webp' | 'avif' | 'png'
  quality: number
  width?: number
  height?: number
}): Promise<[string] | [null, PassThrough]> {
  const { data, headers: imageHeaders } = await http.get(
    config.urlParser(url.toString()),
    {
      responseType: 'stream',
    },
  )
  const remoteContentType = imageHeaders['content-type']
    ?.replace('jpg', 'jpeg')
    .toLowerCase()
  if (!remoteContentType || !supportedFormats.includes(remoteContentType)) {
    return ['Unsupported format']
  }

  if (returnOriginalFormats.includes(remoteContentType)) {
    return [null, data]
  }

  const transformer = sharp({
    pages: 1,
    page: 2,
  })

  transformer.rotate()

  if (width || height) {
    transformer.resize(width, height, {
      withoutEnlargement: true,
    })
  }

  if (format === 'avif') {
    const avifQuality = Math.max(quality - 15, 0)
    transformer.avif({
      effort: 4,
      quality: avifQuality,
      chromaSubsampling: '4:2:0', // same as webp
    })
  } else if (format === 'webp') {
    transformer.webp({ quality })
  } else if (format === 'png') {
    transformer.png({ quality })
  } else if (format === 'jpg') {
    transformer.jpeg({ quality })
  }

  data.pipe(transformer)
  const stream = transformer.pipe(new PassThrough())

  return [null, stream]
}
