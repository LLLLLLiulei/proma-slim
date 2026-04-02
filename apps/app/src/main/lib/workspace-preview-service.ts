import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { parseHTML } from 'linkedom'
import type { AgentWorkspace } from '@proma/shared'
import { HttpError } from '../http/errors'
import { getWorkspaceFilesDir } from './config-paths'
import {
  injectPageBuilderPreviewBridge,
  shouldInjectPageBuilderPreviewBridge,
} from './page-builder-preview-bridge'
import { resolvePageBuilderCmsConfig } from './page-builder-cms-config'

export interface WorkspacePreviewState {
  hasPreview: boolean
  entryUrl: string | null
  revision: string | null
}

interface CreateWorkspacePreviewResponseOptions {
  enablePageBuilderBridge?: boolean
}

const CMS_URL_ATTRIBUTES = [
  'src',
  'href',
  'poster',
  'data-src',
  'data-href',
  'data-url',
  'data-poster',
] as const

const CMS_SRCSET_ATTRIBUTES = [
  'srcset',
  'data-srcset',
] as const

function getWorkspacePreviewRoot(workspace: AgentWorkspace): string {
  return getWorkspaceFilesDir(workspace.slug)
}

function getWorkspacePreviewEntryPath(workspace: AgentWorkspace): string {
  return join(getWorkspacePreviewRoot(workspace), 'index.html')
}

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  return targetPath === rootDir || targetPath.startsWith(`${rootDir}${sep}`)
}

function resolveWorkspacePreviewPath(workspace: AgentWorkspace, requestPath: string): string {
  const rootDir = resolve(getWorkspacePreviewRoot(workspace))
  const normalizedPath = requestPath.replace(/^\/+/, '')
  const resolvedPath = resolve(rootDir, normalizedPath || 'index.html')

  if (!isWithinRoot(rootDir, resolvedPath)) {
    throw new HttpError(403, '非法路径')
  }

  return resolvedPath
}

function collectRevisionEntries(dir: string, rootDir: string, entries: string[]): void {
  const children = readdirSync(dir, { withFileTypes: true })
  for (const child of children) {
    const fullPath = join(dir, child.name)

    if (child.isDirectory()) {
      collectRevisionEntries(fullPath, rootDir, entries)
      continue
    }

    if (!child.isFile()) continue

    const stat = statSync(fullPath)
    const relativePath = fullPath.slice(rootDir.length + 1)
    entries.push(`${relativePath}:${stat.size}:${stat.mtimeMs}`)
  }
}

export function getWorkspacePreviewState(workspace: AgentWorkspace): WorkspacePreviewState {
  const entryPath = getWorkspacePreviewEntryPath(workspace)
  if (!existsSync(entryPath)) {
    return {
      hasPreview: false,
      entryUrl: null,
      revision: null,
    }
  }

  const rootDir = resolve(getWorkspacePreviewRoot(workspace))
  const revisionEntries: string[] = []
  collectRevisionEntries(rootDir, rootDir, revisionEntries)
  revisionEntries.sort((left, right) => left.localeCompare(right))

  return {
    hasPreview: true,
    entryUrl: `/api/workspaces/${encodeURIComponent(workspace.id)}/preview/`,
    revision: createHash('sha1').update(revisionEntries.join('\n')).digest('hex'),
  }
}

function serializeDocument(sourceHtml: string, document: Document): string {
  const serialized = document.toString()
  if (/^\s*<!doctype/i.test(serialized)) {
    return serialized
  }

  const doctypeMatch = sourceHtml.match(/^\s*<!doctype[^>]*>/i)
  if (!doctypeMatch) {
    return serialized
  }

  return `${doctypeMatch[0]}${serialized}`
}

function shouldServeHtmlFromSource(resolvedPath: string): boolean {
  return /\.html?$/i.test(resolvedPath)
}

function buildCmsAssetProxyUrl(assetUrl: string): string {
  return `/api/page-builder/cms/assets?url=${encodeURIComponent(assetUrl)}`
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function isCmsRootRelativeAssetPath(baseUrl: string, assetUrl: string): boolean {
  if (!assetUrl.startsWith('/')) {
    return false
  }

  try {
    const base = new URL(baseUrl)
    const basePath = base.pathname.replace(/\/+$/, '')
    return assetUrl.startsWith('/preview/')
      || assetUrl.startsWith('/upload/')
      || assetUrl.startsWith('/resources/')
      || (basePath ? assetUrl.startsWith(`${basePath}/preview/`) : false)
      || (basePath ? assetUrl.startsWith(`${basePath}/upload/`) : false)
      || (basePath ? assetUrl.startsWith(`${basePath}/resources/`) : false)
  } catch {
    return false
  }
}

function looksLikeCmsDownloadableAsset(assetUrl: string): boolean {
  const normalized = assetUrl.toLowerCase()

  if (normalized.includes('/upload/resources/') || normalized.includes('/preview/')) {
    return true
  }

  return /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|mp4|webm|ogg|mp3|wav|m4a|flac|aac|pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt)(?:[?#].*)?$/i.test(normalized)
}

function shouldRewriteAttributeUrl(element: Element, attribute: string, rawValue: string): boolean {
  const tagName = element.tagName.toLowerCase()
  const normalizedAttribute = attribute.toLowerCase()

  if (!rawValue.trim()) {
    return false
  }

  if (normalizedAttribute === 'href') {
    if (tagName === 'link') {
      return false
    }

    if (tagName === 'a') {
      return looksLikeCmsDownloadableAsset(rawValue)
    }
  }

  if (normalizedAttribute === 'poster') {
    return true
  }

  if (normalizedAttribute === 'src') {
    return ['img', 'audio', 'video', 'source'].includes(tagName)
      || tagName.startsWith('amp-img')
  }

  if (normalizedAttribute === 'srcset') {
    return ['img', 'source'].includes(tagName)
  }

  if (normalizedAttribute.startsWith('data-')) {
    return looksLikeCmsDownloadableAsset(rawValue)
  }

  return false
}

function resolveCmsAssetUrlForPreview(baseUrl: string, assetUrl: string): string | null {
  const trimmed = assetUrl.trim()
  if (!trimmed) {
    return null
  }

  try {
    const proxyCandidate = new URL(trimmed, 'http://localhost')
    if (proxyCandidate.pathname === '/api/page-builder/cms/assets') {
      return null
    }
  } catch {
    return null
  }

  try {
    if (!isAbsoluteHttpUrl(trimmed) && !isCmsRootRelativeAssetPath(baseUrl, trimmed)) {
      return null
    }

    const base = new URL(baseUrl)
    if (trimmed.startsWith('/')) {
      const basePath = base.pathname.replace(/\/+$/, '')
      return `${base.origin}${basePath}${trimmed}`
    }

    return new URL(trimmed, base).toString()
  } catch {
    return null
  }
}

function isAllowedCmsAssetUrl(baseUrl: string, assetUrl: string): boolean {
  try {
    const base = new URL(baseUrl)
    const candidate = new URL(assetUrl)
    return base.origin === candidate.origin
  } catch {
    return false
  }
}

function rewriteCmsAssetUrl(baseUrl: string, rawValue: string): string {
  const resolved = resolveCmsAssetUrlForPreview(baseUrl, rawValue)
  if (!resolved || !isAllowedCmsAssetUrl(baseUrl, resolved)) {
    return rawValue
  }

  return buildCmsAssetProxyUrl(resolved)
}

function rewriteSrcsetValue(baseUrl: string, srcset: string): string {
  return srcset
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim()
      if (!trimmed) {
        return trimmed
      }

      const segments = trimmed.split(/\s+/)
      const [rawUrl, ...descriptors] = segments
      const nextUrl = rawUrl ? rewriteCmsAssetUrl(baseUrl, rawUrl) : rawUrl
      return [nextUrl, ...descriptors].filter(Boolean).join(' ')
    })
    .join(', ')
}

function rewriteCssUrlFunctions(baseUrl: string, cssValue: string): string {
  return cssValue.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote: string, rawUrl: string) => {
    const rewrittenUrl = rewriteCmsAssetUrl(baseUrl, rawUrl)
    if (rewrittenUrl === rawUrl) {
      return match
    }

    const nextQuote = quote || '"'
    return `url(${nextQuote}${rewrittenUrl}${nextQuote})`
  })
}

function rewritePreviewHtmlCmsAssetUrls(sourceHtml: string): string {
  const cmsConfig = resolvePageBuilderCmsConfig()
  if (!cmsConfig) {
    return sourceHtml
  }

  const { document } = parseHTML(sourceHtml)
  let changed = false

  for (const element of Array.from(document.querySelectorAll('*'))) {
    for (const attribute of CMS_URL_ATTRIBUTES) {
      const currentValue = element.getAttribute(attribute)
      if (!currentValue) {
        continue
      }

      if (!shouldRewriteAttributeUrl(element, attribute, currentValue)) {
        continue
      }

      const nextValue = rewriteCmsAssetUrl(cmsConfig.baseUrl, currentValue)
      if (nextValue !== currentValue) {
        element.setAttribute(attribute, nextValue)
        changed = true
      }
    }

    for (const attribute of CMS_SRCSET_ATTRIBUTES) {
      const currentValue = element.getAttribute(attribute)
      if (!currentValue) {
        continue
      }

      if (!shouldRewriteAttributeUrl(element, attribute, currentValue)) {
        continue
      }

      const nextValue = rewriteSrcsetValue(cmsConfig.baseUrl, currentValue)
      if (nextValue !== currentValue) {
        element.setAttribute(attribute, nextValue)
        changed = true
      }
    }

    const styleValue = element.getAttribute('style')
    if (styleValue) {
      const nextStyleValue = rewriteCssUrlFunctions(cmsConfig.baseUrl, styleValue)
      if (nextStyleValue !== styleValue) {
        element.setAttribute('style', nextStyleValue)
        changed = true
      }
    }
  }

  for (const styleElement of Array.from(document.querySelectorAll('style'))) {
    const currentCssText = styleElement.textContent
    if (!currentCssText) {
      continue
    }

    const nextCssText = rewriteCssUrlFunctions(cmsConfig.baseUrl, currentCssText)
    if (nextCssText !== currentCssText) {
      styleElement.textContent = nextCssText
      changed = true
    }
  }

  return changed ? serializeDocument(sourceHtml, document) : sourceHtml
}

export function createWorkspacePreviewResponse(
  workspace: AgentWorkspace,
  requestPath: string,
  options?: CreateWorkspacePreviewResponseOptions,
): Response {
  const resolvedPath = resolveWorkspacePreviewPath(workspace, requestPath)
  const isEntryRequest = requestPath === '' || requestPath === '/' || requestPath === 'index.html'

  if (!existsSync(resolvedPath)) {
    throw new HttpError(404, isEntryRequest ? '预览入口不存在' : '预览文件不存在')
  }

  const shouldInjectBridge = shouldInjectPageBuilderPreviewBridge(workspace, resolvedPath, options)
  const shouldTransformHtml = shouldServeHtmlFromSource(resolvedPath)

  if (shouldInjectBridge || shouldTransformHtml) {
    const sourceHtml = readFileSync(resolvedPath, 'utf-8')
    const transformedHtml = shouldInjectBridge
      ? injectPageBuilderPreviewBridge(rewritePreviewHtmlCmsAssetUrls(sourceHtml))
      : rewritePreviewHtmlCmsAssetUrls(sourceHtml)

    return new Response(
      transformedHtml,
      {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
        },
      },
    )
  }

  return new Response(Bun.file(resolvedPath), {
    headers: {
      'cache-control': 'no-store',
    },
  })
}
