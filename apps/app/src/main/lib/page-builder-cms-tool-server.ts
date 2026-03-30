import {
  createSdkMcpServer,
  tool,
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type {
  PageBuilderCmsDataSourceType,
  PageBuilderRequestCmsSelectionInput,
} from '@proma/shared'
import { createPageBuilderCmsService } from './page-builder-cms-service'
import { pageBuilderCmsSelectionService } from './page-builder-cms-selection-service'

const PAGE_BUILDER_CMS_SERVER_NAME = 'page-builder-cms'

const cmsDataSourceTypeSchema = z.enum([
  'channel-node',
  'channel-children',
  'content-item',
  'content-list',
])

const requestCmsSelectionSchema = z.object({
  selector: z.string().optional(),
  action: z.enum([
    'replace-data',
    'insert-above',
    'insert-below',
    'create-new-section',
  ]).optional(),
  allowedSourceTypes: z.array(cmsDataSourceTypeSchema).optional(),
  allowedContentTypes: z.array(z.string()).optional(),
  allowMultiple: z.boolean().optional(),
  presentationHint: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
})

const listChannelsSchema = z.object({
  search: z.string().optional(),
})

const getChannelChildrenSchema = z.object({
  channelId: z.string().min(1),
})

const listContentsSchema = z.object({
  catalogId: z.string().min(1),
  title: z.string().optional(),
  pageIndex: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

const getContentDetailSchema = z.object({
  catalogId: z.string().min(1),
  contentId: z.string().min(1),
})

const importAssetSchema = z.object({
  relativePath: z.string().min(1),
})

function createToolResult(payload: unknown) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(payload, null, 2),
    }],
  }
}

function normalizeAllowedSourceTypes(
  types: PageBuilderRequestCmsSelectionInput['allowedSourceTypes'],
): PageBuilderCmsDataSourceType[] {
  return types && types.length > 0
    ? types
    : ['channel-node', 'channel-children', 'content-item', 'content-list']
}

export function createPageBuilderCmsRuntimeMcpServers(input: {
  sessionId: string
  workspaceId: string
  sendSelectionRequest: Parameters<typeof pageBuilderCmsSelectionService.handleSelectionRequest>[2]
  notifySelectionResolved?: (requestId: string) => void
}): Record<string, ReturnType<typeof createSdkMcpServer>> {
  const cmsService = createPageBuilderCmsService()

  return {
    [PAGE_BUILDER_CMS_SERVER_NAME]: createSdkMcpServer({
      name: PAGE_BUILDER_CMS_SERVER_NAME,
      tools: [
        tool(
          'RequestCmsSelection',
          '在 page-builder 中打开 CMS 数据源选择器，并等待用户完成栏目或内容选择后返回结构化结果。',
          requestCmsSelectionSchema.shape,
          async (args) => createToolResult(
            await pageBuilderCmsSelectionService.handleSelectionRequest(
              {
                sessionId: input.sessionId,
                workspaceId: input.workspaceId,
                selector: args.selector ?? null,
                action: args.action ?? 'replace-data',
                allowedSourceTypes: normalizeAllowedSourceTypes(args.allowedSourceTypes),
                ...(args.allowedContentTypes && args.allowedContentTypes.length > 0
                  ? { allowedContentTypes: args.allowedContentTypes }
                  : {}),
                ...(args.allowMultiple !== undefined ? { allowMultiple: args.allowMultiple } : {}),
                ...(args.presentationHint ? { presentationHint: args.presentationHint } : {}),
                ...(args.title ? { title: args.title } : {}),
                ...(args.description ? { description: args.description } : {}),
              },
              new AbortController().signal,
              input.sendSelectionRequest,
              input.notifySelectionResolved,
            ),
          ),
        ),
        tool(
          'cms_list_channels',
          '列出 CMS 栏目树，可选按关键词筛选栏目名称。',
          listChannelsSchema.shape,
          async (args) => createToolResult(await cmsService.listChannels(args)),
        ),
        tool(
          'cms_get_channel_children',
          '获取指定 CMS 栏目的直接子栏目。',
          getChannelChildrenSchema.shape,
          async (args) => createToolResult(await cmsService.listChannelChildren(args.channelId)),
        ),
        tool(
          'cms_search_contents',
          '在指定栏目范围内按标题搜索 CMS 内容列表。',
          listContentsSchema.shape,
          async (args) => createToolResult(await cmsService.listContents(args)),
        ),
        tool(
          'cms_list_channel_contents',
          '列出指定栏目的 CMS 内容列表。',
          listContentsSchema.shape,
          async (args) => createToolResult(await cmsService.listContents({
            catalogId: args.catalogId,
            pageIndex: args.pageIndex,
            pageSize: args.pageSize,
          })),
        ),
        tool(
          'cms_get_content_detail',
          '获取指定 CMS 内容的归一化详情。',
          getContentDetailSchema.shape,
          async (args) => createToolResult(await cmsService.getContentDetail(args)),
        ),
        tool(
          'cms_import_asset_to_workspace',
          '将受保护 CMS 资源导入当前 page-builder 工作区的 workspace-files/assets/cms 目录。',
          importAssetSchema.shape,
          async (args) => createToolResult(await cmsService.importAssetToWorkspace({
            workspaceId: input.workspaceId,
            relativePath: args.relativePath,
          })),
        ),
      ],
    }),
  }
}
