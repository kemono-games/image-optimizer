import { isAxiosError } from 'axios'

import { config } from '@/lib/config'
import http from '@/lib/http'
import redisClient from '@/lib/redis'

export const isValidVideoId = (id: string) => /^[a-zA-Z0-9_-]+$/.test(id)

const thumbnailUrl = (id: string, name: string) =>
  `https://${config.youtube.thumbnailHost}/vi/${id}/${name}.jpg`

const resolvedKey = (id: string) => `youtube_thumbnail:v1:${id}`

// 优先 maxresdefault，不存在时降级到 hqdefault；都不存在返回 null
export const resolveThumbnailUrl = async (
  id: string,
): Promise<string | null> => {
  const cached = await redisClient.get(resolvedKey(id))
  if (cached) return cached

  const candidates = [
    thumbnailUrl(id, 'maxresdefault'),
    thumbnailUrl(id, 'hqdefault'),
  ]
  // 只有上游明确 404 时才缓存降级结果，避免偶发超时把 hq 缓存下来
  let definitive = true
  for (const url of candidates) {
    try {
      await http.head(url)
      if (definitive) {
        await redisClient.set(resolvedKey(id), url, 'EX', 60 * 60 * 24)
      }
      return url
    } catch (err) {
      if (!isAxiosError(err) || err.response?.status !== 404) {
        definitive = false
      }
    }
  }
  return null
}
