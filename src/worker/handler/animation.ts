import ffmpeg from 'fluent-ffmpeg'
import { PassThrough } from 'node:stream'

import { config } from '@/lib/config'

export async function optimizeAnimation(
  url: string,
  format: 'mp4' | 'webm',
): Promise<[null, PassThrough]> {
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
