export type RequestParams = {
  url: string
  width?: number
  height?: number
  quality?: number
}

export type CachaParams = RequestParams & {
  targetFormat: string
}

export type ImageFormat =
  | 'jpg'
  | 'jpeg'
  | 'webp'
  | 'avif'
  | 'png'
  | 'gif'
  | 'svg'
  | 'apng'
