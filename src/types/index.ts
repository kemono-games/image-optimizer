export type RequestParams = {
  url: string
  width?: number
  height?: number
  quality?: number
}

export type CachaParams = RequestParams & {
  targetFormat: string
}
