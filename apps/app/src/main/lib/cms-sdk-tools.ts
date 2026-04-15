import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { AgentMcpServerConfig, AgentWorkspace } from '@proma/shared'
import type { CmsGateway } from './cms-gateway'
import {
  PAGE_BUILDER_CMS_APPLY_TOOL_ID,
  PAGE_BUILDER_CMS_APPLY_TOOL_NAME,
  PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION,
  PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION,
  PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION,
  createPageBuilderCmsRenderingTools,
} from './page-builder-cms-rendering-tools'

export const CMS_RUNTIME_SERVER_NAME = 'cms'
export const CMS_TOOL_NAMES = [
  'mcp__cms__list_catalogs',
  'mcp__cms__list_contents',
  PAGE_BUILDER_CMS_APPLY_TOOL_NAME,
] as const

const APPLY_CMS_BINDING_TOOL_GUIDANCE =
  '将 CMS 数据绑定到当前 page-builder 区块，写入 cms-catalog 或 cms-content 标记并触发统一 HTML mutation pipeline。templateBody、emptyTemplate、errorTemplate 应承载 complete dynamic region，并且只传 slot 内部内容，不要包含外层 <template v-slot:...> 包装或外层 cms-* 标签。'

export interface CmsRuntimeToolBundle {
  mcpServer: AgentMcpServerConfig
  allowedTools: string[]
}

export interface BuildCmsRuntimeToolBundleOptions {
  workspace: AgentWorkspace
}

export function buildCmsRuntimeToolBundle(
  gateway: CmsGateway,
  options: BuildCmsRuntimeToolBundleOptions,
): CmsRuntimeToolBundle {
  const renderingTools = createPageBuilderCmsRenderingTools()
  const targetSelectionSchema = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('block'),
      selector: z.string().min(1),
      parentBlockSelector: z.string().min(1),
      editBoundary: z.literal('block'),
    }),
    z.object({
      kind: z.literal('cms-island'),
      selector: z.string().min(1),
      parentBlockSelector: z.string().min(1),
      component: z.enum(['cms-catalog', 'cms-content']),
      editBoundary: z.literal('source-atomic'),
    }),
  ])
  const targetSelectionInputSchema = z.union([targetSelectionSchema, z.string().min(1)])
  const listCatalogsTool = tool(
    'list_catalogs',
    '列出 CMS 栏目树，支持按内容类型或关键字过滤。',
    {
      siteId: z.string().min(1).optional(),
      contentType: z.string().optional(),
      searchKeyword: z.string().optional(),
    },
    async (args) => {
      const result = await gateway.listCatalogs(args)
      return toToolResult(result)
    },
  )

  const listContentsTool = tool(
    'list_contents',
    '列出 CMS 栏目下的内容摘要。',
    {
      siteId: z.string().min(1).optional(),
      catalogId: z.string().min(1),
      keyword: z.string().optional(),
      pageIndex: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
    async (args) => {
      const result = await gateway.listContents(args)
      return toToolResult(result)
    },
  )

  const applyCmsBindingTool = tool(
    PAGE_BUILDER_CMS_APPLY_TOOL_ID,
    APPLY_CMS_BINDING_TOOL_GUIDANCE,
    {
      targetSelection: targetSelectionInputSchema.optional(),
      targetBlock: z.object({
        selector: z.string().min(1).describe('目标区块的 CSS selector'),
      }),
      kind: z.enum(['catalog-nav', 'content-list']),
      source: z.object({
        siteId: z.string().min(1).optional(),
        level: z.string().optional(),
        parentId: z.string().optional(),
        contentType: z.string().optional(),
        searchKeyword: z.string().optional(),
        take: z.number().int().min(0).optional(),
        catalogId: z.string().optional(),
        keyword: z.string().optional(),
        pageIndex: z.number().int().min(0).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }),
      templateBody: z.string().min(1).describe(PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION),
      emptyTemplate: z.string().describe(PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION).optional(),
      errorTemplate: z.string().describe(PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION).optional(),
    },
    async (args) => {
      const result = renderingTools.applyCmsBinding(options.workspace, {
        ...args,
        targetSelection: normalizeTargetSelectionInput(args.targetSelection, targetSelectionSchema),
      })
      return toToolResult(result)
    },
  )

  return {
    mcpServer: createSdkMcpServer({
      name: CMS_RUNTIME_SERVER_NAME,
      tools: [listCatalogsTool, listContentsTool, applyCmsBindingTool],
    }),
    allowedTools: [...CMS_TOOL_NAMES],
  }
}

function normalizeTargetSelectionInput(
  value: unknown,
  schema: z.ZodType<unknown>,
): unknown {
  if (typeof value !== 'string') {
    return value
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('targetSelection 必须是对象或合法的 JSON 字符串')
  }

  return schema.parse(parsed)
}

function toToolResult(payload: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(payload, null, 2),
    }],
  }
}
