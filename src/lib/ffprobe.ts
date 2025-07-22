import crypto from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import multer from 'multer'
import os from 'os'
import path from 'path'

import { config } from '@/lib/config'
import { FfprobeMetadata, FfprobeStream, VideoInfo } from '@/types'

// Multer 配置 - 磁盘存储，限制 2M
export const upload = multer({
  storage: multer.diskStorage({}),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    // fileSize: 20 * 1024 * 1024, // 20MB
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('application/')
    ) {
      cb(null, true)
    } else {
      cb(new Error('Only video files are allowed'))
    }
  },
})

// 从 ffprobe metadata 提取视频信息
export const extractVideoInfo = (metadata: FfprobeMetadata): VideoInfo => {
  const videoStream = metadata.streams?.find(
    (stream: FfprobeStream) => stream.codec_type === 'video',
  )

  if (!videoStream) {
    throw new Error('No video stream found')
  }

  return {
    codec: videoStream.codec_name || 'unknown',
    resolution: {
      width: videoStream.width || 0,
      height: videoStream.height || 0,
    },
    fps:
      parseFloat(videoStream.r_frame_rate?.split('/')[0] || '0') /
        parseFloat(videoStream.r_frame_rate?.split('/')[1] || '1') || 0,
    duration: parseFloat(metadata.format?.duration || '0') || 0,
  }
}

// 从文件路径分析视频信息
export const analyzeVideoFile = async (
  filePath: string,
): Promise<VideoInfo> => {
  // 使用 ffprobe 分析
  const info = await new Promise<VideoInfo>((resolve, reject) => {
    ffmpeg.setFfprobePath(config.gifOptimize.ffprobePath)
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err)
      } else {
        const videoInfo = extractVideoInfo(metadata)
        resolve(videoInfo)
      }
    })
  })

  return info
}

// 从 buffer 分析视频信息
export const analyzeVideoBuffer = async (
  buffer: Buffer,
): Promise<VideoInfo> => {
  const tempFilePath = path.join(
    os.tmpdir(),
    `ffprobe-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
  )

  // 将 buffer 写入临时文件
  await fs.promises.writeFile(tempFilePath, buffer)

  // 使用 ffprobe 分析
  const info = await analyzeVideoFile(tempFilePath)

  // 清理临时文件
  await fs.promises.unlink(tempFilePath)

  return info
}
