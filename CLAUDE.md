# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an image optimization service that provides dynamic image resizing, format conversion, and compression through HTTP APIs. It supports converting images to WebP/AVIF formats, resizing them on-demand, and caching results. The service also handles GIF animations by converting them to MP4/WebM.

## Key Architecture Components

### Core Technologies
- **TypeScript** with functional programming patterns using `fp-ts`
- **Sharp** for image processing and optimization
- **Express.js** server with three main endpoints: `/image`, `/animation`, `/ffprobe`
- **Redis** for caching processed images and metadata
- **FFmpeg** for animated GIF to video conversion
- **Docker** containerization with automated CI/CD

### Directory Structure
- `src/bootstrap.ts` - Application entry point with Sentry setup and FFmpeg validation
- `src/server/` - Express server and route handlers
- `src/lib/` - Core utilities (cache, config, optimizer, redis, logger, etc.)
- `optimizer.config.js` - Main configuration file (copy from `optimizer.config.example.js`)

### Configuration System
Configuration is loaded by merging `optimizer.config.example.js` (defaults) with `optimizer.config.js` (user config). Key settings:
- `domains` - Allowed source domains for security
- `cachePath` - Local filesystem cache directory
- `redisConfig` - Redis connection settings
- `avif.support` - Enable/disable AVIF format support
- `gifOptimize` - FFmpeg paths for animation conversion

## Common Development Commands

```bash
# Development
yarn dev                    # Start development server with nodemon
yarn build                  # Build TypeScript to dist/ using SWC
yarn start                  # Run production build

# CLI commands
yarn cli                    # Run CLI scripts with ts-node
```

## API Endpoints

### Image Optimization (`/image`)
- Query params: `url` (required), `w`, `h`, `q` (quality 1-100), `format` (jpg|webp|avif)
- Automatic format detection via `Accept` header if no format specified
- Returns optimized image with proper cache headers

### Animation Conversion (`/animation`)
- Query params: `url` (required), `format` (mp4|webm)
- Converts animated GIFs to video formats using FFmpeg

### Metadata (`/ffprobe`)
- Returns FFprobe metadata for media files

## Image Processing Pipeline

1. **URL Validation** - Check against allowed domains
2. **Cache Check** - Redis and filesystem cache lookup
3. **Download** - Fetch original image via HTTP
4. **Optimization** - Sharp processing with format-specific settings:
   - AVIF: Quality reduced by 25, effort=4, chroma subsampling 4:2:0
   - WebP: Direct quality setting
   - JPEG/PNG: Standard optimization
5. **Caching** - Store processed image with TTL (default 30 days)

## Development Notes

- The codebase uses functional programming patterns extensively with `fp-ts`
- Path aliases: `@/*` maps to `src/*`
- AVIF processing is CPU-intensive (~1-2s) so consider queue implementation for production
- FFmpeg binaries must be available and paths configured correctly
- Redis is required for caching - service won't start without it
- Use `shouldUseOssCompressionForAvif()` helper for OSS-specific AVIF handling

## Docker & Deployment

- Base image: `node:22-alpine`
- Automated builds on master branch push
- Multi-registry deployment (Aliyun AP-Southeast-1 and Shenzhen)
- Environment-specific deployment via GitHub Actions