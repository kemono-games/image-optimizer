import { Router } from 'express'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import multer from 'multer'
import os from 'os'
import path from 'path'

import { config } from '@/lib/config'
import { D, E } from '@/lib/fp'
import http from '@/lib/http'
import Logger from '@/lib/logger'

const logger = Logger.get('ffprobe')

const router = Router()

// Multer 配置 - 磁盘存储，限制 3KB
const upload = multer({
  storage: multer.diskStorage({}),
  limits: {
    fileSize: 3 * 1024, // 3KB
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

// URL 参数验证
const urlParamsDecoder = D.struct({
  url: D.string,
})

// 视频信息接口
interface VideoInfo {
  codec: string
  resolution: {
    width: number
    height: number
  }
  fps: number
  duration: number
}

// ffprobe metadata 类型定义
interface FfprobeStream {
  codec_type: string
  codec_name: string
  width?: number
  height?: number
  r_frame_rate?: string
}

interface FfprobeFormat {
  duration?: string
}

interface FfprobeMetadata {
  streams?: FfprobeStream[]
  format?: FfprobeFormat
}

// 从 ffprobe metadata 提取视频信息
const extractVideoInfo = (metadata: FfprobeMetadata): VideoInfo => {
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
const analyzeVideoFile = async (filePath: string): Promise<VideoInfo> => {
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
const analyzeVideoBuffer = async (buffer: Buffer): Promise<VideoInfo> => {
  const tempFilePath = path.join(
    os.tmpdir(),
    `ffprobe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  )

  // 将 buffer 写入临时文件
  await fs.promises.writeFile(tempFilePath, buffer)

  // 使用 ffprobe 分析
  const info = await analyzeVideoFile(tempFilePath)

  // 清理临时文件
  await fs.promises.unlink(tempFilePath)

  return info
}

// POST 路由 - 处理文件上传
router.post('/', function (req, res) {
  upload.single('video')(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        error: 'File upload error: ' + err.message,
      })
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: 'Unknown error: ' + err.message,
      })
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      })
    }

    try {
      logger.info(
        `Analyzing uploaded file: ${req.file.originalname}, size: ${req.file.size} bytes`,
      )

      // 直接使用上传的文件路径
      const videoInfo = await analyzeVideoFile(req.file.path)

      res.json({
        success: true,
        data: videoInfo,
      })

      logger.info(
        `Successfully analyzed uploaded file: ${req.file.originalname}`,
      )
    } finally {
      // 清理上传的临时文件
      try {
        await fs.promises.unlink(req.file.path)
      } catch (cleanupError) {
        logger.warn(`Failed to cleanup uploaded file: ${req.file.path}`)
      }
    }
  })
})

// GET 路由 - 处理 URL 参数
router.get('/', async (req, res) => {
  const { query } = req
  const params = urlParamsDecoder.decode(query)

  if (E.isLeft(params)) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid url parameter',
    })
  }

  const { url } = params.right

  // 验证 URL 格式
  const videoUrl = new URL(url)

  // 检查 domain 白名单
  const allowDomains = config.domains ?? []
  if (!allowDomains.includes(videoUrl.hostname)) {
    return res.status(400).json({
      success: false,
      error: 'Domain not allowed',
    })
  }

  logger.info(`Analyzing video from URL: ${url}`)

  // 下载前 1024 字节
  const { data } = await http.get(config.urlParser(videoUrl.toString()), {
    headers: {
      Range: 'bytes=0-2047',
    },
    responseType: 'arraybuffer',
  })

  const buffer = Buffer.from(data)
  const videoInfo = await analyzeVideoBuffer(buffer)

  res.json({
    success: true,
    data: videoInfo,
  })

  logger.info(`Successfully analyzed video from URL: ${url}`)
})

export default router
