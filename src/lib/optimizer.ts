import sharp from 'sharp'

import { AVIF, JPEG, PNG, WEBP } from '@/consts'

export async function optimizeImage({
  data,
  contentType,
  quality,
  width,
  height,
}: {
  data: Buffer
  contentType: string
  quality: number
  width?: number
  height?: number
}): Promise<Buffer> {
  const transformer = sharp(data, {
    sequentialRead: true,
  })

  transformer.rotate()

  if (width || height) {
    transformer.resize(width, height, {
      withoutEnlargement: true,
    })
  }

  if (contentType === AVIF) {
    const avifQuality = Math.max(quality - 15, 0)
    transformer.avif({
      effort: 2,
      quality: avifQuality,
      chromaSubsampling: '4:2:0', // same as webp
    })
  } else if (contentType === WEBP) {
    transformer.webp({ quality })
  } else if (contentType === PNG) {
    transformer.png({ quality })
  } else if (contentType === JPEG) {
    transformer.jpeg({ quality })
  }

  const buf = await transformer.toBuffer()
  return buf
}
