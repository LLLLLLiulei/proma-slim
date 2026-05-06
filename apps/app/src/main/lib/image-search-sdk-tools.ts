import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { parseHTML } from 'linkedom'
import { z } from 'zod'
import type { AgentMcpServerConfig, AgentWorkspace } from '@ai-page-builder/shared'
import { getWorkspaceFilesDir } from './config-paths'

export const IMAGE_SEARCH_RUNTIME_SERVER_NAME = 'image_search'
export const IMAGE_SEARCH_TOOL_NAMES = [
  'mcp__image_search__search_images',
  'mcp__image_search__download_images',
] as const

const DEFAULT_IMAGE_COUNT = 5
const MIN_IMAGE_SIZE = 200
const MAX_RETRIES = 3
const REQUEST_TIMEOUT = 10_000
const DIMENSION_TIMEOUT = 5_000
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
] as const

const imageSearchInputSchema = z.strictObject({
  keyword: z.string().min(1),
  count: z.number().int().min(1).max(20).optional(),
  size: z.enum(['small', 'medium', 'large', 'wallpaper']).optional(),
  color: z.enum([
    'color',
    'bw',
    'red',
    'orange',
    'yellow',
    'green',
    'teal',
    'blue',
    'purple',
    'pink',
    'brown',
    'black',
    'gray',
    'white',
  ]).optional(),
  type: z.enum(['photo', 'clipart', 'linedrawing', 'animatedgif', 'transparent']).optional(),
  aspect: z.enum(['square', 'wide', 'tall']).optional(),
  license: z.enum([
    'anyCreativeCommons',
    'publicDomain',
    'freeShareAndUse',
    'freeShareAndUseCommercially',
    'freeModifyShareAndUse',
    'freeModifyShareAndUseCommercially',
  ]).optional(),
})

const imageCandidateSchema = z.strictObject({
  originalUrl: z.string().url(),
  thumbnailUrl: z.string().url().or(z.literal('')),
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  sourcePage: z.string().url().or(z.literal('')),
})

const downloadImagesInputSchema = z.strictObject({
  images: z.array(imageCandidateSchema).min(1),
  count: z.number().int().min(1).max(20).optional(),
})

type SearchImageInput = z.infer<typeof imageSearchInputSchema>
type DownloadImagesInput = z.infer<typeof downloadImagesInputSchema>
type ImageCandidate = z.infer<typeof imageCandidateSchema>

interface SearchResult {
  originalUrl: string
  thumbnailUrl: string
  width: number
  height: number
  sourcePage: string
}

interface ImportedImageResult extends SearchResult {
  assetFileName: string
  assetRelativePath: string
  assetPreviewPath: string
}

interface DownloadFailure {
  originalUrl: string
  error: string
}

interface DownloadedImage {
  image: SearchResult
  buffer: ArrayBuffer
  width: number
  height: number
  resolution: number
  extension: string
}

interface ImageSearchRuntimeToolBundle {
  mcpServer: AgentMcpServerConfig
  allowedTools: string[]
}

export interface BuildImageSearchRuntimeToolBundleOptions {
  workspace: AgentWorkspace
  fetchFn?: typeof fetch
  now?: () => number
  uuidFn?: () => string
}

export function buildImageSearchRuntimeToolBundle(
  options: BuildImageSearchRuntimeToolBundleOptions,
): ImageSearchRuntimeToolBundle {
  const fetchFn = options.fetchFn ?? fetch
  const now = options.now ?? Date.now
  const uuidFn = options.uuidFn ?? randomUUID

  const searchImagesTool = tool(
    'search_images',
    '搜索 Bing 图片并返回过滤、去重后的结构化结果。',
    imageSearchInputSchema as unknown as Readonly<Record<string, z.ZodTypeAny>>,
    async (rawArgs) => {
      const args = imageSearchInputSchema.parse(rawArgs)

      try {
        const items = await searchImages(fetchFn, args)
        return toToolResult({ items })
      } catch (error) {
        throw new Error(`Bing 图片搜索失败: ${toErrorMessage(error)}`)
      }
    },
  )

  const downloadImagesTool = tool(
    'download_images',
    '将选中的图片导入当前 page-builder workspace 的 assets/ 目录，并返回资产路径元数据。',
    downloadImagesInputSchema as unknown as Readonly<Record<string, z.ZodTypeAny>>,
    async (rawArgs) => {
      const args = downloadImagesInputSchema.parse(rawArgs)
      const result = await importImagesToWorkspace(options.workspace, fetchFn, args, {
        now,
        uuidFn,
      })
      return toToolResult(result)
    },
  )

  return {
    mcpServer: createSdkMcpServer({
      name: IMAGE_SEARCH_RUNTIME_SERVER_NAME,
      tools: [searchImagesTool, downloadImagesTool],
    }),
    allowedTools: [...IMAGE_SEARCH_TOOL_NAMES],
  }
}

async function searchImages(fetchFn: typeof fetch, input: SearchImageInput): Promise<SearchResult[]> {
  const count = input.count ?? DEFAULT_IMAGE_COUNT
  const query = encodeURIComponent(input.keyword)
  const qft = buildFilterQuery(input)
  const searchUrl = `https://www.bing.com/images/search?q=${query}&first=1&count=${Math.min(count * 2, 35)}${qft ? `&qft=${encodeURIComponent(qft)}` : ''}`
  const html = await fetchTextWithRetry(fetchFn, searchUrl)
  const results = parseSearchResults(html, count)

  return Promise.all(results.map(async (result) => {
    if (result.width > 0 && result.height > 0) {
      return result
    }

    const dimensions = await fetchImageDimensions(fetchFn, result.originalUrl)
    return {
      ...result,
      width: dimensions.width,
      height: dimensions.height,
    }
  }))
}

async function importImagesToWorkspace(
  workspace: AgentWorkspace,
  fetchFn: typeof fetch,
  input: DownloadImagesInput,
  options: {
    now: () => number
    uuidFn: () => string
  },
): Promise<{
  imported: ImportedImageResult[]
  failed: DownloadFailure[]
}> {
  const requestedCount = input.count ?? DEFAULT_IMAGE_COUNT
  const downloaded = await Promise.all(input.images.map(async (image) => {
    return downloadImage(fetchFn, image)
  }))

  const candidates: DownloadedImage[] = []
  const failed: DownloadFailure[] = []

  for (let index = 0; index < downloaded.length; index += 1) {
    const current = downloaded[index]
    const image = input.images[index]!
    if (!current) {
      continue
    }

    if ('error' in current) {
      failed.push({
        originalUrl: image.originalUrl,
        error: current.error,
      })
      continue
    }

    if (current.width < MIN_IMAGE_SIZE || current.height < MIN_IMAGE_SIZE) {
      failed.push({
        originalUrl: image.originalUrl,
        error: `图片尺寸过小（${current.width}x${current.height}）`,
      })
      continue
    }

    candidates.push(current)
  }

  const selected = candidates
    .sort((left, right) => right.resolution - left.resolution)
    .slice(0, requestedCount)

  const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
  const assetsDir = join(workspaceFilesDir, 'assets')
  mkdirSync(assetsDir, { recursive: true })

  const imported: ImportedImageResult[] = []
  for (const item of selected) {
    if (!item) {
      continue
    }
    const assetFileName = `page-builder-image-${options.now()}-${options.uuidFn()}${item.extension}`
    const assetRelativePath = join('assets', assetFileName)
    const assetPreviewPath = `./assets/${assetFileName}`

    try {
      writeFileSync(join(workspaceFilesDir, assetRelativePath), Buffer.from(item.buffer))
      imported.push({
        ...item.image,
        width: item.width,
        height: item.height,
        assetFileName,
        assetRelativePath,
        assetPreviewPath,
      })
    } catch (error) {
      failed.push({
        originalUrl: item.image.originalUrl,
        error: `写入工作区 assets 失败: ${toErrorMessage(error)}`,
      })
    }
  }

  return {
    imported,
    failed,
  }
}

async function downloadImage(
  fetchFn: typeof fetch,
  image: ImageCandidate,
): Promise<DownloadedImage | { error: string }> {
  try {
    const response = await fetchFn(image.originalUrl, {
      method: 'GET',
      headers: {
        'User-Agent': pickUserAgent(),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    })

    if (!response.ok) {
      return { error: `HTTP ${response.status}` }
    }

    const contentType = normalizeContentType(response.headers.get('content-type'))
    const buffer = await response.arrayBuffer()
    if (!isLikelyImagePayload(buffer, contentType)) {
      return {
        error: contentType
          ? `响应不是图片（content-type: ${contentType}）`
          : '响应不是图片',
      }
    }

    const parsedDimensions = parseImageDimensions(buffer)
    const width = parsedDimensions.width || image.width
    const height = parsedDimensions.height || image.height

    return {
      image,
      buffer,
      width,
      height,
      resolution: width * height,
      extension: resolveImageExtension(image.originalUrl, contentType),
    }
  } catch (error) {
    return {
      error: toErrorMessage(error),
    }
  }
}

async function fetchTextWithRetry(fetchFn: typeof fetch, url: string): Promise<string> {
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchFn(url, {
        method: 'GET',
        headers: {
          'User-Agent': pickUserAgent(),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.text()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function fetchImageDimensions(
  fetchFn: typeof fetch,
  imageUrl: string,
): Promise<{ width: number; height: number }> {
  try {
    const response = await fetchFn(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': pickUserAgent(),
        Range: 'bytes=0-65536',
      },
      signal: AbortSignal.timeout(DIMENSION_TIMEOUT),
    })

    if (!response.ok) {
      return { width: 0, height: 0 }
    }

    const buffer = await response.arrayBuffer()
    return parseImageDimensions(buffer)
  } catch {
    return { width: 0, height: 0 }
  }
}

function parseSearchResults(html: string, maxCount: number): SearchResult[] {
  const { document } = parseHTML(html)
  const anchors = Array.from(document.querySelectorAll('a.iusc'))
  const seen = new Set<string>()
  const results: SearchResult[] = []

  for (const anchor of anchors) {
    if (results.length >= maxCount) {
      break
    }

    const payload = anchor.getAttribute('m')
    if (!payload) {
      continue
    }

    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      const originalUrl = typeof parsed.murl === 'string' ? parsed.murl : ''
      if (!originalUrl || seen.has(originalUrl) || isSvgUrl(originalUrl)) {
        continue
      }

      seen.add(originalUrl)
      results.push({
        originalUrl,
        thumbnailUrl: typeof parsed.turl === 'string' ? parsed.turl : '',
        width: normalizePositiveNumber(parsed.tw),
        height: normalizePositiveNumber(parsed.th),
        sourcePage: typeof parsed.purl === 'string' ? parsed.purl : '',
      })
    } catch {
      continue
    }
  }

  return results
}

function parseImageDimensions(buffer: ArrayBuffer): { width: number; height: number } {
  const view = new DataView(buffer)

  if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
    }
  }

  if (view.byteLength >= 10) {
    const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 6))
    if (magic === 'GIF87a' || magic === 'GIF89a') {
      return {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
      }
    }
  }

  if (view.byteLength >= 30 && view.getUint16(0) === 0xffd8) {
    let offset = 2
    while (offset < view.byteLength - 9) {
      const marker = view.getUint16(offset)
      if (
        marker >= 0xffc0
        && marker <= 0xffcf
        && marker !== 0xffc4
        && marker !== 0xffc8
        && marker !== 0xffcc
      ) {
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        }
      }

      const segmentLength = view.getUint16(offset + 2)
      if (segmentLength <= 0) {
        break
      }
      offset += 2 + segmentLength
    }
  }

  if (view.byteLength >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
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

  return { width: 0, height: 0 }
}

function buildFilterQuery(filters: Omit<SearchImageInput, 'keyword' | 'count'>): string {
  const parts: string[] = []
  if (filters.size) parts.push(`filterui:imagesize-${filters.size}`)
  if (filters.color) parts.push(`filterui:${COLOR_MAP[filters.color]}`)
  if (filters.type) parts.push(`filterui:photo-${filters.type}`)
  if (filters.aspect) parts.push(`filterui:aspect-${filters.aspect}`)
  if (filters.license) parts.push(`filterui:${LICENSE_MAP[filters.license]}`)
  return parts.length > 0 ? `+${parts.join('+')}` : ''
}

function isSvgUrl(url: string): boolean {
  return /\.svg(?:[?#].*)?$/i.test(url)
}

function normalizePositiveNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0
}

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]
}

function resolveImageExtension(originalUrl: string, contentType: string | null): string {
  const type = normalizeContentType(contentType)
  switch (type) {
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

  const explicit = extname(new URL(originalUrl).pathname).toLowerCase()
  return explicit && /^\.[a-z0-9]+$/.test(explicit) ? explicit : '.jpg'
}

function normalizeContentType(contentType: string | null): string | null {
  const normalized = contentType?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized ? normalized : null
}

function isLikelyImagePayload(buffer: ArrayBuffer, contentType: string | null): boolean {
  if (contentType?.startsWith('image/')) {
    return true
  }

  const view = new DataView(buffer)
  if (view.byteLength >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    return true
  }

  if (view.byteLength >= 2 && view.getUint16(0) === 0xffd8) {
    return true
  }

  if (view.byteLength >= 2 && view.getUint16(0, true) === 0x4d42) {
    return true
  }

  if (view.byteLength >= 12 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    return true
  }

  if (view.byteLength >= 6) {
    const signature = String.fromCharCode(...new Uint8Array(buffer, 0, 6))
    if (signature === 'GIF87a' || signature === 'GIF89a') {
      return true
    }
  }

  if (view.byteLength >= 16) {
    const signature = String.fromCharCode(...new Uint8Array(buffer, 4, 12))
    if (signature.includes('ftyp') && (signature.includes('avif') || signature.includes('avis'))) {
      return true
    }
  }

  return false
}

function toToolResult(payload: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(payload, null, 2),
    }],
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const COLOR_MAP = {
  color: 'color2-color',
  bw: 'color2-bw',
  red: 'color2-FGcls_RED',
  orange: 'color2-FGcls_ORANGE',
  yellow: 'color2-FGcls_YELLOW',
  green: 'color2-FGcls_GREEN',
  teal: 'color2-FGcls_TEAL',
  blue: 'color2-FGcls_BLUE',
  purple: 'color2-FGcls_PURPLE',
  pink: 'color2-FGcls_PINK',
  brown: 'color2-FGcls_BROWN',
  black: 'color2-FGcls_BLACK',
  gray: 'color2-FGcls_GRAY',
  white: 'color2-FGcls_WHITE',
} as const

const LICENSE_MAP = {
  anyCreativeCommons: 'licenseType-Any',
  publicDomain: 'license-L1',
  freeShareAndUse: 'license-L2_L3_L4_L5_L6_L7',
  freeShareAndUseCommercially: 'license-L2_L3_L4',
  freeModifyShareAndUse: 'license-L2_L3_L5_L6',
  freeModifyShareAndUseCommercially: 'license-L2_L3',
} as const
