import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { AgentWorkspace } from '@ai-page-builder/shared'
import { getWorkspaceFilesDir } from '../config-paths'
import { logImageSearchInfo, logImageSearchWarn, serializeImageSearchLogError } from './logging'
import { optimizeImageBuffer, type ImageOptimizationMetadata } from './image-optimizer'
import type { FetchLike, FailedDownload, ImageResult, ImageSearchLogger, ImportImagesResult, ImportedImageResult } from './types'
import { DEFAULT_IMAGE_COUNT, DOWNLOAD_TIMEOUT, MIN_IMAGE_SIZE } from './types'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const HEADERS = { 'User-Agent': USER_AGENT }

export interface ImportImagesToWorkspaceOptions {
  now?: () => number
  uuidFn?: () => string
  logger?: ImageSearchLogger
}

export interface ImportImagesToWorkspaceInput {
  images: ImageResult[]
  count?: number
}

type BinaryImageBuffer = ArrayBuffer | Uint8Array

function toDataView(buffer: BinaryImageBuffer): DataView {
  if (buffer instanceof ArrayBuffer) return new DataView(buffer)
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

function toBytes(buffer: BinaryImageBuffer): Uint8Array {
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer)
  return buffer
}

export function parseImageDimensions(buffer: BinaryImageBuffer): { width: number; height: number } {
  const view = toDataView(buffer)
  const bytes = toBytes(buffer)
  if (view.byteLength < 10) return { width: 0, height: 0 }

  if (view.getUint16(0) === 0xffd8) {
    let offset = 2
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset)
      if (
        marker >= 0xffc0
        && marker <= 0xffcf
        && marker !== 0xffc4
        && marker !== 0xffc8
        && marker !== 0xffcc
      ) {
        if (offset + 9 > view.byteLength) return { width: 0, height: 0 }
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        }
      }
      const segmentLength = view.getUint16(offset + 2)
      if (segmentLength <= 0) break
      offset += 2 + segmentLength
    }
  }

  if (view.byteLength >= 24) {
    if (view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
      return {
        width: view.getUint32(16),
        height: view.getUint32(20),
      }
    }
  }

  if (view.byteLength >= 10) {
    const magic = String.fromCharCode(...bytes.subarray(0, 6))
    if (magic === 'GIF87a' || magic === 'GIF89a') {
      return {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
      }
    }
  }

  if (view.byteLength >= 30) {
    if (view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
      const chunk = view.getUint32(12)
      if (chunk === 0x56503820) {
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        }
      }
      if (chunk === 0x5650384c) {
        const bits = view.getUint32(21, true)
        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1,
        }
      }
    }
  }

  return { width: 0, height: 0 }
}

function normalizeContentType(contentType: string | null): string | null {
  const normalized = contentType?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized || null
}

function isSvgUrl(url: string): boolean {
  return /\.svg(?:[?#].*)?$/i.test(url)
}

function isSvgResponse(url: string, contentType: string | null): boolean {
  return isSvgUrl(url) || contentType === 'image/svg+xml' || contentType === 'application/svg+xml'
}

function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null
  const values = parts.map((part) => Number(part))
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null
  return values
}

function isUnsafeIPv4(parts: number[]): boolean {
  const a = parts[0]!
  const b = parts[1]!
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

function isUnsafeIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!normalized.includes(':')) return false
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true
  if (normalized.startsWith('fe80:')) return true
  if (/^f[cd][0-9a-f]?:/i.test(normalized)) return true
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    const ipv4 = parseIPv4(mapped)
    return ipv4 ? isUnsafeIPv4(ipv4) : true
  }
  return false
}

export function assertSafeHttpImageUrl(rawUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`不安全的图片地址: ${rawUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`不安全的图片地址协议: ${parsed.protocol}`)
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error(`不安全的图片地址主机: ${hostname}`)
  }

  const ipv4 = parseIPv4(hostname)
  if (ipv4 && isUnsafeIPv4(ipv4)) {
    throw new Error(`不安全的图片地址主机: ${hostname}`)
  }

  if (isUnsafeIPv6(hostname)) {
    throw new Error(`不安全的图片地址主机: ${hostname}`)
  }
}

export function isSupportedImageMagic(buffer: BinaryImageBuffer): boolean {
  const view = toDataView(buffer)
  const bytes = toBytes(buffer)
  if (view.byteLength >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) return true
  if (view.byteLength >= 2 && view.getUint16(0) === 0xffd8) return true
  if (view.byteLength >= 2 && view.getUint16(0, true) === 0x4d42) return true
  if (view.byteLength >= 12 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) return true
  if (view.byteLength >= 6) {
    const signature = String.fromCharCode(...bytes.subarray(0, 6))
    if (signature === 'GIF87a' || signature === 'GIF89a') return true
  }
  if (view.byteLength >= 16) {
    const signature = String.fromCharCode(...bytes.subarray(4, 16))
    if (signature.includes('ftyp') && (signature.includes('avif') || signature.includes('avis'))) return true
  }
  return false
}

function resolveImageExtension(downloadUrl: string, contentType: string | null): string {
  switch (contentType) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    case 'image/bmp':
      return '.bmp'
    case 'image/avif':
      return '.avif'
    default:
      break
  }

  const explicit = extname(new URL(downloadUrl).pathname).toLowerCase()
  return explicit && /^\.[a-z0-9]+$/.test(explicit) && explicit !== '.svg' ? explicit : '.jpg'
}

async function trackDownloadIfNeeded(
  fetchFn: FetchLike,
  image: ImageResult,
  logger?: ImageSearchLogger,
): Promise<void> {
  if (!image.downloadTrackingUrl) return
  logImageSearchInfo(logger, 'download_tracking_start', {
    provider: image.provider,
    downloadTrackingUrl: image.downloadTrackingUrl,
    sourcePage: image.sourcePage,
  })
  try {
    assertSafeHttpImageUrl(image.downloadTrackingUrl)
    const response = await fetchFn(image.downloadTrackingUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
    })
    logImageSearchInfo(logger, 'download_tracking_success', {
      provider: image.provider,
      downloadTrackingUrl: image.downloadTrackingUrl,
      status: response.status,
      ok: response.ok,
    })
  } catch (error) {
    logImageSearchWarn(logger, 'download_tracking_failed', {
      provider: image.provider,
      downloadTrackingUrl: image.downloadTrackingUrl,
      error: serializeImageSearchLogError(error),
    })
    // Tracking is best-effort; a failed tracking call must not block importing usable images.
  }
}

async function fetchImageBuffer(
  fetchFn: FetchLike,
  image: ImageResult,
  logger?: ImageSearchLogger,
): Promise<{ buffer: Buffer; width: number; height: number; extension: string; contentType: string | null; byteLength: number; optimization: ImageOptimizationMetadata }> {
  const downloadUrl = image.downloadUrl || image.url
  assertSafeHttpImageUrl(downloadUrl)
  if (isSvgUrl(downloadUrl)) throw new Error('拒绝导入 SVG 图片')

  await trackDownloadIfNeeded(fetchFn, image, logger)

  const response = await fetchFn(downloadUrl, {
    headers: HEADERS,
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
  })
  const finalUrl = response.url || downloadUrl
  assertSafeHttpImageUrl(finalUrl)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const contentType = normalizeContentType(response.headers.get('content-type'))
  if (isSvgResponse(finalUrl, contentType)) throw new Error('拒绝导入 SVG 图片')
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`响应不是图片（content-type: ${contentType}）`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength < 1024) throw new Error('图片文件过小')
  if (!isSupportedImageMagic(buffer)) throw new Error(contentType ? `响应不是图片（content-type: ${contentType}）` : '响应不是图片')

  const parsedDimensions = parseImageDimensions(buffer)
  const width = parsedDimensions.width || image.width || 0
  const height = parsedDimensions.height || image.height || 0
  if (width > 0 && width < MIN_IMAGE_SIZE) throw new Error(`图片尺寸过小（${width}x${height}）`)
  if (height > 0 && height < MIN_IMAGE_SIZE) throw new Error(`图片尺寸过小（${width}x${height}）`)

  const optimized = await optimizeImageBuffer({
    buffer,
    width,
    height,
    extension: resolveImageExtension(finalUrl, contentType),
    contentType,
    logger,
  })

  return {
    buffer: optimized.buffer,
    width: optimized.width,
    height: optimized.height,
    extension: optimized.extension,
    contentType: optimized.contentType,
    byteLength: optimized.byteLength,
    optimization: optimized.optimization,
  }
}

function toFailedDownload(image: ImageResult, error: unknown): FailedDownload {
  return {
    downloadUrl: image.downloadUrl || image.url,
    provider: image.provider,
    sourcePage: image.sourcePage,
    error: error instanceof Error ? error.message : String(error),
  }
}

export async function importImagesToWorkspace(
  workspace: AgentWorkspace,
  fetchFn: FetchLike,
  input: ImportImagesToWorkspaceInput,
  options: ImportImagesToWorkspaceOptions = {},
): Promise<ImportImagesResult> {
  const targetCount = Math.max(1, Math.trunc(input.count ?? DEFAULT_IMAGE_COUNT))
  const now = options.now ?? Date.now
  const uuidFn = options.uuidFn ?? randomUUID
  const logger = options.logger
  const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
  const assetsDir = join(workspaceFilesDir, 'assets')
  mkdirSync(assetsDir, { recursive: true })

  const imported: ImportedImageResult[] = []
  const failed: FailedDownload[] = []

  for (let index = 0; index < input.images.length; index += 1) {
    if (imported.length >= targetCount) break
    const image = input.images[index]!
    logImageSearchInfo(logger, 'download_candidate_start', {
      index,
      provider: image.provider,
      downloadUrl: image.downloadUrl || image.url,
      sourcePage: image.sourcePage,
      width: image.width,
      height: image.height,
      hasDownloadTrackingUrl: Boolean(image.downloadTrackingUrl),
    })
    try {
      const downloaded = await fetchImageBuffer(fetchFn, image, logger)
      const assetFileName = `page-builder-image-${now()}-${uuidFn()}${downloaded.extension}`
      const assetRelativePath = join('assets', assetFileName)
      const assetPreviewPath = `./assets/${assetFileName}`
      writeFileSync(join(workspaceFilesDir, assetRelativePath), downloaded.buffer)
      imported.push({
        downloadUrl: image.downloadUrl || image.url,
        provider: image.provider,
        sourcePage: image.sourcePage,
        width: downloaded.width,
        height: downloaded.height,
        author: image.author,
        licenseName: image.licenseName,
        licenseUrl: image.licenseUrl,
        attributionText: image.attributionText,
        assetFileName,
        assetRelativePath,
        assetPreviewPath,
      })
      logImageSearchInfo(logger, 'download_candidate_success', {
        index,
        provider: image.provider,
        downloadUrl: image.downloadUrl || image.url,
        sourcePage: image.sourcePage,
        assetFileName,
        assetRelativePath,
        assetPreviewPath,
        width: downloaded.width,
        height: downloaded.height,
        contentType: downloaded.contentType,
        byteLength: downloaded.byteLength,
        optimization: downloaded.optimization,
      })
    } catch (error) {
      const failedItem = toFailedDownload(image, error)
      failed.push(failedItem)
      logImageSearchWarn(logger, 'download_candidate_failed', {
        index,
        failed: failedItem,
        error: serializeImageSearchLogError(error),
      })
    }
  }

  return { imported, failed }
}
