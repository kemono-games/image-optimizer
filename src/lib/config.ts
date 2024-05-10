import userConfig from '../../optimizer.config'
import defaultConfig from '../../optimizer.config.example'

export const config = { ...defaultConfig, ...userConfig }
export const shouldUseOssCompressionForAvif = (url: URL) =>
  config.avif.support &&
  config.avif.avifCompressionByOSS &&
  config.avif.ossDomains.includes(url.hostname) &&
  !url.searchParams.has('x-oss-process')
