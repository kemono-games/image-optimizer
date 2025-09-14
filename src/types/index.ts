export type RequestParams = {
  url: string
  width?: number
  height?: number
  quality?: number
}

// 基础缓存参数
export type BaseCacheParams = {
  url: string
  type: string
}

// 图片缓存参数（现有的）
export type ImageCacheParams = BaseCacheParams & {
  type: 'image'
  width?: number
  height?: number
  quality?: number
  targetFormat: string
}

// ffprobe 缓存参数
export type FfprobeCacheParams = BaseCacheParams & {
  type: 'ffprobe'
}

// 动画缓存参数
export type AnimationCacheParams = BaseCacheParams & {
  type: 'animation'
  format: 'mp4' | 'webm'
}

// 通用缓存参数联合类型
export type CacheParams =
  | ImageCacheParams
  | FfprobeCacheParams
  | AnimationCacheParams

// 保持向后兼容
export type CachaParams = ImageCacheParams

// 视频信息接口
export interface VideoInfo {
  codec: string
  resolution: {
    width: number
    height: number
  }
  fps: number
  duration: number
}

// ffprobe metadata 类型定义
export interface FfprobeStream {
  codec_type: string
  codec_name: string
  width?: number
  height?: number
  r_frame_rate?: string
}

export interface FfprobeFormat {
  duration?: string
}

export interface FfprobeMetadata {
  streams?: FfprobeStream[]
  format?: FfprobeFormat
}
