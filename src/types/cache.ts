import { PassThrough } from 'stream'
import {
  CacheParams,
  ImageCacheParams,
  AnimationCacheParams,
  FfprobeCacheParams,
} from './index'

// 根据缓存参数类型推导存储的数据类型
export type CacheDataType<T extends CacheParams> = T extends
  | ImageCacheParams
  | AnimationCacheParams
  ? string // 文件路径
  : T extends FfprobeCacheParams
  ? any // JSON 数据
  : never

// 根据缓存参数类型推导 fetcher 返回类型
export type FetcherReturnType<T extends CacheParams> = T extends
  | ImageCacheParams
  | AnimationCacheParams
  ? [string] | [null, PassThrough]
  : T extends FfprobeCacheParams
  ? any
  : never

// 缓存策略接口
export interface CacheStrategy<T> {
  get(): Promise<[T | null, number]>
  set(data: T): Promise<void>
}

// 缓存状态
export type CacheStatus = 'hit' | 'miss'

// getWithCache 的选项类型
export interface CacheOptions<T extends CacheParams> {
  cacheKey: T
  fetcher: () => Promise<FetcherReturnType<T>>
  callback: (
    cacheStatus: CacheStatus,
    data: CacheDataType<T>,
    age: number,
  ) => Promise<void>
}
