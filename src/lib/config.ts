import userConfig from '../../optimizer.config'
import defaultConfig from '../../optimizer.config.example'

export const config = { ...defaultConfig, ...userConfig }
