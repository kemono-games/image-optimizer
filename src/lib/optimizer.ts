import sharp from 'sharp'

import { AVIF, GIF, JPEG, PNG, WEBP } from '@/consts'

export function optimizeImage({
  sourceFormat,
  targetFormat,
  quality,
  width,
  height,
  input,
}: {
  sourceFormat: string
  targetFormat: string
  quality: number
  width?: number
  height?: number
  input?: Buffer | Uint8Array | string
}) {
  const transformer =
    sourceFormat === GIF ? sharp({ pages: 1, page: 2 }) : sharp()

  transformer.rotate().toColorspace('srgb')

  if (width || height) {
    transformer.resize(width, height, {
      withoutEnlargement: true,
    })
  }

  if (targetFormat === AVIF) {
    const avifQuality = Math.max(quality - 25, 40)
    transformer
      .avif({
        effort: 4,
        quality: avifQuality,
        chromaSubsampling: '4:2:0', // same as webp
        bitdepth: 8,
      })
      .sharpen({ sigma: 0.5, m1: 0.5, m2: 1.5 })
  } else if (targetFormat === WEBP) {
    transformer.webp({ quality })
  } else if (targetFormat === PNG) {
    transformer.png({ quality })
  } else if (targetFormat === JPEG) {
    transformer.jpeg({ quality })
  }
  return transformer
}
