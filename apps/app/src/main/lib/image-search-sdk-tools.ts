import { randomUUID } from 'node:crypto'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { AgentMcpServerConfig, AgentWorkspace } from '@ai-page-builder/shared'
import { importImagesToWorkspace } from './image-search/asset-importer'
import { createImageSearchRuntimeLogger, logImageSearchError, logImageSearchInfo, serializeImageSearchLogError, type ImageSearchRuntimeTrace } from './image-search/logging'
import { searchImagesAcrossProviders } from './image-search/search-orchestrator'
import { IMAGE_PROVIDERS, REQUEST_TIMEOUT, type ImageProvider } from './image-search/types'

export const IMAGE_SEARCH_RUNTIME_SERVER_NAME = 'image_search'
export const IMAGE_SEARCH_TOOL_NAMES = [
  'mcp__image_search__search_images',
  'mcp__image_search__download_images',
] as const

const imageSearchInputSchema = z.strictObject({
  query: z.string().min(1),
  count: z.number().int().min(1).max(20).optional(),
  orientation: z.enum(['landscape', 'portrait', 'squarish']).optional(),
})

const optionalUrlSchema = z.string().url().or(z.literal('')).optional()

const imageCandidateSchema = z.strictObject({
  id: z.string().optional(),
  provider: z.enum(IMAGE_PROVIDERS),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  downloadUrl: z.string().url(),
  url: z.string().url(),
  previewUrl: optionalUrlSchema,
  thumbnailUrl: optionalUrlSchema,
  sourcePage: z.string().url().or(z.literal('')),
  author: z.string().optional(),
  authorUrl: optionalUrlSchema,
  authorId: z.string().optional(),
  authorAvatarUrl: optionalUrlSchema,
  licenseName: z.string().optional(),
  licenseUrl: optionalUrlSchema,
  attributionRequired: z.boolean().optional(),
  attributionText: z.string().optional(),
  dominantColor: z.string().optional(),
  temporaryUrl: z.boolean().optional(),
  downloadTrackingUrl: optionalUrlSchema,
})

const downloadImagesInputSchema = z.strictObject({
  images: z.array(imageCandidateSchema).min(1),
  count: z.number().int().min(1).max(20).optional(),
})

type SearchImageInput = z.infer<typeof imageSearchInputSchema>
type DownloadImagesInput = z.infer<typeof downloadImagesInputSchema>

interface ImageSearchRuntimeToolBundle {
  mcpServer: AgentMcpServerConfig
  allowedTools: string[]
}

export interface BuildImageSearchRuntimeToolBundleOptions {
  workspace: AgentWorkspace
  fetchFn?: typeof fetch
  env?: NodeJS.ProcessEnv
  now?: () => number
  uuidFn?: () => string
  trace?: ImageSearchRuntimeTrace
}

export function buildImageSearchRuntimeToolBundle(
  options: BuildImageSearchRuntimeToolBundleOptions,
): ImageSearchRuntimeToolBundle {
  const fetchFn = options.fetchFn ?? fetch
  const now = options.now ?? Date.now
  const uuidFn = options.uuidFn ?? randomUUID
  const logger = createImageSearchRuntimeLogger({
    ...options.trace,
    workspaceId: options.trace?.workspaceId ?? options.workspace.id,
    workspaceSlug: options.trace?.workspaceSlug ?? options.workspace.slug,
  })

  const searchImagesTool = tool(
    'search_images',
    '搜索多平台图片并返回 provider-aware ImageResult 结果。支持 Pexels、Pixabay、Unsplash、Bing；输入 query、可选 count 和 orientation。',
    imageSearchInputSchema as unknown as Readonly<Record<string, z.ZodTypeAny>>,
    async (rawArgs) => {
      const startedAt = Date.now()
      const args = imageSearchInputSchema.parse(rawArgs)
      logImageSearchInfo(logger, 'search_tool_start', {
        toolName: 'search_images',
        args,
      })
      try {
        const result = await searchImages(fetchFn, args, options.env, logger)
        logImageSearchInfo(logger, 'search_tool_success', {
          toolName: 'search_images',
          args,
          result,
          durationMs: Date.now() - startedAt,
          resultCount: result.results.length,
        })
        return toToolResult(result)
      } catch (error) {
        logImageSearchError(logger, 'search_tool_error', {
          toolName: 'search_images',
          args,
          durationMs: Date.now() - startedAt,
          error: serializeImageSearchLogError(error),
        })
        throw error
      }
    },
  )

  const downloadImagesTool = tool(
    'download_images',
    '将 search_images 返回的 provider-aware ImageResult 候选导入当前 page-builder workspace 的 assets/ 目录，并返回资产路径元数据。',
    downloadImagesInputSchema as unknown as Readonly<Record<string, z.ZodTypeAny>>,
    async (rawArgs) => {
      const startedAt = Date.now()
      const args = downloadImagesInputSchema.parse(rawArgs)
      logImageSearchInfo(logger, 'download_tool_start', {
        toolName: 'download_images',
        args,
        candidateCount: args.images.length,
        providerCounts: countByProvider(args.images),
      })
      try {
        const result = await importImagesToWorkspace(options.workspace, fetchFn, args as DownloadImagesInput, {
          now,
          uuidFn,
          logger,
        })
        logImageSearchInfo(logger, 'download_tool_success', {
          toolName: 'download_images',
          args,
          result,
          durationMs: Date.now() - startedAt,
          importedCount: result.imported.length,
          failedCount: result.failed.length,
        })
        return toToolResult(result)
      } catch (error) {
        logImageSearchError(logger, 'download_tool_error', {
          toolName: 'download_images',
          args,
          durationMs: Date.now() - startedAt,
          error: serializeImageSearchLogError(error),
        })
        throw error
      }
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

async function searchImages(
  fetchFn: typeof fetch,
  input: SearchImageInput,
  env: NodeJS.ProcessEnv | undefined,
  logger: ReturnType<typeof createImageSearchRuntimeLogger>,
) {
  return searchImagesAcrossProviders({
    query: input.query,
    count: input.count,
    orientation: input.orientation,
  }, {
    fetchFn,
    env,
    timeoutMs: REQUEST_TIMEOUT,
    logger,
  })
}

function countByProvider(images: Array<{ provider: ImageProvider }>): Record<string, number> {
  return images.reduce<Record<string, number>>((counts, image) => {
    counts[image.provider] = (counts[image.provider] ?? 0) + 1
    return counts
  }, {})
}

function toToolResult(payload: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(removeRawFields(payload), null, 2),
    }],
  }
}

function removeRawFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeRawFields)
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'raw') continue
    output[key] = removeRawFields(child)
  }
  return output
}

export type { ImageProvider }
