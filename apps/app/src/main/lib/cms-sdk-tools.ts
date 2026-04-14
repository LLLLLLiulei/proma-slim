import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { AgentMcpServerConfig, AgentWorkspace } from '@proma/shared'
import type { CmsGateway } from './cms-gateway'
import {
  PAGE_BUILDER_CMS_APPLY_TOOL_ID,
  PAGE_BUILDER_CMS_APPLY_TOOL_NAME,
  createPageBuilderCmsRenderingTools,
} from './page-builder-cms-rendering-tools'

export const CMS_RUNTIME_SERVER_NAME = 'cms'
export const CMS_TOOL_NAMES = [
  'mcp__cms__list_catalogs',
  'mcp__cms__list_contents',
  PAGE_BUILDER_CMS_APPLY_TOOL_NAME,
] as const

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
  const listCatalogsTool = tool(
    'list_catalogs',
    '列出 CMS 栏目树，支持按内容类型或关键字过滤。',
    {
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
    '将 CMS 数据绑定到当前 page-builder 区块，写入 cms-catalog 或 cms-content 标记并触发统一 HTML mutation pipeline。',
    {
      targetBlock: z.object({
        selector: z.string().min(1).describe('目标区块的 CSS selector'),
      }),
      kind: z.enum(['catalog-nav', 'content-list']),
      source: z.object({
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
      templateBody: z.string().min(1),
      emptyTemplate: z.string().optional(),
      errorTemplate: z.string().optional(),
    },
    async (args) => {
      const result = renderingTools.applyCmsBinding(options.workspace, args)
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

function toToolResult(payload: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(payload, null, 2),
    }],
  }
}
