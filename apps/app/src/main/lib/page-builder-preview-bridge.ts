import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { AgentWorkspace } from '@proma/shared'
import {
  PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@proma/shared'

const PAGE_BUILDER_PREVIEW_BRIDGE_LOADER_ATTR = 'data-page-builder-preview-bridge-loader'

function resolveBundledPageBuilderPreviewBridgePath(): string {
  const configuredPath = process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH?.trim()
  return configuredPath
    ? configuredPath
    : fileURLToPath(new URL('../../../resources/page-builder/page-builder-preview-bridge.js', import.meta.url))
}

function readPageBuilderPreviewBridgeResource(): string {
  const sourcePath = resolveBundledPageBuilderPreviewBridgePath()
  if (!existsSync(sourcePath)) {
    throw new Error(`page-builder 预览桥接脚本不存在: ${sourcePath}`)
  }

  return readFileSync(sourcePath, 'utf-8')
}

function buildPageBuilderPreviewBridgeScript(): string {
  return readPageBuilderPreviewBridgeResource()
    .replace(/__PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE__/g, JSON.stringify(PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE))
    .replace(/__PAGE_BUILDER_PREVIEW_PARENT_SOURCE__/g, JSON.stringify(PAGE_BUILDER_PREVIEW_PARENT_SOURCE))
}

function getPageBuilderPreviewBridgeSnapshot(): {
  script: string
  version: string
} {
  const script = buildPageBuilderPreviewBridgeScript()
  return {
    script,
    version: createHash('sha1').update(script).digest('hex'),
  }
}

export function readPageBuilderPreviewBridgeScript(): string {
  return getPageBuilderPreviewBridgeSnapshot().script
}

export function getPageBuilderPreviewBridgeAssetUrl(): string {
  return `/api/page-builder/preview-bridge.js?v=${getPageBuilderPreviewBridgeSnapshot().version}`
}

function createPageBuilderPreviewBridgeLoaderTag(): string {
  return `<script src="${getPageBuilderPreviewBridgeAssetUrl()}" ${PAGE_BUILDER_PREVIEW_BRIDGE_LOADER_ATTR}="true"></script>`
}

export function shouldInjectPageBuilderPreviewBridge(
  workspace: AgentWorkspace,
  resolvedPath: string,
  options?: {
    enablePageBuilderBridge?: boolean
  },
): boolean {
  return Boolean(options?.enablePageBuilderBridge)
    && workspace.template === 'page-builder'
    && resolvedPath.toLowerCase().endsWith('.html')
}

export function injectPageBuilderPreviewBridge(html: string): string {
  if (html.includes(PAGE_BUILDER_PREVIEW_BRIDGE_LOADER_ATTR)) {
    return html
  }

  const loaderTag = createPageBuilderPreviewBridgeLoaderTag()

  if (html.includes('</body>')) {
    return html.replace('</body>', `${loaderTag}</body>`)
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${loaderTag}</head>`)
  }

  return `${html}${loaderTag}`
}
