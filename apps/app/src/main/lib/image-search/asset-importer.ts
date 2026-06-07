import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { AgentWorkspace } from '@ai-page-builder/shared'
import { getWorkspaceFilesDir } from '../config-paths'
import { logImageSearchInfo, logImageSearchWarn, serializeImageSearchLogError } from './logging'
import type { FetchLike, FailedDownload, ImageResult, ImageSearchLogger, ImportImagesResult, ImportedImageResult } from './types'
import { DEFAULT_IMAGE_COUNT, DOWNLOAD_TIMEOUT, MAX_IMAGE_BYTES, MIN_IMAGE_SIZE } from './types'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const HEADERS = { 'User-Agent': USER_AGENT }

export interface ImportImagesToWorkspaceOptions {
  now?: () => number
  uuidFn?: () => string
  maxImageBytes?: number
  logger?: ImageSearchLogger
}

export interface ImportImagesToWorkspaceInput {
  images: ImageResult[]
  count?: number
}

export function parseImageDimensions(buffer: ArrayBuffer): { width: number; height: number } {
  if (buffer.byteLength < 10) return { width: 0, height: 0 }
  const view = new DataView(buffer)

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

  if (buffer.byteLength >= 24) {
    if (view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
      return {
        width: view.getUint32(16),
        height: view.getUint32(20),
      }
    }
  }

  if (buffer.byteLength >= 10) {
    const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 6))
    if (magic === 'GIF87a' || magic === 'GIF89a') {
      return {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
      }
    }
  }

  if (buffer.byteLength >= 30) {
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

function assertSafeHttpUrl(rawUrl: string): void {
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

function isImageMagic(buffer: ArrayBuffer): boolean {
  const view = new DataView(buffer)
  if (view.byteLength >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) return true
  if (view.byteLength >= 2 && view.getUint16(0) === 0xffd8) return true
  if (view.byteLength >= 2 && view.getUint16(0, true) === 0x4d42) return true
  if (view.byteLength >= 12 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) return true
  if (view.byteLength >= 6) {
    const signature = String.fromCharCode(...new Uint8Array(buffer, 0, 6))
    if (signature === 'GIF87a' || signature === 'GIF89a') return true
  }
  if (view.byteLength >= 16) {
    const signature = String.fromCharCode(...new Uint8Array(buffer, 4, 12))
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
    assertSafeHttpUrl(image.downloadTrackingUrl)
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
  maxImageBytes: number,
  logger?: ImageSearchLogger,
): Promise<{ buffer: ArrayBuffer; width: number; height: number; extension: string; contentType: string | null; byteLength: number }> {
  const downloadUrl = image.downloadUrl || image.url
  assertSafeHttpUrl(downloadUrl)
  if (isSvgUrl(downloadUrl)) throw new Error('拒绝导入 SVG 图片')

  await trackDownloadIfNeeded(fetchFn, image, logger)

  const response = await fetchFn(downloadUrl, {
    headers: HEADERS,
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
  })
  const finalUrl = response.url || downloadUrl
  assertSafeHttpUrl(finalUrl)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const contentType = normalizeContentType(response.headers.get('content-type'))
  if (isSvgResponse(finalUrl, contentType)) throw new Error('拒绝导入 SVG 图片')
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`响应不是图片（content-type: ${contentType}）`)
  }

  const contentLength = Number(response.headers.get('content-length') || '0')
  if (contentLength > maxImageBytes) {
    throw new Error(`图片文件过大（${contentLength} bytes）`)
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > maxImageBytes) {
    throw new Error(`图片文件过大（${buffer.byteLength} bytes）`)
  }
  if (buffer.byteLength < 1024) throw new Error('图片文件过小')
  if (!isImageMagic(buffer)) throw new Error(contentType ? `响应不是图片（content-type: ${contentType}）` : '响应不是图片')

  const parsedDimensions = parseImageDimensions(buffer)
  const width = parsedDimensions.width || image.width || 0
  const height = parsedDimensions.height || image.height || 0
  if (width > 0 && width < MIN_IMAGE_SIZE) throw new Error(`图片尺寸过小（${width}x${height}）`)
  if (height > 0 && height < MIN_IMAGE_SIZE) throw new Error(`图片尺寸过小（${width}x${height}）`)

  return {
    buffer,
    width,
    height,
    extension: resolveImageExtension(finalUrl, contentType),
    contentType,
    byteLength: buffer.byteLength,
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
  const maxImageBytes = options.maxImageBytes ?? MAX_IMAGE_BYTES
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
      const downloaded = await fetchImageBuffer(fetchFn, image, maxImageBytes, logger)
      const assetFileName = `page-builder-image-${now()}-${uuidFn()}${downloaded.extension}`
      const assetRelativePath = join('assets', assetFileName)
      const assetPreviewPath = `./assets/${assetFileName}`
      writeFileSync(join(workspaceFilesDir, assetRelativePath), Buffer.from(downloaded.buffer))
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
