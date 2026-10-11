import { Response } from 'express'
import { pipe } from 'fp-ts/lib/function'
import fs from 'fs'
import { NumberFromString } from 'io-ts-types'
import { PassThrough } from 'node:stream'

import {
  JPEG,
  formatToMime,
  returnOriginalFormats,
  supportedFormats,
  supportedTargetFormats,
} from '@/consts'
import { getWithCache } from '@/lib/cache'
import { D, E, O } from '@/lib/fp'
import http from '@/lib/http'
import Logger from '@/lib/logger'
import { optimizeImage } from '@/lib/optimizer'

const logger = Logger.get('image optimize')

export type OptimizeOptions = {
  width?: number
  height?: number
  quality: number
  format?: 'jpg' | 'webp' | 'avif'
}

export const optimizeOptionsDecoder = (params: any) =>
  pipe(
    D.partial({
      w: D.string,
      h: D.string,
      q: D.string,
      format: D.union(D.literal('jpg'), D.literal('webp'), D.literal('avif')),
    }).decode(params),
    E.map(
      (params): OptimizeOptions => ({
        width: pipe(
          NumberFromString.decode(params.w),
          O.fromEither,
          O.toUndefined,
        ),
        height: pipe(
          NumberFromString.decode(params.h),
          O.fromEither,
          O.toUndefined,
        ),
        quality: pipe(
          NumberFromString.decode(params.q),
          O.fromEither,
          O.getOrElse(() => 75),
        ),
        format: params.format,
      }),
    ),
  )

// 优先使用 format 参数，其次使用 Accept header；不支持的 format 返回 null
export const resolveTargetFormat = (
  format: OptimizeOptions['format'],
  accept: string | undefined,
): string | null => {
  if (format) {
    const fmt = formatToMime[format]
    return supportedTargetFormats.includes(fmt) ? fmt : null
  }
  const acceptFormats =
    accept
      ?.replace('jpg', 'jpeg')
      .toLowerCase()
      .split(',')
      .map((e) => e.split(';'))
      .flat()
      .filter((e) => e.startsWith('image/'))
      .filter((e) => supportedTargetFormats.includes(e)) ?? []
  return acceptFormats[0] ?? JPEG
}

export const serveOptimizedImage = async (
  res: Response,
  {
    url,
    fetchUrl,
    options,
    targetFormat,
  }: {
    // 用于缓存 key 与日志
    url: string
    // 实际下载地址
    fetchUrl: string
    options: OptimizeOptions
    targetFormat: string
  },
) => {
  const cacheKey = {
    url,
    width: options.width,
    height: options.height,
    quality: options.quality,
    format: options.format,
    targetFormat,
    type: 'image' as const,
  }

  try {
    await getWithCache({
      cacheKey,
      async fetcher(): Promise<[string] | [null, PassThrough]> {
        const { data, headers: imageHeaders } = await http.get(fetchUrl, {
          responseType: 'stream',
        })
        const contentType = imageHeaders['content-type']
          ?.replace('jpg', 'jpeg')
          .toLowerCase()
        if (!contentType || !supportedFormats.includes(contentType)) {
          return ['Unsupported format']
        }

        if (returnOriginalFormats.includes(contentType)) {
          return [null, data]
        }
        const transformer = optimizeImage({
          sourceFormat: contentType,
          targetFormat,
          width: options.width,
          height: options.height,
          quality: options.quality,
        })
        const stream = new PassThrough()
        // sharp 出错时必须把 error 转发到下游，否则 transformer 上的
        // unhandled 'error' 事件会直接让整个 Node 进程崩溃
        transformer.on('error', (err) => stream.destroy(err))
        data.on('error', (err) => stream.destroy(err))
        data.pipe(transformer)
        transformer.pipe(stream)
        return [null, stream]
      },
      callback(cacheStatus, cachePath, age) {
        return new Promise<void>((resolve) => {
          // Explicit formats are selected by the URL; negotiated formats also
          // vary by Accept. Merge rather than replace any existing Vary fields.
          if (!options.format) res.vary('Accept')
          res.writeHead(200, {
            'Content-Type': targetFormat,
            'Cache-Control':
              'public, max-age=31536000, s-max-age=31536000, immutable',
            'x-image-cache': cacheStatus.toUpperCase(),
            'x-image-age': `${age}`,
          })
          logger.info(
            `[${cacheStatus.toUpperCase()}] ${url}, W:${options.width}, H:${
              options.height
            }, Q:${options.quality}, ${targetFormat}`,
          )
          const data = fs.createReadStream(cachePath as string)
          data.pipe(res)
          data.on('end', () => {
            res.end()
            resolve()
          })
        })
      },
    })
  } catch (err) {
    logger.error(
      `${err.message} ${url}, W:${options.width}, H:${options.height}, Q:${options.quality}, ${targetFormat}`,
    )
    if (!res.headersSent) {
      res.writeHead(500)
      res.end('Internal server error')
    }
  }
}
