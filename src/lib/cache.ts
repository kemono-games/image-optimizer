import fs from 'fs'
import hash from 'object-hash'
import path from 'path'

import { config } from '@/lib/config'
import { CachaParams } from '@/types'

export const get = (params: CachaParams) => {
  const key = hash(params)
  if (!fs.existsSync(path.join(config.cacheDir, key))) {
    return null
  }
  return fs.createReadStream(path.join(config.cacheDir, key))
}

export const set = (params: CachaParams) => {
  const key = hash(params)
  return fs.createWriteStream(path.join(config.cacheDir, key))
}
