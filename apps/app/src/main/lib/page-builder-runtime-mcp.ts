import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import type { AgentMcpServerConfig, AgentWorkspace } from '@ai-page-builder/shared'
import {
  PAGEBUILDER_RUNTIME_MCP_TOOL_NAMES,
  createPageBuilderMcpServer,
} from '@ai-page-builder/pagebuilder-mcp-server/server'
import { getWorkspaceFilesDir } from './config-paths'
import {
  importImagesToWorkspace,
} from './image-search/asset-importer'
import type { FetchLike, ImageResult, ImportedImageResult } from './image-search/types'
import { resolvePageBuilderRuntimeMcpProviderEnv } from './page-builder-runtime-mcp-provider-config'

export const PAGE_BUILDER_RUNTIME_MCP_SERVER_NAME = 'pagebuilder'
export const PAGE_BUILDER_RUNTIME_MCP_ALLOWED_TOOLS = PAGEBUILDER_RUNTIME_MCP_TOOL_NAMES
  .map((toolName) => `mcp__${PAGE_BUILDER_RUNTIME_MCP_SERVER_NAME}__${toolName}`)

type PageBuilderRuntimeMcpServerConfig = AgentMcpServerConfig & {
  type: 'sdk'
  name: typeof PAGE_BUILDER_RUNTIME_MCP_SERVER_NAME
  instance: unknown
}

export interface PageBuilderRuntimeMcpToolBundle {
  mcpServer: PageBuilderRuntimeMcpServerConfig
  allowedTools: string[]
}

interface BuildPageBuilderRuntimeMcpToolBundleOptions {
  workspace: AgentWorkspace
  env?: NodeJS.ProcessEnv
  readFileText?: (filePath: string) => string
  fetchFn?: FetchLike
  now?: () => number
  uuidFn?: () => string
  generateImage?: (prompt: string, size?: string) => Promise<string>
  analyzeImage?: (imageSource: string, prompt: string) => Promise<string>
}

interface GeneratedImageAssetContext {
  prompt?: string
  size?: string
  provider?: string
}

interface CreateGeneratedImageAssetSinkOptions {
  workspace: AgentWorkspace
  fetchFn?: FetchLike
  now?: () => number
  uuidFn?: () => string
}

type PageBuilderGeneratedImageAssetSink = (
  imageUrl: string,
  context?: GeneratedImageAssetContext,
) => Promise<ImportedImageResult>

const EMPTY_IMAGE_SOURCE_REJECTION = 'runtime analyze_image 图片来源不能为空'

export function hasPageBuilderMcpProviderConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(resolvePageBuilderRuntimeMcpProviderEnv({ env }))
}

export async function buildPageBuilderRuntimeMcpToolBundle(
  options: BuildPageBuilderRuntimeMcpToolBundleOptions,
): Promise<PageBuilderRuntimeMcpToolBundle | null> {
  if (options.workspace.template !== 'page-builder') {
    return null
  }
  const providerEnv = resolvePageBuilderRuntimeMcpProviderEnv({
    env: options.env ?? process.env,
    ...(options.readFileText ? { readFileText: options.readFileText } : {}),
  })
  if (!providerEnv) {
    return null
  }
  const runtimeEnv = {
    ...(options.env ?? process.env),
    ...providerEnv,
  }

  const instance = await withPageBuilderRuntimeEnv(runtimeEnv, () => createPageBuilderMcpServer({
    toolNames: PAGEBUILDER_RUNTIME_MCP_TOOL_NAMES,
    assetSink: createPageBuilderGeneratedImageAssetSink({
      workspace: options.workspace,
      fetchFn: options.fetchFn,
      now: options.now,
      uuidFn: options.uuidFn,
    }),
    imageSourceResolver: createPageBuilderImageSourceResolver(options.workspace),
    ...(options.generateImage ? { generateImage: options.generateImage } : {}),
    ...(options.analyzeImage ? { analyzeImage: options.analyzeImage } : {}),
  }))

  return {
    mcpServer: {
      type: 'sdk',
      name: PAGE_BUILDER_RUNTIME_MCP_SERVER_NAME,
      instance,
    },
    allowedTools: [...PAGE_BUILDER_RUNTIME_MCP_ALLOWED_TOOLS],
  }
}

export function createPageBuilderGeneratedImageAssetSink(
  options: CreateGeneratedImageAssetSinkOptions,
): PageBuilderGeneratedImageAssetSink {
  const fetchFn = options.fetchFn ?? fetch
  const now = options.now ?? Date.now
  const uuidFn = options.uuidFn ?? randomUUID

  return async (imageUrl, context = {}) => {
    const image: ImageResult = {
      provider: 'bing',
      title: context.prompt,
      description: context.prompt,
      width: 0,
      height: 0,
      downloadUrl: imageUrl,
      url: imageUrl,
      sourcePage: imageUrl,
      temporaryUrl: true,
      raw: {
        generatedBy: 'pagebuilder-runtime-mcp',
        provider: context.provider,
        size: context.size,
      },
    }
    const result = await importImagesToWorkspace(options.workspace, fetchFn, {
      images: [image],
      count: 1,
    }, {
      now,
      uuidFn,
    })

    const imported = result.imported[0]
    if (!imported) {
      const reason = result.failed[0]?.error || '没有可导入的图片结果'
      throw new Error(`生成图片落地失败: ${reason}`)
    }
    return imported
  }
}

export function createPageBuilderImageSourceResolver(
  workspace: AgentWorkspace,
): (imageSource: string) => Promise<string> {
  const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)

  return async (imageSource) => {
    const source = imageSource.trim()
    if (!source) {
      throw new Error(EMPTY_IMAGE_SOURCE_REJECTION)
    }

    if (hasUrlScheme(source)) {
      return source
    }

    if (isAbsolute(source)) {
      return source
    }

    return resolve(workspaceFilesDir, source)
  }
}

function hasUrlScheme(source: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(source)
}

async function withPageBuilderRuntimeEnv<T>(
  env: NodeJS.ProcessEnv | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const previousEnv = process.env
  process.env = {
    ...previousEnv,
    SERVER_NAME: PAGE_BUILDER_RUNTIME_MCP_SERVER_NAME,
    ...(env ?? {}),
  }
  try {
    return await callback()
  } finally {
    process.env = previousEnv
  }
}
