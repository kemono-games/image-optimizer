import { ImageFormat } from './types'

export const AVIF = 'image/avif'
export const WEBP = 'image/webp'
export const PNG = 'image/png'
export const JPEG = 'image/jpeg'
export const GIF = 'image/gif'
export const SVG = 'image/svg+xml'
export const APNG = 'image/apng'

export const supportedFormats = [AVIF, WEBP, PNG, JPEG, GIF, SVG, APNG]
export const supportedTargetFormats = [WEBP, PNG, JPEG]
export const returnOriginalFormats = [SVG]

export const formatToMimeMap: Record<ImageFormat, string> = {
  avif: AVIF,
  webp: WEBP,
  png: PNG,
  jpg: JPEG,
  jpeg: JPEG,
  gif: GIF,
  svg: SVG,
  apng: APNG,
}

export const mimeToFormatMap: Record<string, ImageFormat> = {
  [AVIF]: 'avif',
  [WEBP]: 'webp',
  [PNG]: 'png',
  [JPEG]: 'jpg',
  [GIF]: 'gif',
  [SVG]: 'svg',
  [APNG]: 'apng',
}
