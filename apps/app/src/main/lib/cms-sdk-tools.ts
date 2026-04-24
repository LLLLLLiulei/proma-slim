import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type {
  AgentMcpServerConfig,
  AgentWorkspace,
  PageBuilderCmsApplyDecisionResult,
} from '@proma/shared'
import {
  PAGE_BUILDER_CMS_DECIDE_TOOL_ID,
  PAGE_BUILDER_CMS_DECIDE_TOOL_NAME,
} from '@proma/shared'
import type { CmsGateway } from './cms-gateway'
import { pageBuilderCmsBindingDecisionStore } from './page-builder-cms-binding-decision-store'
import {
  PAGE_BUILDER_CMS_APPLY_TOOL_ID,
  PAGE_BUILDER_CMS_APPLY_TOOL_NAME,
  PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION,
  PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION,
  PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION,
  createPageBuilderCmsRenderingTools,
} from './page-builder-cms-rendering-tools'
import { getWorkspacePreviewState } from './workspace-preview-service'

export const CMS_RUNTIME_SERVER_NAME = 'cms'
export const CMS_TOOL_NAMES = [
  'mcp__cms__list_catalogs',
  'mcp__cms__list_contents',
  PAGE_BUILDER_CMS_DECIDE_TOOL_NAME,
  PAGE_BUILDER_CMS_APPLY_TOOL_NAME,
] as const

const DECIDE_CMS_BINDING_TOOL_GUIDANCE =
  [
    '将当前 turn 在 cms-binding-apply 中得出的结构化结论物化为正式 CMS binding decision。',
    '该工具只接受当前 confirmed CMS handoff 的 `handoffId` 与结构化 `decision`，不会直接写入页面。',
    '调用顺序固定为：先 `mcp__cms__decide_cms_binding`，只有返回 `status=ready` 且拿到 `decisionId` 后，才能继续调用 `mcp__cms__apply_cms_binding`。',
    '`decision` 必须作为嵌套对象传入，不要发送 JSON 字符串；legacy string payload 只用于兼容恢复。',
    '最小 ready 示例：',
    'content-list => {"status":"ready","targetBlockKind":"content-list","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-content-list","toolKind":"content-list","source":{"siteId":"14","catalogId":"news"}}',
    'catalog-nav => {"status":"ready","targetBlockKind":"nav","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-nav","toolKind":"catalog-nav","source":{"siteId":"14","parentId":"root","take":6}}',
  ].join(' ')

const APPLY_CMS_BINDING_TOOL_GUIDANCE =
  [
    '消费已持久化的 `decisionId`，将 CMS 数据绑定到当前 page-builder 区块，写入 cms-catalog 或 cms-content 标记并触发统一 HTML mutation pipeline。',
    '调用前提：必须先由 `mcp__cms__decide_cms_binding` 返回 `status=ready` 和 `decisionId`。',
    '该工具只接受 `decisionId`、`templateBody`、`emptyTemplate`、`errorTemplate`；不要传 targetSelection、siteId、source props 或其他 raw binding identity 字段。',
    '`templateBody`、`emptyTemplate`、`errorTemplate` 必须承载完整动态区域，但只能传 slot 内部内容，不要包含外层 `<template v-slot:...>` 包装，也不要包含外层 `cms-catalog` / `cms-content` 标签。',
    '不要根据 CMS 浏览弹框当前的分页大小推断页面绑定的 `pageSize`。固定内容 ids 禁止传 `pageSize`；如需限制栏目数量请使用 `take`。',
  ].join(' ')

const catalogSourceSchema = z.object({
  siteId: z.string().min(1),
  ids: z.array(z.string().min(1)).optional(),
  level: z.string().optional(),
  parentId: z.string().optional(),
  contentType: z.string().optional(),
  searchKeyword: z.string().optional(),
  take: z.union([z.string(), z.number().int().min(0)]).optional(),
}).strict()

const contentSourceSchema = z.object({
  siteId: z.string().min(1),
  ids: z.array(z.string().min(1)).optional(),
  catalogId: z.string().min(1),
  keyword: z.string().optional(),
  pageIndex: z.union([z.string(), z.number().int().min(0)]).optional(),
  pageSize: z.union([z.string(), z.number().int().min(1).max(100)]).optional(),
}).strict()

const readyDecisionBaseSchema = z.object({
  status: z.literal('ready'),
  targetBlockKind: z.enum(['nav', 'catalog-list', 'content-list']),
  supportedRenderModes: z.array(z.literal('replace-current')).min(1),
  renderMode: z.literal('replace-current'),
  applyStrategy: z.literal('replace-current'),
  mappingKind: z.enum(['catalog-nav', 'catalog-content-list']),
})

const catalogReadyDecisionSchema = readyDecisionBaseSchema.extend({
  toolKind: z.literal('catalog-nav'),
  source: catalogSourceSchema,
}).strict()

const contentReadyDecisionSchema = readyDecisionBaseSchema.extend({
  toolKind: z.literal('content-list'),
  source: contentSourceSchema,
}).strict()

const clarificationDecisionSchema = z.object({
  status: z.literal('needs-clarification'),
  clarification: z.object({
    kind: z.enum(['target-block-intent', 'catalog-nav-scope', 'content-presentation', 'apply-boundary-confirmation']),
    question: z.string().min(1),
    options: z.array(z.object({
      label: z.string().min(1),
      value: z.string().min(1),
      description: z.string().min(1).optional(),
    }).strict()).min(1),
  }).strict(),
}).strict()

const incompatibleDecisionSchema = z.object({
  status: z.literal('incompatible'),
  reasonCode: z.enum([
    'malformed-payload',
    'unsupported-block-kind',
    'selection-block-mismatch',
    'requires-page-reflow',
    'unsupported-runtime-capability',
    'unsupported-apply-strategy',
  ]),
  message: z.string().min(1),
}).strict()

const decisionInputSchema = z.union([
  catalogReadyDecisionSchema,
  contentReadyDecisionSchema,
  clarificationDecisionSchema,
  incompatibleDecisionSchema,
])

const decisionLooseObjectSchema = z.object({}).passthrough()

const DECIDE_CMS_BINDING_DECISION_FIELD_GUIDANCE =
  'Pass `decision` as a nested object. Do not JSON-stringify it. If a legacy JSON string was used, parse it back into an object and retry. Minimal ready examples: content-list => {"status":"ready","targetBlockKind":"content-list","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-content-list","toolKind":"content-list","source":{"siteId":"14","catalogId":"news"}} ; catalog-nav => {"status":"ready","targetBlockKind":"nav","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-nav","toolKind":"catalog-nav","source":{"siteId":"14","parentId":"root","take":6}}.'

const decideCmsBindingToolInputSchema = z.strictObject({
  handoffId: z.string().min(1),
  decision: z.union([
    decisionInputSchema,
    z.string().min(1),
    decisionLooseObjectSchema,
  ]).describe(DECIDE_CMS_BINDING_DECISION_FIELD_GUIDANCE),
})

const applyCmsBindingToolInputSchema = z.strictObject({
  decisionId: z.string().min(1),
  templateBody: z.string().min(1).describe(PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION),
  emptyTemplate: z.string().describe(PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION).optional(),
  errorTemplate: z.string().describe(PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION).optional(),
})

export interface CmsRuntimeToolBundle {
  mcpServer: AgentMcpServerConfig
  allowedTools: string[]
}

export interface BuildCmsRuntimeToolBundleOptions {
  workspace: AgentWorkspace
  sessionId: string
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
      siteId: z.string().min(1).optional(),
      ids: z.array(z.string().min(1)).optional(),
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
      ids: z.array(z.string().min(1)).optional(),
      catalogId: z.string().min(1).optional(),
      keyword: z.string().optional(),
      pageIndex: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
    async (args) => {
      assertValidListContentsToolArgs(args)
      const result = await gateway.listContents(args)
      return toToolResult(result)
    },
  )

  const decideCmsBindingTool = tool(
    PAGE_BUILDER_CMS_DECIDE_TOOL_ID,
    DECIDE_CMS_BINDING_TOOL_GUIDANCE,
    decideCmsBindingToolInputSchema as unknown as Readonly<Record<string, z.ZodTypeAny>>,
    async (rawArgs) => {
      const args = decideCmsBindingToolInputSchema.parse(rawArgs)
      const decision = normalizeDecideCmsBindingDecisionInput(args.decision)
      const currentRevision = requireCurrentRevision(options.workspace)
      const result = pageBuilderCmsBindingDecisionStore.createDecision({
        workspaceId: options.workspace.id,
        handoffId: args.handoffId,
        sessionId: options.sessionId,
        decision,
        currentRevision,
      })
      return toToolResult(result)
    },
  )

  const applyCmsBindingTool = tool(
    PAGE_BUILDER_CMS_APPLY_TOOL_ID,
    APPLY_CMS_BINDING_TOOL_GUIDANCE,
    applyCmsBindingToolInputSchema as unknown as Readonly<Record<string, z.ZodTypeAny>>,
    async (rawArgs) => {
      const args = applyCmsBindingToolInputSchema.parse(rawArgs)
      const currentRevision = requireCurrentRevision(options.workspace)
      const record = pageBuilderCmsBindingDecisionStore.readDecisionForApply({
        workspaceId: options.workspace.id,
        decisionId: args.decisionId,
        sessionId: options.sessionId,
        currentRevision,
      })

      const result = renderingTools.applyCmsBinding(options.workspace, {
        targetSelection: record.plan.targetSelection,
        targetBlock: {
          selector: record.plan.targetBlock.selector,
        },
        kind: record.plan.toolKind,
        source: record.plan.source as unknown as Record<string, unknown>,
        templateBody: args.templateBody,
        ...(args.emptyTemplate !== undefined ? { emptyTemplate: args.emptyTemplate } : {}),
        ...(args.errorTemplate !== undefined ? { errorTemplate: args.errorTemplate } : {}),
        ...(record.plan.structureGuardrails ? { structureGuardrails: record.plan.structureGuardrails } : {}),
      })

      pageBuilderCmsBindingDecisionStore.markDecisionApplied(options.workspace.id, args.decisionId)
      return toToolResult(result)
    },
  )

  return {
    mcpServer: createSdkMcpServer({
      name: CMS_RUNTIME_SERVER_NAME,
      tools: [listCatalogsTool, listContentsTool, decideCmsBindingTool, applyCmsBindingTool],
    }),
    allowedTools: [...CMS_TOOL_NAMES],
  }
}

function requireCurrentRevision(workspace: AgentWorkspace): string {
  const revision = getWorkspacePreviewState(workspace).revision
  if (!revision) {
    throw new Error('无法读取当前页面 revision，暂时不能继续 CMS apply')
  }

  return revision
}

function toToolResult(payload: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(payload, null, 2),
    }],
  }
}

function assertValidListContentsToolArgs(args: {
  ids?: string[]
  catalogId?: string
}) {
  if (args.ids?.length && !args.catalogId) {
    throw new Error('固定内容 ids 查询必须同时提供 catalogId')
  }
}

function normalizeDecideCmsBindingDecisionInput(
  rawDecision: z.infer<typeof decideCmsBindingToolInputSchema>['decision'],
): PageBuilderCmsApplyDecisionResult {
  const readyExamples = [
    'content-list => {"status":"ready","targetBlockKind":"content-list","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-content-list","toolKind":"content-list","source":{"siteId":"14","catalogId":"news"}}',
    'catalog-nav => {"status":"ready","targetBlockKind":"nav","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-nav","toolKind":"catalog-nav","source":{"siteId":"14","parentId":"root","take":6}}',
  ].join(' ; ')

  if (typeof rawDecision !== 'string') {
    if (!rawDecision || typeof rawDecision !== 'object' || Array.isArray(rawDecision)) {
      throw new Error(
        `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 必须是结构化对象。不要传字符串、数组或空值。请改为对象形态后重试。最小 ready 示例：${readyExamples}`,
      )
    }

    const normalizedDecision = decisionInputSchema.safeParse(rawDecision)
    if (!normalizedDecision.success) {
      throw new Error(
        `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 不符合合约。请修正字段后以对象形态重试，不要直接改写页面。校验详情：${normalizedDecision.error.message}。最小 ready 示例：${readyExamples}`,
      )
    }

    return normalizedDecision.data
  }

  let parsedDecision: unknown
  try {
    parsedDecision = JSON.parse(rawDecision)
  } catch {
    throw new Error(
      `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 必须是结构化对象。当前收到的是无法解析的 JSON 字符串；请先把 JSON 文本解析成对象后重试，不要直接传字符串。最小 ready 示例：${readyExamples}`,
    )
  }

  if (!parsedDecision || typeof parsedDecision !== 'object' || Array.isArray(parsedDecision)) {
    throw new Error(
      `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 必须是结构化对象。当前 JSON 字符串解析后的值不是对象；请改为传入对象形态的 \`decision\` 后重试。最小 ready 示例：${readyExamples}`,
    )
  }

  const normalizedDecision = decisionInputSchema.safeParse(parsedDecision)
  if (!normalizedDecision.success) {
    throw new Error(
      `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 必须是结构化对象。当前 JSON 字符串虽然可以解析，但解析结果不符合 decision 合约；请改为传入对象形态的 \`decision\` 后重试。校验详情：${normalizedDecision.error.message}。最小 ready 示例：${readyExamples}`,
    )
  }

  return normalizedDecision.data
}
