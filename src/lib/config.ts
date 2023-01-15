import userConfig from '../../optimizer.config'

export const defaultConfig = {
  domains: [],
  cacheDir: './cache',
}

export const config = { ...defaultConfig, ...userConfig }
