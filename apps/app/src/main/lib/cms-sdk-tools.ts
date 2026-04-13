import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { AgentMcpServerConfig } from '@proma/shared'
import type { CmsGateway } from './cms-gateway'

export const CMS_RUNTIME_SERVER_NAME = 'cms'
export const CMS_TOOL_NAMES = [
  'mcp__cms__list_catalogs',
  'mcp__cms__list_contents',
] as const

export interface CmsRuntimeToolBundle {
  mcpServer: AgentMcpServerConfig
  allowedTools: string[]
}

export function buildCmsRuntimeToolBundle(gateway: CmsGateway): CmsRuntimeToolBundle {
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

  return {
    mcpServer: createSdkMcpServer({
      name: CMS_RUNTIME_SERVER_NAME,
      tools: [listCatalogsTool, listContentsTool],
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
