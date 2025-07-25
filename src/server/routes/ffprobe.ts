import { Router } from 'express'
import fs from 'fs'
import multer from 'multer'

import { getWithCache } from '@/lib/cache'
import { config } from '@/lib/config'
import { analyzeVideoBuffer, analyzeVideoFile, upload } from '@/lib/ffprobe'
import { D, E } from '@/lib/fp'
import http from '@/lib/http'
import Logger from '@/lib/logger'
import { FfprobeCacheParams } from '@/types'

const logger = Logger.get('ffprobe')

const router = Router()

// URL 参数验证
const urlParamsDecoder = D.struct({
  url: D.string,
})

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
  let videoUrl: URL
  try {
    videoUrl = new URL(url)
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format',
    })
  }

  // 检查 domain 白名单
  const allowDomains = config.domains ?? []
  if (!allowDomains.includes(videoUrl.hostname)) {
    return res.status(400).json({
      success: false,
      error: 'Domain not allowed',
    })
  }

  const cacheKey: FfprobeCacheParams = {
    url,
    type: 'ffprobe',
  }

  try {
    await getWithCache({
      cacheKey,
      async fetcher() {
        logger.info(`Analyzing video from URL: ${url}`)

        // 先发送 HEAD 请求获取 content-type
        const headResponse = await http.head(
          config.urlParser(videoUrl.toString()),
        )
        const contentType = headResponse.headers['content-type'] || ''

        // 根据 content-type 确定下载范围
        let rangeEnd: number
        if (contentType.includes('webm') || contentType.includes('mkv')) {
          rangeEnd = 2047 // 2KB for webm/mkv
          logger.info(`Detected webm/mkv format, using 2KB range`)
        } else {
          rangeEnd = 1048575 // 1MB for mp4 or other formats
          logger.info(
            `Detected mp4 or other format (${contentType}), using 1MB range`,
          )
        }

        // 下载指定范围的字节
        const { data } = await http.get(config.urlParser(videoUrl.toString()), {
          headers: {
            Range: `bytes=0-${rangeEnd}`,
          },
          responseType: 'arraybuffer',
        })

        const buffer = Buffer.from(data)
        const videoInfo = await analyzeVideoBuffer(buffer)

        return videoInfo
      },
      async callback(cacheStatus, videoInfo, age) {
        res.json({
          success: true,
          data: videoInfo,
          cache: {
            status: cacheStatus.toUpperCase(),
            age: age,
          },
        })

        logger.info(
          `[${cacheStatus.toUpperCase()}] ffprobe analysis for: ${url}, age: ${age}s`,
        )
      },
    })
  } catch (err) {
    logger.error(
      `Error analyzing video from URL: ${url}, error: ${err.message}`,
    )
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      })
    }
  }
})

export default router
