import sharp from 'sharp'
import { logImageSearchInfo, logImageSearchWarn, serializeImageSearchLogError } from './logging'
import type { ImageSearchLogger } from './types'

export const IMAGE_IMPORT_OPTIMIZE_THRESHOLD_BYTES = 1024 * 1024
export const IMAGE_IMPORT_OPTIMIZE_QUALITIES = [82, 78, 74, 70] as const

export type ImageOptimizationStatus = 'skipped' | 'optimized' | 'fallback' | 'failed'

export interface ImageOptimizationMetadata {
  status: ImageOptimizationStatus
  reason?: string
  originalByteLength: number
  optimizedByteLength?: number
  inputFormat?: string | null
  outputFormat?: string | null
  quality?: number
  width: number
  height: number
}

export interface ImageOptimizationInput {
  buffer: Buffer
  width: number
  height: number
  extension: string
  contentType: string | null
  logger?: ImageSearchLogger
}

export interface ImageOptimizationResult {
  buffer: Buffer
  width: number
  height: number
  extension: string
  contentType: string | null
  byteLength: number
  optimization: ImageOptimizationMetadata
}

export type WebpEncoder = (
  buffer: Buffer,
  quality: number,
) => Promise<{
  buffer: Buffer
  width: number
  height: number
  format: string
}>

export interface ImageOptimizationOptions {
  thresholdBytes?: number
  qualities?: readonly number[]
  encodeWebp?: WebpEncoder
}

function readAscii(buffer: Buffer, start: number, length: number): string {
  if (buffer.byteLength < start + length) return ''
  return buffer.toString('ascii', start, start + length)
}

function isGif(buffer: Buffer, extension: string, contentType: string | null): boolean {
  return contentType === 'image/gif'
    || extension.toLowerCase() === '.gif'
    || readAscii(buffer, 0, 6) === 'GIF87a'
    || readAscii(buffer, 0, 6) === 'GIF89a'
}

function isWebp(buffer: Buffer): boolean {
  return readAscii(buffer, 0, 4) === 'RIFF' && readAscii(buffer, 8, 4) === 'WEBP'
}

function isAnimatedWebp(buffer: Buffer): boolean {
  if (!isWebp(buffer)) return false
  let offset = 12
  while (offset + 8 <= buffer.byteLength) {
    const chunk = readAscii(buffer, offset, 4)
    const size = buffer.readUInt32LE(offset + 4)
    const dataOffset = offset + 8
    if (chunk === 'VP8X' && dataOffset < buffer.byteLength) {
      return Boolean(buffer[dataOffset]! & 0x02)
    }
    if (chunk === 'ANIM' || chunk === 'ANMF') return true
    offset = dataOffset + size + (size % 2)
  }
  return false
}

function isAnimatedPng(buffer: Buffer): boolean {
  if (buffer.byteLength < 16) return false
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return false
  let offset = 8
  while (offset + 8 <= buffer.byteLength) {
    const size = buffer.readUInt32BE(offset)
    const type = readAscii(buffer, offset + 4, 4)
    if (type === 'acTL') return true
    if (type === 'IDAT') return false
    offset += 12 + size
  }
  return false
}

function isAnimatedAvif(buffer: Buffer): boolean {
  if (buffer.byteLength < 16) return false
  const header = buffer.subarray(0, Math.min(buffer.byteLength, 128)).toString('ascii')
  return header.includes('ftypavis') || header.includes('avis')
}

function isAnimatedImage(buffer: Buffer): boolean {
  return isAnimatedWebp(buffer) || isAnimatedPng(buffer) || isAnimatedAvif(buffer)
}

function getInputFormat(contentType: string | null, extension: string): string | null {
  if (contentType?.startsWith('image/')) return contentType.slice('image/'.length)
  const normalized = extension.replace(/^\./, '').trim().toLowerCase()
  return normalized || null
}

function isWebpMagic(buffer: Buffer): boolean {
  return isWebp(buffer)
}

function dimensionsMatch(width: number, height: number, expectedWidth: number, expectedHeight: number): boolean {
  return (expectedWidth <= 0 || width === expectedWidth) && (expectedHeight <= 0 || height === expectedHeight)
}

async function defaultEncodeWebp(buffer: Buffer, quality: number): Promise<Awaited<ReturnType<WebpEncoder>>> {
  const { data, info } = await sharp(buffer, { animated: false, limitInputPixels: false })
    .webp({ quality, effort: 5, smartSubsample: true })
    .toBuffer({ resolveWithObject: true })
  return {
    buffer: data,
    width: info.width,
    height: info.height,
    format: info.format,
  }
}

function buildBaseMetadata(input: ImageOptimizationInput): Omit<ImageOptimizationMetadata, 'status'> {
  return {
    originalByteLength: input.buffer.byteLength,
    inputFormat: getInputFormat(input.contentType, input.extension),
    width: input.width,
    height: input.height,
  }
}

function skippedResult(input: ImageOptimizationInput, reason: string): ImageOptimizationResult {
  const metadata: ImageOptimizationMetadata = {
    status: 'skipped',
    reason,
    ...buildBaseMetadata(input),
  }
  logImageSearchInfo(input.logger, 'image_optimize_skipped', { ...metadata })
  return {
    buffer: input.buffer,
    width: input.width,
    height: input.height,
    extension: input.extension,
    contentType: input.contentType,
    byteLength: input.buffer.byteLength,
    optimization: metadata,
  }
}

function fallbackResult(input: ImageOptimizationInput, reason: string): ImageOptimizationResult {
  const metadata: ImageOptimizationMetadata = {
    status: 'fallback',
    reason,
    ...buildBaseMetadata(input),
  }
  logImageSearchWarn(input.logger, 'image_optimize_fallback', { ...metadata })
  return {
    buffer: input.buffer,
    width: input.width,
    height: input.height,
    extension: input.extension,
    contentType: input.contentType,
    byteLength: input.buffer.byteLength,
    optimization: metadata,
  }
}

export async function optimizeImageBuffer(
  input: ImageOptimizationInput,
  options: ImageOptimizationOptions = {},
): Promise<ImageOptimizationResult> {
  const thresholdBytes = options.thresholdBytes ?? IMAGE_IMPORT_OPTIMIZE_THRESHOLD_BYTES
  const qualities = options.qualities ?? IMAGE_IMPORT_OPTIMIZE_QUALITIES
  const encodeWebp = options.encodeWebp ?? defaultEncodeWebp
  const originalByteLength = input.buffer.byteLength

  if (originalByteLength <= thresholdBytes) {
    return skippedResult(input, 'below_threshold')
  }

  if (isGif(input.buffer, input.extension, input.contentType)) {
    return skippedResult(input, 'gif')
  }

  if (isAnimatedImage(input.buffer)) {
    return skippedResult(input, 'animated_image')
  }

  logImageSearchInfo(input.logger, 'image_optimize_start', {
    ...buildBaseMetadata(input),
    thresholdBytes,
    outputFormat: 'webp',
    qualities,
  })

  try {
    let best: ImageOptimizationResult | null = null
    for (const quality of qualities) {
      const encoded = await encodeWebp(input.buffer, quality)
      const candidateByteLength = encoded.buffer.byteLength
      const candidate = {
        quality,
        originalByteLength,
        optimizedByteLength: candidateByteLength,
        inputFormat: getInputFormat(input.contentType, input.extension),
        outputFormat: encoded.format,
        width: encoded.width,
        height: encoded.height,
        dimensionsMatch: dimensionsMatch(encoded.width, encoded.height, input.width, input.height),
        magicValid: isWebpMagic(encoded.buffer),
      }
      logImageSearchInfo(input.logger, 'image_optimize_candidate', candidate)

      if (!candidate.dimensionsMatch || !candidate.magicValid || candidateByteLength >= originalByteLength) {
        continue
      }

      if (!best || candidateByteLength < best.byteLength) {
        best = {
          buffer: encoded.buffer,
          width: encoded.width,
          height: encoded.height,
          extension: '.webp',
          contentType: 'image/webp',
          byteLength: candidateByteLength,
          optimization: {
            status: 'optimized',
            originalByteLength,
            optimizedByteLength: candidateByteLength,
            inputFormat: getInputFormat(input.contentType, input.extension),
            outputFormat: 'webp',
            quality,
            width: encoded.width,
            height: encoded.height,
          },
        }
      }
    }

    if (best) {
      logImageSearchInfo(input.logger, 'image_optimize_success', { ...best.optimization })
      return best
    }

    return fallbackResult(input, 'no_smaller_candidate')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const metadata: ImageOptimizationMetadata = {
      status: 'failed',
      reason,
      ...buildBaseMetadata(input),
    }
    logImageSearchWarn(input.logger, 'image_optimize_failed', {
      ...metadata,
      error: serializeImageSearchLogError(error),
    })
    return {
      buffer: input.buffer,
      width: input.width,
      height: input.height,
      extension: input.extension,
      contentType: input.contentType,
      byteLength: input.buffer.byteLength,
      optimization: metadata,
    }
  }
}
