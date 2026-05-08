import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentWorkspace } from '@ai-page-builder/shared'
import {
  PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@ai-page-builder/shared'
import { buildPageBuilderPublicUrl } from './page-builder-public-url'

const PAGE_BUILDER_PREVIEW_BRIDGE_LOADER_ATTR = 'data-page-builder-preview-bridge-loader'

interface PreviewBridgeBuildLog {
  message?: string
}

interface PreviewBridgeBuildOutput {
  text(): Promise<string>
}

interface PreviewBridgeBuildResult {
  success: boolean
  logs: PreviewBridgeBuildLog[]
  outputs: PreviewBridgeBuildOutput[]
}

interface BunBuildApi {
  build(options: {
    entrypoints: string[]
    target: 'browser'
    format: 'iife'
    minify: boolean
    sourcemap: 'none'
  }): Promise<PreviewBridgeBuildResult>
}

function resolveBundledPageBuilderPreviewBridgePath(): string | null {
  const configuredPath = process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH?.trim()
  return configuredPath ? configuredPath : null
}

function resolvePageBuilderPreviewBridgeEntryPath(): string {
  const configuredPath = process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_ENTRY_PATH?.trim()
  return configuredPath
    ? configuredPath
    : fileURLToPath(new URL('./page-builder-preview-bridge/entry.ts', import.meta.url))
}

function resolvePageBuilderPreviewBridgeSourceRoot(): string {
  const configuredPath = process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE_ROOT?.trim()
  return configuredPath
    ? configuredPath
    : fileURLToPath(new URL('./page-builder-preview-bridge', import.meta.url))
}

function readPageBuilderPreviewBridgeResource(): string {
  const sourcePath = resolveBundledPageBuilderPreviewBridgePath()
  if (!sourcePath) {
    throw new Error('未配置 page-builder 预览桥接 bundle 覆盖路径')
  }

  if (!existsSync(sourcePath)) {
    throw new Error(`page-builder 预览桥接脚本不存在: ${sourcePath}`)
  }

  return readFileSync(sourcePath, 'utf-8')
}

function formatBuildErrors(logs: PreviewBridgeBuildLog[]): string {
  return logs
    .map((log) => log.message?.trim())
    .filter((message): message is string => Boolean(message))
    .join('\n')
}

async function readBuiltPageBuilderPreviewBridgeResource(): Promise<string> {
  const overridePath = resolveBundledPageBuilderPreviewBridgePath()
  if (overridePath) {
    return readPageBuilderPreviewBridgeResource()
  }

  const entryPath = resolvePageBuilderPreviewBridgeEntryPath()
  if (!existsSync(entryPath)) {
    throw new Error(`page-builder 预览桥接入口不存在: ${entryPath}`)
  }

  const result = await (Bun as typeof Bun & BunBuildApi).build({
    entrypoints: [entryPath],
    target: 'browser',
    format: 'iife',
    minify: false,
    sourcemap: 'none',
  })

  if (!result.success) {
    throw new Error(`构建 page-builder 预览桥接脚本失败。\n${formatBuildErrors(result.logs)}`)
  }

  const bundledOutput = result.outputs[0]
  if (!bundledOutput) {
    throw new Error('构建 page-builder 预览桥接脚本失败。未生成输出。')
  }

  return await bundledOutput.text()
}

async function buildPageBuilderPreviewBridgeScript(): Promise<string> {
  return (await readBuiltPageBuilderPreviewBridgeResource())
    .replace(
      /(['"])__PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE__\1/g,
      JSON.stringify(PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE),
    )
    .replace(
      /(['"])__PAGE_BUILDER_PREVIEW_PARENT_SOURCE__\1/g,
      JSON.stringify(PAGE_BUILDER_PREVIEW_PARENT_SOURCE),
    )
    .replace(/__PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE__/g, PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE)
    .replace(/__PAGE_BUILDER_PREVIEW_PARENT_SOURCE__/g, PAGE_BUILDER_PREVIEW_PARENT_SOURCE)
}

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  return targetPath === rootDir || targetPath.startsWith(`${rootDir}${sep}`)
}

function hashFileContent(hash: ReturnType<typeof createHash>, filePath: string, label: string): void {
  hash.update(`${label}\n`)
  hash.update(readFileSync(filePath))
  hash.update('\n')
}

function hashDirectoryContents(hash: ReturnType<typeof createHash>, dirPath: string, rootDir: string): void {
  const children = readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))

  for (const child of children) {
    const fullPath = join(dirPath, child.name)
    if (child.isDirectory()) {
      hashDirectoryContents(hash, fullPath, rootDir)
      continue
    }

    if (!child.isFile()) {
      continue
    }

    const relativePath = fullPath.slice(rootDir.length + 1)
    hashFileContent(hash, fullPath, relativePath)
  }
}

function getPageBuilderPreviewBridgeVersion(): string {
  const overridePath = resolveBundledPageBuilderPreviewBridgePath()
  const sourceRootPath = resolvePageBuilderPreviewBridgeSourceRoot()
  const entryPath = resolvePageBuilderPreviewBridgeEntryPath()
  const hash = createHash('sha1')

  hash.update(PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE)
  hash.update('\n')
  hash.update(PAGE_BUILDER_PREVIEW_PARENT_SOURCE)
  hash.update('\n')

  if (overridePath) {
    hashFileContent(hash, overridePath, 'bridge-override')
    return hash.digest('hex')
  }

  if (!existsSync(sourceRootPath)) {
    throw new Error(`page-builder 预览桥接源码目录不存在: ${sourceRootPath}`)
  }

  const resolvedRoot = resolve(sourceRootPath)
  hashDirectoryContents(hash, resolvedRoot, resolvedRoot)

  if (existsSync(entryPath)) {
    const resolvedEntryPath = resolve(entryPath)
    if (!isWithinRoot(resolvedRoot, resolvedEntryPath)) {
      hashFileContent(hash, resolvedEntryPath, `entry:${resolvedEntryPath}`)
    }
  } else {
    hash.update(`missing-entry:${entryPath}`)
  }

  return hash.digest('hex')
}

export async function readPageBuilderPreviewBridgeScript(): Promise<string> {
  return await buildPageBuilderPreviewBridgeScript()
}

export function getPageBuilderPreviewBridgeAssetUrl(): string {
  return buildPageBuilderPublicUrl(`/api/page-builder/preview-bridge.js?v=${getPageBuilderPreviewBridgeVersion()}`)
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
