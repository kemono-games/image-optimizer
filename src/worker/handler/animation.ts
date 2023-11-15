import { Router } from 'express'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import { CreateReadStreamOptions } from 'fs/promises'
import { PassThrough } from 'node:stream'

import { getWithCache } from '@/lib/cache'
import { config } from '@/lib/config'
import { D, E } from '@/lib/fp'
import Logger from '@/lib/logger'

const logger = Logger.get('animation optimize')

const optimize =
  (url: string, format: 'mp4' | 'webm') =>
  async (): Promise<[null, PassThrough]> => {
    const command = ffmpeg(url)
      .setFfprobePath(config.gifOptimize.ffprobePath)
      .setFfmpegPath(config.gifOptimize.ffmpegPath)
      .noAudio()
      .format(format)
    const stream =
      format === 'mp4'
        ? command
            .videoCodec('libx264')
            .outputOptions([
              '-pix_fmt yuv420p',
              '-movflags +faststart',
              '-movflags frag_keyframe+empty_moov',
              "-filter:v crop='floor(in_w/2)*2:floor(in_h/2)*2'",
            ])
            .pipe()
        : command
            .videoCodec('libvpx-vp9')
            .outputOptions(['-b:v 0', '-crf 40'])
            .pipe()
    return [null, stream]
  }
