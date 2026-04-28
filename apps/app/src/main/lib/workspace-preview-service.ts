import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { parseHTML } from 'linkedom'
import type { AgentWorkspace } from '@proma/shared'
import {
  detectCmsRenderingUsage,
  injectCmsRenderingPreview,
} from '@proma/page-builder-cms-rendering/preview'
import { HttpError } from '../http/errors'
import { getWorkspaceFilesDir } from './config-paths'
import {
  getPageBuilderCmsRenderingPreviewAssetUrl,
  getPageBuilderCmsRenderingVueAssetUrl,
} from './page-builder-cms-rendering-preview'
import {
  injectPageBuilderPreviewBridge,
  shouldInjectPageBuilderPreviewBridge,
} from './page-builder-preview-bridge'
import { resolvePageBuilderCmsConfig } from './page-builder-cms-config'
import {
  PAGE_BUILDER_HTML_SRCSET_ATTRIBUTES,
  PAGE_BUILDER_HTML_URL_ATTRIBUTES,
  resolveCmsAssetUrl,
  rewriteCssUrlFunctions,
  rewriteSrcsetValue,
  shouldRewritePreviewAttributeUrl,
} from './page-builder-asset-reference-utils'

export interface WorkspacePreviewState {
  hasPreview: boolean
  entryUrl: string | null
  revision: string | null
  hasCmsRendering: boolean
  requiresSameOrigin: boolean
}

interface CreateWorkspacePreviewResponseOptions {
  enablePageBuilderBridge?: boolean
}

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

    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
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
      hasCmsRendering: false,
      requiresSameOrigin: false,
    }
  }

  const rootDir = resolve(getWorkspacePreviewRoot(workspace))
  const revisionEntries: string[] = []
  collectRevisionEntries(rootDir, rootDir, revisionEntries)
  revisionEntries.sort((left, right) => left.localeCompare(right))
  const sourceHtml = readFileSync(entryPath, 'utf-8')
  const hasCmsRendering = workspace.template === 'page-builder'
    && detectCmsRenderingUsage(sourceHtml).hasCmsRendering

  return {
    hasPreview: true,
    entryUrl: `/api/workspaces/${encodeURIComponent(workspace.id)}/preview/`,
    revision: createHash('sha1').update(revisionEntries.join('\n')).digest('hex'),
    hasCmsRendering,
    requiresSameOrigin: hasCmsRendering,
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

function rewriteCmsAssetUrl(baseUrl: string, rawValue: string): string {
  const resolved = resolveCmsAssetUrl(baseUrl, rawValue)
  if (!resolved) {
    return rawValue
  }

  return buildCmsAssetProxyUrl(resolved)
}

function rewritePreviewHtmlCmsAssetUrls(sourceHtml: string): string {
  const cmsConfig = resolvePageBuilderCmsConfig()
  if (!cmsConfig) {
    return sourceHtml
  }

  const { document } = parseHTML(sourceHtml)
  let changed = false

  for (const element of Array.from(document.querySelectorAll('*'))) {
    for (const attribute of PAGE_BUILDER_HTML_URL_ATTRIBUTES) {
      const currentValue = element.getAttribute(attribute)
      if (!currentValue) {
        continue
      }

      if (!shouldRewritePreviewAttributeUrl(element, attribute, currentValue)) {
        continue
      }

      const nextValue = rewriteCmsAssetUrl(cmsConfig.baseUrl, currentValue)
      if (nextValue !== currentValue) {
        element.setAttribute(attribute, nextValue)
        changed = true
      }
    }

    for (const attribute of PAGE_BUILDER_HTML_SRCSET_ATTRIBUTES) {
      const currentValue = element.getAttribute(attribute)
      if (!currentValue) {
        continue
      }

      if (!shouldRewritePreviewAttributeUrl(element, attribute, currentValue)) {
        continue
      }

      const nextValue = rewriteSrcsetValue(currentValue, (rawUrl) => rewriteCmsAssetUrl(cmsConfig.baseUrl, rawUrl))
      if (nextValue !== currentValue) {
        element.setAttribute(attribute, nextValue)
        changed = true
      }
    }

    const styleValue = element.getAttribute('style')
    if (styleValue) {
      const nextStyleValue = rewriteCssUrlFunctions(styleValue, (rawUrl) => rewriteCmsAssetUrl(cmsConfig.baseUrl, rawUrl))
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

    const nextCssText = rewriteCssUrlFunctions(currentCssText, (rawUrl) => rewriteCmsAssetUrl(cmsConfig.baseUrl, rawUrl))
    if (nextCssText !== currentCssText) {
      styleElement.textContent = nextCssText
      changed = true
    }
  }

  return changed ? serializeDocument(sourceHtml, document) : sourceHtml
}

function injectWorkspaceCmsRenderingPreview(
  workspace: AgentWorkspace,
  sourceHtml: string,
): string {
  if (workspace.template !== 'page-builder') {
    return sourceHtml
  }

  return injectCmsRenderingPreview(sourceHtml, {
    workspaceId: workspace.id,
    cmsProxyBase: '/api/page-builder/cms',
    vueAssetUrl: getPageBuilderCmsRenderingVueAssetUrl(),
    bootstrapAssetUrl: getPageBuilderCmsRenderingPreviewAssetUrl(),
  })
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
    const previewHtml = injectWorkspaceCmsRenderingPreview(
      workspace,
      rewritePreviewHtmlCmsAssetUrls(sourceHtml),
    )
    const transformedHtml = shouldInjectBridge
      ? injectPageBuilderPreviewBridge(previewHtml)
      : previewHtml

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
