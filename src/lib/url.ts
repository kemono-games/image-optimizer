import { config } from '@/lib/config'
import { E } from '@/lib/fp'

const allowProtocols = ['http:', 'https:']

// 校验外部传入的源地址：只允许 http/https，且域名必须在白名单内
export const parseSourceUrl = (url: string): E.Either<string, URL> => {
  let sourceUrl: URL
  try {
    sourceUrl = new URL(url)
  } catch (err) {
    return E.left(err.message || 'Invalid URL')
  }

  if (!allowProtocols.includes(sourceUrl.protocol)) {
    return E.left('Protocol not allowed')
  }

  const allowDomains = config.domains ?? []
  if (!allowDomains.includes(sourceUrl.hostname)) {
    return E.left('Domain not allowed')
  }

  return E.right(sourceUrl)
}
