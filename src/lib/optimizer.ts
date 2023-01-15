import sharp, { Sharp } from 'sharp'

import { AVIF, JPEG, PNG, WEBP } from '@/consts'

export function optimizeImage({
  contentType,
  quality,
  width,
  height,
}: {
  contentType: string
  quality: number
  width?: number
  height?: number
}): Sharp {
  const transformer = sharp({
    sequentialRead: true,
  })

  transformer.rotate()

  if (width || height) {
    transformer.resize(width, height, {
      withoutEnlargement: true,
    })
  }

  if (contentType === AVIF) {
    const avifQuality = quality - 15
    transformer.avif({
      quality: Math.max(avifQuality, 0),
      chromaSubsampling: '4:2:0', // same as webp
    })
  } else if (contentType === WEBP) {
    transformer.webp({ quality })
  } else if (contentType === PNG) {
    transformer.png({ quality })
  } else if (contentType === JPEG) {
    transformer.jpeg({ quality })
  }

  return transformer
}
