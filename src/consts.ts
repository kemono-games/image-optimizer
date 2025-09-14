import { config } from './lib/config'

export const AVIF = 'image/avif'
export const WEBP = 'image/webp'
export const PNG = 'image/png'
export const JPEG = 'image/jpeg'
export const GIF = 'image/gif'
export const SVG = 'image/svg+xml'
export const APNG = 'image/apng'

export const formatToMime = {
  avif: AVIF,
  webp: WEBP,
  png: PNG,
  jpg: JPEG,
  jpeg: JPEG,
  gif: GIF,
  svg: SVG,
  apng: APNG,
}

export const supportedFormats = [AVIF, WEBP, PNG, JPEG, GIF, SVG, APNG]

export const supportedTargetFormats = [WEBP, PNG, JPEG]
if (config.avif) supportedTargetFormats.push(AVIF)

export const returnOriginalFormats = [SVG]
