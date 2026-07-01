import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type {
  AgentMcpServerConfig,
  AgentWorkspace,
  PageBuilderCmsApplyDecisionResult,
} from '@ai-page-builder/shared'
import {
  PAGE_BUILDER_CMS_DECIDE_TOOL_ID,
  PAGE_BUILDER_CMS_DECIDE_TOOL_NAME,
} from '@ai-page-builder/shared'
import { CmsGatewayError, type CmsGateway } from './cms-gateway'
import {
  PageBuilderCmsBindingDecisionStoreError,
  pageBuilderCmsBindingDecisionStore,
} from './page-builder-cms-binding-decision-store'
import {
  PAGE_BUILDER_CMS_APPLY_TOOL_ID,
  PAGE_BUILDER_CMS_APPLY_TOOL_NAME,
  PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION,
  PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION,
  PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION,
  PageBuilderCmsBindingApplyError,
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

const LIST_CATALOGS_TOOL_GUIDANCE =
  [
    '列出 CMS 栏目树，返回 normalized `items` 与 `tree`。',
    '如果当前 CMS handoff / selection 已提供 `siteId`，请显式传入该 `siteId`。',
    '未传 siteId 时仅查询工具会使用默认站点 1；CMS apply decision 仍必须使用 confirmed selection.siteId，不要猜测。',
    'ids 为栏目 ID 数组，用于精确查询指定栏目；建议使用 string[]，数字 ID 会规范化为字符串；精确 ids 查询不能与 contentType 或 searchKeyword 混用。',
    '示例：按关键字查询 => {"siteId":"1","searchKeyword":"新闻"}；按栏目 ids 查询 => {"siteId":"1","ids":["16","17"]}。',
  ].join(' ')

const LIST_CONTENTS_TOOL_GUIDANCE =
  [
    '列出 CMS 内容摘要，返回 `pageIndex`、`pageSize`、`total`、`totalPages` 与 `items`。',
    '支持两种模式：栏目分页查询 => 传 siteId、catalogId，可选 keyword、pageIndex、pageSize；pageIndex 从 0 开始。',
    '固定内容查询 => 传 siteId、catalogId、ids，其中 ids 建议是 string[]，数字 ID 会规范化为字符串。',
    '固定 ids 模式不能传 keyword、pageIndex 或 pageSize。',
    'pageSize 仅用于本次查询分页，不要自动复制到后续 CMS binding decision。',
    '未传 siteId 时仅查询工具会使用默认站点 1；CMS apply decision 仍必须使用 confirmed selection.siteId，不要猜测。',
    '示例：栏目分页查询 => {"siteId":"1","catalogId":"16","pageIndex":0,"pageSize":20}；固定内容查询 => {"siteId":"1","catalogId":"16","ids":["257","254","251"]}。',
  ].join(' ')

const DECIDE_CMS_BINDING_TOOL_GUIDANCE =
  [
    '将当前 turn 在 cms-binding-apply 中得出的结构化结论物化为正式 CMS binding decision。',
    '该工具只接受当前 confirmed CMS handoff 的 `handoffId` 与结构化 `decision`，不会直接写入页面。',
    '调用顺序固定为：先 `mcp__cms__decide_cms_binding`，只有返回 `status=ready` 且拿到 `decisionId` 后，才能继续调用 `mcp__cms__apply_cms_binding`。',
    '`decision` 必须作为嵌套对象传入，不要发送 JSON 字符串；legacy string payload 只用于兼容恢复。',
    'supportedRenderModes 始终是 ["replace-current"]，不要使用 {"item":"replace-current"} 或其他 slot-keyed 对象。',
    'content-list 固定内容 ids 建议写成扁平字符串数组，例如 "ids":["257","254","251"]；数字 ID 会规范化为字符串；不要使用 {"item":[...]} 或其他 slot-keyed 对象。',
    '最小 ready 示例：',
    'content-list => {"status":"ready","targetBlockKind":"content-list","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-content-list","toolKind":"content-list","source":{"siteId":"14","catalogId":"news"}}',
    'content-list fixed ids => {"status":"ready","targetBlockKind":"content-list","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-content-list","toolKind":"content-list","source":{"siteId":"1","catalogId":"16","ids":["257","254","251"]}}',
    'catalog-nav => {"status":"ready","targetBlockKind":"nav","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-nav","toolKind":"catalog-nav","source":{"siteId":"14","parentId":"root","take":6}}',
  ].join(' ')

const APPLY_CMS_BINDING_TOOL_GUIDANCE =
  [
    '消费已持久化的 `decisionId`，将 CMS 数据绑定到当前 page-builder 区块，并写入 cms-catalog 或 cms-content 标记。',
    '调用前提：必须先由 `mcp__cms__decide_cms_binding` 返回 `status=ready` 和 `decisionId`。',
    '该工具只接受 `decisionId`、`templateBody`、`emptyTemplate`、`errorTemplate`；不要传 targetSelection、siteId、source props 或其他 raw binding identity 字段。',
    '工具会自动生成外层 cms-catalog / cms-content；调用者只提供 slot 内部内容，不要包含外层 `cms-catalog` / `cms-content` 标签。',
    '`templateBody`、`emptyTemplate`、`errorTemplate` 通常承载当前 decision 下 slot 拥有的动态结构；如果 decision 要求保留现有外层壳层，请只提供与壳层兼容的内部节点，例如已有 ul/ol 时只提供 li。',
    '如果传了单层最外层 `<template v-slot:...>` 或 `<template #...>` 包装，运行时会自动解包；嵌套 slot template 不支持。',
    '工具会自动在生成出来的 cms-catalog / cms-content 源码前加入宿主管理注释；保留这段注释，不要再为该区域额外引入整页 Vue runtime。',
    '不要根据 CMS 浏览弹框当前的分页大小推断页面绑定的 `pageSize`。固定内容 ids 禁止传 `pageSize`；如需限制栏目数量请使用 `take`。',
  ].join(' ')

const cmsIdLikeSchema = z.union([
  z.string().min(1),
  z.number().int().nonnegative().transform((value) => String(value)),
])

const catalogSourceSchema = z.object({
  siteId: cmsIdLikeSchema,
  ids: z.array(cmsIdLikeSchema).optional(),
  level: z.string().optional(),
  parentId: z.string().optional(),
  contentType: z.string().optional(),
  searchKeyword: z.string().optional(),
  take: z.union([z.string(), z.number().int().min(0)]).optional(),
}).strict()

const contentSourceSchema = z.object({
  siteId: cmsIdLikeSchema,
  ids: z.array(cmsIdLikeSchema).optional(),
  catalogId: cmsIdLikeSchema,
  keyword: z.string().optional(),
  pageIndex: z.union([z.string(), z.number().int().min(0)]).optional(),
  pageSize: z.union([z.string(), z.number().int().min(1).max(100)]).optional(),
}).strict()

const readyDecisionBaseSchema = z.object({
  status: z.literal('ready'),
  targetBlockKind: z.enum(['nav', 'catalog-list', 'content-list']),
  supportedRenderModes: z.array(z.literal('replace-current'))
    .length(1, 'supportedRenderModes 必须严格等于 ["replace-current"]'),
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
  'Pass `decision` as a nested object. Do not JSON-stringify it. supportedRenderModes is always ["replace-current"], never {"item":"replace-current"}. For content fixed IDs, source.ids is a flat array; strings are canonical and numeric ids are normalized to strings, never {"item":[...]}. If a legacy JSON string was used, parse it back into an object and retry. Minimal ready examples: content-list => {"status":"ready","targetBlockKind":"content-list","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-content-list","toolKind":"content-list","source":{"siteId":"14","catalogId":"news"}} ; content-list fixed ids => {"status":"ready","targetBlockKind":"content-list","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-content-list","toolKind":"content-list","source":{"siteId":"1","catalogId":"16","ids":["257","254","251"]}} ; catalog-nav => {"status":"ready","targetBlockKind":"nav","supportedRenderModes":["replace-current"],"renderMode":"replace-current","applyStrategy":"replace-current","mappingKind":"catalog-nav","toolKind":"catalog-nav","source":{"siteId":"14","parentId":"root","take":6}}.'

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

type CmsRuntimeToolName = 'list_catalogs' | 'list_contents' | 'decide_cms_binding' | 'apply_cms_binding'
type CmsSdkToolErrorCode = 'input-invalid' | 'revision-missing'
const CMS_TOOL_ERROR_DETAIL_MAX_LENGTH = 220
type SdkToolCallRequest = {
  method: 'tools/call'
  params: {
    name: string
    arguments?: unknown
  }
}
type SdkToolCallResult = {
  content?: Array<{
    text?: string
  }>
  isError?: boolean
}
type SdkToolCallHandler = (request: SdkToolCallRequest, extra: unknown) => Promise<SdkToolCallResult>

class CmsSdkToolError extends Error {
  constructor(
    readonly code: CmsSdkToolErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CmsSdkToolError'
  }
}

export function buildCmsRuntimeToolBundle(
  gateway: CmsGateway,
  options: BuildCmsRuntimeToolBundleOptions,
): CmsRuntimeToolBundle {
  const renderingTools = createPageBuilderCmsRenderingTools()
  const listCatalogsTool = tool(
    'list_catalogs',
    LIST_CATALOGS_TOOL_GUIDANCE,
    {
      siteId: cmsIdLikeSchema.describe('CMS site id. If omitted, this query tool defaults to site 1 only for lookup; CMS apply decisions must use confirmed selection.siteId. Numeric ids are normalized to strings.').optional(),
      ids: z.array(cmsIdLikeSchema).describe('Exact catalog ids as a flat string/number array, e.g. ["16","17"]. Numeric ids are normalized to strings. Do not combine with contentType or searchKeyword.').optional(),
      contentType: z.string().describe('Optional catalog content type filter for tree/search mode only; do not combine with ids.').optional(),
      searchKeyword: z.string().describe('Optional catalog keyword filter for tree/search mode only; do not combine with ids.').optional(),
    },
    async (args) => {
      return executeCmsTool('list_catalogs', async () => {
        assertValidListCatalogsToolArgs(args)
        const result = await gateway.listCatalogs(args)
        return toToolResult(result)
      })
    },
  )

  const listContentsTool = tool(
    'list_contents',
    LIST_CONTENTS_TOOL_GUIDANCE,
    {
      siteId: cmsIdLikeSchema.describe('CMS site id. If omitted, this query tool defaults to site 1 only for lookup; CMS apply decisions must use confirmed selection.siteId. Numeric ids are normalized to strings.').optional(),
      ids: z.array(cmsIdLikeSchema).describe('Exact content ids as a flat string/number array, e.g. ["257","254"]. Numeric ids are normalized to strings. Requires catalogId and cannot be combined with keyword, pageIndex, or pageSize.').optional(),
      catalogId: cmsIdLikeSchema.describe('CMS catalog id. Required for content paging and fixed content ids lookup. Numeric ids are normalized to strings.').optional(),
      keyword: z.string().describe('Optional content keyword for catalog paging mode only; do not combine with ids.').optional(),
      pageIndex: z.number().int().min(0).describe('Zero-based page index for this lookup only; do not copy into CMS binding decisions unless explicitly intended.').optional(),
      pageSize: z.number().int().min(1).max(100).describe('Page size for this lookup only; fixed ids mode must not pass pageSize.').optional(),
    },
    async (args) => {
      return executeCmsTool('list_contents', async () => {
        assertValidListContentsToolArgs(args)
        const result = await gateway.listContents(args)
        return toToolResult(result)
      })
    },
  )

  const decideCmsBindingTool = tool(
    PAGE_BUILDER_CMS_DECIDE_TOOL_ID,
    DECIDE_CMS_BINDING_TOOL_GUIDANCE,
    decideCmsBindingToolInputSchema as unknown as Readonly<Record<string, z.ZodTypeAny>>,
    async (rawArgs) => {
      return executeCmsTool('decide_cms_binding', async () => {
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
      })
    },
  )

  const applyCmsBindingTool = tool(
    PAGE_BUILDER_CMS_APPLY_TOOL_ID,
    APPLY_CMS_BINDING_TOOL_GUIDANCE,
    applyCmsBindingToolInputSchema as unknown as Readonly<Record<string, z.ZodTypeAny>>,
    async (rawArgs) => {
      return executeCmsTool('apply_cms_binding', async () => {
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
      })
    },
  )

  const mcpServer = createSdkMcpServer({
    name: CMS_RUNTIME_SERVER_NAME,
    tools: [listCatalogsTool, listContentsTool, decideCmsBindingTool, applyCmsBindingTool],
  })
  installCmsSdkToolCallErrorFormatter(mcpServer)

  return {
    mcpServer,
    allowedTools: [...CMS_TOOL_NAMES],
  }
}

function requireCurrentRevision(workspace: AgentWorkspace): string {
  const revision = getWorkspacePreviewState(workspace).revision
  if (!revision) {
    throw new CmsSdkToolError('revision-missing', '无法读取当前页面 revision，暂时不能继续 CMS apply')
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

function assertValidListCatalogsToolArgs(args: {
  ids?: string[]
  contentType?: string
  searchKeyword?: string
}) {
  if (!args.ids?.length) {
    return
  }

  if (args.contentType !== undefined || args.searchKeyword !== undefined) {
    throw new CmsSdkToolError(
      'input-invalid',
      '固定栏目 ids 查询不能与 contentType 或 searchKeyword 混用。正确形态：{"siteId":"...","ids":["..."]}。',
    )
  }
}

function assertValidListContentsToolArgs(args: {
  ids?: string[]
  catalogId?: string
  keyword?: string
  pageIndex?: number
  pageSize?: number
}) {
  if (!args.ids?.length) {
    return
  }

  if (!args.catalogId) {
    throw new CmsSdkToolError(
      'input-invalid',
      '固定内容 ids 查询必须同时提供 catalogId。正确形态：{"catalogId":"...","ids":["..."]}；固定 ids 模式不要传 keyword、pageIndex 或 pageSize。',
    )
  }

  if (args.keyword !== undefined || args.pageIndex !== undefined || args.pageSize !== undefined) {
    throw new CmsSdkToolError(
      'input-invalid',
      '固定内容 ids 查询不能与 keyword、pageIndex 或 pageSize 混用。正确形态：{"catalogId":"...","ids":["..."]}；固定 ids 模式不要传 keyword、pageIndex 或 pageSize。',
    )
  }
}

function normalizeDecideCmsBindingDecisionInput(
  rawDecision: z.infer<typeof decideCmsBindingToolInputSchema>['decision'],
): PageBuilderCmsApplyDecisionResult {
  if (typeof rawDecision !== 'string') {
    if (!rawDecision || typeof rawDecision !== 'object' || Array.isArray(rawDecision)) {
      throw new CmsSdkToolError(
        'input-invalid',
        '`mcp__cms__decide_cms_binding` 的 `decision` 必须是结构化对象。不要传字符串、数组或空值。请改为对象形态后重试，并按工具文档中的 ready 示例修正。',
      )
    }

    const normalizedDecision = parseDecisionWithRelevantSchema(rawDecision)
    if (!normalizedDecision.success) {
      throw new CmsSdkToolError(
        'input-invalid',
        `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 不符合合约。请修正字段后以对象形态重试，不要直接改写页面。校验摘要：${formatDecisionValidationSummary(rawDecision, normalizedDecision.error)}。请按工具文档中的 ready 示例修正。`,
      )
    }

    return normalizedDecision.data
  }

  let parsedDecision: unknown
  try {
    parsedDecision = JSON.parse(rawDecision)
  } catch {
    throw new CmsSdkToolError(
      'input-invalid',
      '`mcp__cms__decide_cms_binding` 的 `decision` 必须是结构化对象。当前收到的是无法解析的 JSON 字符串；请先把 JSON 文本解析成对象后重试，不要直接传字符串，并按工具文档中的 ready 示例修正。',
    )
  }

  if (!parsedDecision || typeof parsedDecision !== 'object' || Array.isArray(parsedDecision)) {
    throw new CmsSdkToolError(
      'input-invalid',
      '`mcp__cms__decide_cms_binding` 的 `decision` 必须是结构化对象。当前 JSON 字符串解析后的值不是对象；请改为传入对象形态的 `decision` 后重试，并按工具文档中的 ready 示例修正。',
    )
  }

  const normalizedDecision = parseDecisionWithRelevantSchema(parsedDecision)
  if (!normalizedDecision.success) {
    throw new CmsSdkToolError(
      'input-invalid',
      `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 必须是结构化对象。当前 JSON 字符串虽然可以解析，但解析结果不符合 decision 合约；请改为传入对象形态的 \`decision\` 后重试。校验摘要：${formatDecisionValidationSummary(parsedDecision, normalizedDecision.error)}。请按工具文档中的 ready 示例修正。`,
    )
  }

  return normalizedDecision.data
}

function parseDecisionWithRelevantSchema(rawDecision: unknown) {
  const relevantSchema = resolveRelevantDecisionSchema(rawDecision)
  return relevantSchema.safeParse(rawDecision)
}

function resolveRelevantDecisionSchema(rawDecision: unknown): typeof decisionInputSchema {
  if (!isRecord(rawDecision)) {
    return decisionInputSchema
  }

  if (rawDecision.status === 'needs-clarification') {
    return clarificationDecisionSchema as unknown as typeof decisionInputSchema
  }

  if (rawDecision.status === 'incompatible') {
    return incompatibleDecisionSchema as unknown as typeof decisionInputSchema
  }

  if (rawDecision.status !== 'ready') {
    return decisionInputSchema
  }

  if (
    rawDecision.toolKind === 'content-list'
    || rawDecision.mappingKind === 'catalog-content-list'
    || rawDecision.targetBlockKind === 'content-list'
  ) {
    return contentReadyDecisionSchema as unknown as typeof decisionInputSchema
  }

  if (
    rawDecision.toolKind === 'catalog-nav'
    || rawDecision.mappingKind === 'catalog-nav'
    || rawDecision.targetBlockKind === 'nav'
    || rawDecision.targetBlockKind === 'catalog-list'
  ) {
    return catalogReadyDecisionSchema as unknown as typeof decisionInputSchema
  }

  return decisionInputSchema
}

async function executeCmsTool<T>(
  toolName: CmsRuntimeToolName,
  execute: () => Promise<T> | T,
): Promise<T> {
  try {
    return await execute()
  } catch (error) {
    throw new Error(formatCmsToolError(toolName, error))
  }
}

function formatCmsToolError(toolName: CmsRuntimeToolName, error: unknown): string {
  if (error instanceof z.ZodError) {
    return formatCmsZodToolError(toolName, error)
  }

  if (error instanceof CmsGatewayError) {
    return formatCmsGatewayToolError(error)
  }

  if (error instanceof PageBuilderCmsBindingDecisionStoreError) {
    return formatCmsDecisionStoreError(error)
  }

  if (error instanceof PageBuilderCmsBindingApplyError) {
    return formatCmsApplyToolError(error)
  }

  if (error instanceof CmsSdkToolError) {
    return formatCmsSdkToolError(toolName, error)
  }

  return formatGuidedToolError(
    `CMS 工具执行失败：${sanitizeCmsToolErrorMessage(extractCmsToolErrorMessage(error))}`,
    '停止当前 CMS 调用链并交由宿主侧进一步排查。',
    '不要伪造缺失上下文、不要推断成功结果，也不要继续执行依赖本次失败结果的后续 CMS tool。',
  )
}

function formatCmsGatewayToolError(error: CmsGatewayError): string {
  const safeMessage = sanitizeCmsToolErrorMessage(error.message)
  if (error.code === 'auth') {
    return formatGuidedToolError(
      `CMS 上游鉴权或权限检查失败：${safeMessage}`,
      '先检查 CMS 配置或权限，确认宿主侧账号、密码或访问权限已修复后再重试当前工具。',
      '不要伪造栏目、内容、`handoffId`、`decisionId`，也不要宣称本次 CMS 操作已经成功。',
    )
  }

  if (error.code === 'upstream') {
    return formatGuidedToolError(
      `CMS 上游请求失败：${safeMessage}`,
      '仅在确认上游 CMS 已恢复后稍后重试；如果问题持续存在，交由宿主侧排查 CMS 网络或服务状态。',
      '不要伪造栏目、内容、`handoffId`、`decisionId`，也不要宣称本次 CMS 操作已经成功。',
    )
  }

  if (error.code === 'invalid_request') {
    return formatGuidedToolError(
      `CMS tool 输入不合法：${safeMessage}`,
      '修正 tool 参数后重试。',
      '不要在不改动参数的情况下重复提交同一次调用，也不要猜测缺失字段。',
    )
  }

  if (error.code === 'config') {
    return formatGuidedToolError(
      `CMS 宿主配置不可用：${safeMessage}`,
      '先修复宿主侧 CMS 配置，再重新尝试当前工具。',
      '不要伪造栏目、内容、`handoffId`、`decisionId`，也不要把当前失败误判为内容不存在。',
    )
  }

  return formatGuidedToolError(
    `CMS 上游返回了不可用的响应：${safeMessage}`,
    '停止当前 CMS 调用链并交由宿主侧排查上游响应或协议兼容性问题。',
    '不要伪造栏目、内容、`handoffId`、`decisionId`，也不要宣称本次 CMS 操作已经成功。',
  )
}

function formatCmsDecisionStoreError(error: PageBuilderCmsBindingDecisionStoreError): string {
  const safeMessage = sanitizeCmsToolErrorMessage(error.message)
  switch (error.code) {
    case 'handoff-not-found':
      return formatGuidedToolError(
        `当前 CMS handoff 上下文不可用：${safeMessage}`,
        '基于当前最新选中区域和作者态上下文重新发起 CMS handoff，然后重新调用 `mcp__cms__decide_cms_binding`。',
        '不要猜测 `handoffId`，也不要直接调用 `mcp__cms__apply_cms_binding`。',
      )
    case 'handoff-session-mismatch':
      return formatGuidedToolError(
        `当前 CMS handoff 与当前会话不匹配：${safeMessage}`,
        '在当前会话中重新创建 handoff，然后重新调用 `mcp__cms__decide_cms_binding`。',
        '不要复用其他会话里的 handoff，也不要直接调用 `mcp__cms__apply_cms_binding`。',
      )
    case 'decision-not-found':
    case 'decision-consumed':
    case 'decision-session-mismatch':
      return formatGuidedToolError(
        `当前 decisionId 不可继续用于正式 CMS apply：${safeMessage}`,
        '基于当前会话中的 CMS 选择结果重新执行 `mcp__cms__decide_cms_binding`，拿到新的 `decisionId` 后再 apply。',
        '不要重复使用当前 decisionId，也不要在未拿到新的 decisionId 时继续调用 `mcp__cms__apply_cms_binding`。',
      )
    case 'decision-conflict':
      return formatGuidedToolError(
        `当前 decision 与已确认的 CMS 选择不一致：${safeMessage}`,
        '核对当前选中目标与 decision.source，修正 decision 对象后重新调用 `mcp__cms__decide_cms_binding`。',
        '不要复用旧目标上的 handoff 结果去推断当前目标的 CMS binding 方案，也不要直接改写页面。',
      )
  }
}

function formatCmsApplyToolError(error: PageBuilderCmsBindingApplyError): string {
  const safeMessage = sanitizeCmsToolErrorMessage(error.message)
  switch (error.code) {
    case 'invalid-input':
      return formatGuidedToolError(
        `CMS apply 输入或模板不合法：${safeMessage}`,
        '修正模板字段或工具参数后重试；如当前页面上下文已变化，先重新走 handoff / decision。',
        '不要跳过校验直接写页面，也不要在不修改输入的情况下重复调用。',
      )
    case 'entry-missing':
      return formatGuidedToolError(
        `当前页面作者态上下文不可用：${safeMessage}`,
        '先恢复预览入口或重新获取最新作者态上下文，再重新走 handoff / decision / apply 链路。',
        '不要猜测 revision，也不要宣称当前页面已经完成 CMS 绑定。',
      )
    case 'block-not-found':
    case 'selector-not-unique':
      return formatGuidedToolError(
        `当前目标定位已失效：${safeMessage}`,
        '重新确认当前选中区域并重新发起 CMS handoff，然后重新执行 decision 和 apply。',
        '不要沿用旧的 targetSelection 或直接改写页面。',
      )
    case 'mutation-failed':
      return formatGuidedToolError(
        `CMS apply 未完成：${safeMessage}`,
        '停止当前 CMS 调用链；请把该失败作为未应用处理，并交由宿主侧排查页面校验或写回状态。',
        '不要宣称本次 CMS 绑定已成功，也不要继续执行依赖这次 apply 成功的后续操作。',
      )
  }
}

function formatCmsSdkToolError(toolName: CmsRuntimeToolName, error: CmsSdkToolError): string {
  const safeMessage = sanitizeCmsToolErrorMessage(error.message)
  if (error.code === 'revision-missing') {
    return formatGuidedToolError(
      `当前页面 authoring revision 不可用：${safeMessage}`,
      '重新获取最新作者态上下文，再重新走 handoff / decision / apply 链路。',
      '不要猜测 revision，也不要宣称当前页面已经完成 CMS 绑定。',
    )
  }

  return formatCmsToolContractError(toolName, safeMessage, { decideSummaryAsRaw: true })
}

function formatCmsZodToolError(toolName: CmsRuntimeToolName, error: z.ZodError): string {
  const issueMessage = sanitizeCmsToolErrorMessage(formatZodIssueSummary(error))
  return formatCmsToolContractError(toolName, issueMessage)
}

function formatGuidedToolError(summary: string, nextStep: string, forbiddenAction: string): string {
  return [
    '状态：CMS 工具未完成',
    `原因：${summary}`,
    `下一步：${nextStep}`,
    `不要：${forbiddenAction}`,
  ].join('\n')
}

function extractCmsToolErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return '未知错误'
}

function sanitizeCmsToolErrorMessage(message: string): string {
  const summarizedValidation = summarizeStructuredValidationIssues(message)
  const normalized = (summarizedValidation ?? message)
    .replace(/```[\s\S]*?```/g, '[代码片段已省略]')
    .replace(/(?:[A-Za-z]:\\|\/Users\/|\/home\/|\/var\/|\/tmp\/|\/private\/|\/opt\/|\/Volumes\/)[^\s,;:()"'`]+/g, '[REDACTED_PATH]')
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(authorization|token|access_token|refresh_token|cookie)\s*[:=]?\s*([^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\b(username|user)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\b(password|passwd|pwd)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()

  const compressedTemplateWrappers = compressVerboseSlotTemplateWrappers(normalized)
  const compressedHtmlLike = compressVerboseHtmlLikeFragments(compressedTemplateWrappers)
  if (compressedHtmlLike.length <= CMS_TOOL_ERROR_DETAIL_MAX_LENGTH) {
    return compressedHtmlLike
  }

  return `${compressedHtmlLike.slice(0, CMS_TOOL_ERROR_DETAIL_MAX_LENGTH)}…（细节已截断）`
}

function formatZodIssueSummary(error: z.ZodError): string {
  const summaries = flattenIssueSummaries(error.issues)
  return formatIssueSummaryList(summaries)
}

function formatDecisionValidationSummary(rawDecision: unknown, error: z.ZodError): string {
  const fieldFixes = collectDecisionFieldFixes(rawDecision)
  if (fieldFixes.length === 0) {
    return formatZodIssueSummary(error)
  }

  const additionalIssueSummary = formatFirstAdditionalIssueSummary(error, fieldFixes)
  return additionalIssueSummary
    ? `${fieldFixes.join('；')}；${additionalIssueSummary}`
    : fieldFixes.join('；')
}

function collectDecisionFieldFixes(rawDecision: unknown): string[] {
  if (!isRecord(rawDecision) || rawDecision.status !== 'ready') {
    return []
  }

  const fixes: string[] = []
  const supportedRenderModes = rawDecision.supportedRenderModes
  if (!Array.isArray(supportedRenderModes)) {
    fixes.push('supportedRenderModes 应为 ["replace-current"]')
  } else if (
    supportedRenderModes.length !== 1
    || supportedRenderModes.some((mode) => mode !== 'replace-current')
  ) {
    fixes.push('supportedRenderModes 必须严格等于 ["replace-current"]')
  }

  const source = rawDecision.source
  if (rawDecision.toolKind === 'content-list' && isRecord(source) && !Object.prototype.hasOwnProperty.call(source, 'catalogId')) {
    fixes.push('字段 source.catalogId 缺失')
  }
  if (isRecord(source) && Object.prototype.hasOwnProperty.call(source, 'ids')) {
    const ids = source.ids
    if (!Array.isArray(ids)) {
      fixes.push(`source.ids 应为 string[]/number[]；不要使用 {"item":...} 包装`)
    } else {
      const invalidIndex = ids.findIndex((id) => !isValidCmsIdLikeValue(id))
      if (invalidIndex >= 0) {
        fixes.push('source.ids 应为 string[] 或 number[]')
        fixes.push(`source.ids[${invalidIndex}] 必须是非空字符串或数字`)
      }
    }
  }

  appendReadyDecisionDiscriminatorFixes(rawDecision, fixes)

  return fixes
}

type ReadyDecisionToolKind = 'content-list' | 'catalog-nav'

function appendReadyDecisionDiscriminatorFixes(rawDecision: Record<string, unknown>, fixes: string[]): void {
  const targetToolKind = inferToolKindFromTargetBlockKind(rawDecision.targetBlockKind)
  const mappingToolKind = inferToolKindFromMappingKind(rawDecision.mappingKind)
  const explicitToolKind = isReadyDecisionToolKind(rawDecision.toolKind) ? rawDecision.toolKind : null

  appendTargetBlockKindFix(rawDecision, fixes, mappingToolKind ?? explicitToolKind)
  appendMappingKindFix(rawDecision, fixes, targetToolKind ?? explicitToolKind)
  appendToolKindFix(rawDecision, fixes, mappingToolKind ?? targetToolKind)
}

function appendTargetBlockKindFix(
  rawDecision: Record<string, unknown>,
  fixes: string[],
  expectedToolKind: ReadyDecisionToolKind | null,
): void {
  if (!Object.prototype.hasOwnProperty.call(rawDecision, 'targetBlockKind')) {
    fixes.push('字段 targetBlockKind 缺失；content-list 使用 "content-list"，catalog-nav 使用 "nav|catalog-list"')
    return
  }

  const actualToolKind = inferToolKindFromTargetBlockKind(rawDecision.targetBlockKind)
  if (!actualToolKind) {
    fixes.push('字段 targetBlockKind 无效；content-list 使用 "content-list"，catalog-nav 使用 "nav|catalog-list"')
    return
  }

  if (expectedToolKind && actualToolKind !== expectedToolKind) {
    fixes.push(`字段 targetBlockKind 与 mappingKind/toolKind 不一致；${formatTargetBlockKindExpectation(expectedToolKind)}`)
  }
}

function appendMappingKindFix(
  rawDecision: Record<string, unknown>,
  fixes: string[],
  expectedToolKind: ReadyDecisionToolKind | null,
): void {
  if (!Object.prototype.hasOwnProperty.call(rawDecision, 'mappingKind')) {
    fixes.push(expectedToolKind
      ? `字段 mappingKind 缺失；当前应为 "${mappingKindForToolKind(expectedToolKind)}"`
      : '字段 mappingKind 缺失')
    return
  }

  const actualToolKind = inferToolKindFromMappingKind(rawDecision.mappingKind)
  if (!actualToolKind) {
    fixes.push(expectedToolKind
      ? `字段 mappingKind 无效；当前应为 "${mappingKindForToolKind(expectedToolKind)}"`
      : '字段 mappingKind 无效；content-list 使用 "catalog-content-list"，catalog-nav 使用 "catalog-nav"')
    return
  }

  if (expectedToolKind && actualToolKind !== expectedToolKind) {
    fixes.push(`字段 mappingKind 与 targetBlockKind/toolKind 不一致；当前应为 "${mappingKindForToolKind(expectedToolKind)}"`)
  }
}

function appendToolKindFix(
  rawDecision: Record<string, unknown>,
  fixes: string[],
  expectedToolKind: ReadyDecisionToolKind | null,
): void {
  if (!Object.prototype.hasOwnProperty.call(rawDecision, 'toolKind')) {
    fixes.push(expectedToolKind
      ? `字段 toolKind 缺失；当前应为 "${expectedToolKind}"`
      : '字段 toolKind 缺失')
    return
  }

  if (!isReadyDecisionToolKind(rawDecision.toolKind)) {
    fixes.push(expectedToolKind
      ? `字段 toolKind 无效；当前应为 "${expectedToolKind}"`
      : '字段 toolKind 无效；content-list 使用 "content-list"，catalog-nav 使用 "catalog-nav"')
    return
  }

  if (expectedToolKind && rawDecision.toolKind !== expectedToolKind) {
    fixes.push(`字段 toolKind 与 targetBlockKind/mappingKind 不一致；当前应为 "${expectedToolKind}"`)
  }
}

function inferToolKindFromTargetBlockKind(value: unknown): ReadyDecisionToolKind | null {
  if (value === 'content-list') {
    return 'content-list'
  }

  if (value === 'nav' || value === 'catalog-list') {
    return 'catalog-nav'
  }

  return null
}

function inferToolKindFromMappingKind(value: unknown): ReadyDecisionToolKind | null {
  if (value === 'catalog-content-list') {
    return 'content-list'
  }

  if (value === 'catalog-nav') {
    return 'catalog-nav'
  }

  return null
}

function isReadyDecisionToolKind(value: unknown): value is ReadyDecisionToolKind {
  return value === 'content-list' || value === 'catalog-nav'
}

function mappingKindForToolKind(toolKind: ReadyDecisionToolKind): string {
  return toolKind === 'content-list' ? 'catalog-content-list' : 'catalog-nav'
}

function formatTargetBlockKindExpectation(toolKind: ReadyDecisionToolKind): string {
  return toolKind === 'content-list'
    ? '当前应为 "content-list"'
    : '当前应为 "nav" 或 "catalog-list"'
}

function isValidCmsIdLikeValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function formatFirstAdditionalIssueSummary(error: z.ZodError, existingFixes: string[]): string | null {
  const summaries = flattenIssueSummaries(error.issues)
  const issue = summaries.find((summary) => {
    if (!summary.path) {
      return false
    }

    return !existingFixes.some((fix) => fix.includes(summary.path))
  })

  if (!issue) {
    return null
  }

  return issue.path
    ? `字段 ${issue.path}: ${issue.message}`
    : issue.message
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function summarizeStructuredValidationIssues(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed || !['[', '{'].includes(trimmed[0]!)) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    const summaries = Array.isArray(parsed)
      ? flattenIssueSummaries(parsed)
      : parsed && typeof parsed === 'object' && 'issues' in parsed && Array.isArray((parsed as { issues?: unknown[] }).issues)
        ? flattenIssueSummaries((parsed as { issues: unknown[] }).issues)
        : []

    return summaries.length > 0 ? formatIssueSummaryList(summaries) : null
  } catch {
    return null
  }
}

function flattenIssueSummaries(rawIssues: unknown[]): Array<{ path: string; message: string }> {
  const summaries: Array<{ path: string; message: string }> = []

  for (const rawIssue of rawIssues) {
    if (!rawIssue || typeof rawIssue !== 'object') {
      continue
    }

    const nestedErrors = (rawIssue as { errors?: unknown }).errors
    if (Array.isArray(nestedErrors)) {
      const nestedSummaries = nestedErrors.flatMap((entry) => Array.isArray(entry) ? flattenIssueSummaries(entry) : [])
      if (nestedSummaries.length > 0) {
        summaries.push(...nestedSummaries)
        continue
      }
    }

    const message = typeof (rawIssue as { message?: unknown }).message === 'string'
      ? (rawIssue as { message: string }).message
      : null
    if (!message) {
      continue
    }

    const path = formatIssuePath(Array.isArray((rawIssue as { path?: unknown }).path) ? (rawIssue as { path: unknown[] }).path : [])
    summaries.push({ path, message })
  }

  return summaries
}

function formatIssuePath(path: unknown[]): string {
  if (path.length === 0) {
    return ''
  }

  return path
    .map((segment) => typeof segment === 'number' ? `[${segment}]` : String(segment))
    .join('.')
    .replace(/\.\[/g, '[')
}

function formatIssueSummaryList(summaries: Array<{ path: string; message: string }>): string {
  const firstSummary = summaries[0]
  if (!firstSummary) {
    return '输入不符合当前工具合约'
  }

  const baseMessage = firstSummary.path
    ? `字段 ${firstSummary.path}: ${firstSummary.message}`
    : firstSummary.message
  const remainingCount = summaries.length - 1

  return remainingCount > 0
    ? `${baseMessage}；另有 ${remainingCount} 个字段需要修正`
    : baseMessage
}

function compressVerboseHtmlLikeFragments(message: string): string {
  const htmlLikeMatches = message.match(/<\/?[a-z][^>]*>/gi) ?? []
  if (message.length < 120 || htmlLikeMatches.length < 2) {
    return message
  }

  return message
    .replace(/<\/?(?!(?:script|style|template|cms-catalog|cms-content)\b)[a-z][^>]*>/gi, '[HTML片段]')
    .replace(/(?:[A-Za-z]:\\|\/Users\/|\/home\/|\/var\/|\/tmp\/|\/private\/|\/opt\/|\/Volumes\/)[^\s,;:()"'`]+/g, '[REDACTED_PATH]')
    .replace(/\s+/g, ' ')
    .trim()
}

function compressVerboseSlotTemplateWrappers(message: string): string {
  if (message.length < 120 || !/<template\b/i.test(message)) {
    return message
  }

  return message
    .replace(
      /<template\b[^>]*(?:v-slot(?::[\w-]+)?|#[\w-]+)[^>]*>[\s\S]*?<\/template>/gi,
      '[模板片段已省略]',
    )
    .replace(
      /<template\b[^>]*(?:v-slot(?::[\w-]+)?|#[\w-]+)[^>]*>/gi,
      '[模板片段已省略]',
    )
}

function installCmsSdkToolCallErrorFormatter(mcpServer: AgentMcpServerConfig): void {
  const requestHandlers = (mcpServer as {
    instance?: {
      server?: {
        _requestHandlers?: Map<string, SdkToolCallHandler>
      }
    }
  }).instance?.server?._requestHandlers

  if (!(requestHandlers instanceof Map)) {
    return
  }

  const originalHandler = requestHandlers.get('tools/call')
  if (typeof originalHandler !== 'function') {
    return
  }

  requestHandlers.set('tools/call', async (request, extra) => {
    const result = await originalHandler(request, extra)
    return rewriteCmsSdkToolCallErrorResult(request, result)
  })
}

function rewriteCmsSdkToolCallErrorResult(request: SdkToolCallRequest, result: SdkToolCallResult): SdkToolCallResult {
  if (!result.isError) {
    return result
  }

  const toolName = resolveCmsRuntimeToolName(request.params.name)
  if (!toolName) {
    return result
  }

  const currentMessage = result.content?.[0]?.text
  if (!currentMessage) {
    return result
  }

  const validationDetail = extractSdkToolValidationDetail(currentMessage)
  if (!validationDetail) {
    return result
  }

  return {
    ...result,
    content: [{
      ...(result.content?.[0] ?? {}),
      text: formatCmsSdkValidationToolError(toolName, validationDetail),
    }],
  }
}

function resolveCmsRuntimeToolName(rawToolName: string): CmsRuntimeToolName | null {
  switch (rawToolName) {
    case 'list_catalogs':
    case 'mcp__cms__list_catalogs':
      return 'list_catalogs'
    case 'list_contents':
    case 'mcp__cms__list_contents':
      return 'list_contents'
    case PAGE_BUILDER_CMS_DECIDE_TOOL_ID:
    case PAGE_BUILDER_CMS_DECIDE_TOOL_NAME:
      return 'decide_cms_binding'
    case PAGE_BUILDER_CMS_APPLY_TOOL_ID:
    case PAGE_BUILDER_CMS_APPLY_TOOL_NAME:
      return 'apply_cms_binding'
    default:
      return null
  }
}

function extractSdkToolValidationDetail(message: string): string | null {
  const match = message.match(/^(?:MCP error -32602:\s*)?Input validation error: Invalid arguments for tool [^:]+:\s*([\s\S]+)$/)
  return match?.[1]?.trim() || null
}

function formatCmsSdkValidationToolError(toolName: CmsRuntimeToolName, validationDetail: string): string {
  return formatCmsToolContractError(toolName, formatSpecificSdkValidationDetail(toolName, validationDetail))
}

function formatSpecificSdkValidationDetail(toolName: CmsRuntimeToolName, validationDetail: string): string {
  const safeDetail = sanitizeCmsToolErrorMessage(validationDetail)
  if (toolName === 'list_contents' && /\bids\b/.test(safeDetail) && /array|string\[\]|expected array/i.test(safeDetail)) {
    return 'ids 必须是数组，元素应为字符串或数字；不要写成字符串或 {"item":[...]} 对象。正确形态：{"siteId":"...","catalogId":"...","ids":["..."]}。'
  }

  if (toolName === 'list_catalogs' && /\bids\b/.test(safeDetail) && /array|string\[\]|expected array/i.test(safeDetail)) {
    return 'ids 必须是数组，元素应为字符串或数字；不要写成字符串或 {"item":[...]} 对象。正确形态：{"siteId":"...","ids":["..."]}。'
  }

  return safeDetail
}

function formatCmsToolContractError(
  toolName: CmsRuntimeToolName,
  detail: string,
  options: {
    decideSummaryAsRaw?: boolean
  } = {},
): string {
  if (toolName === 'apply_cms_binding') {
    return formatGuidedToolError(
      `CMS apply 输入不合法：${detail}`,
      '修正模板字段或工具参数后重试；如当前页面上下文已变化，先重新走 handoff / decision。',
      '不要跳过校验直接写页面，也不要在不修改输入的情况下重复调用。',
    )
  }

  if (toolName === 'decide_cms_binding') {
    return formatGuidedToolError(
      options.decideSummaryAsRaw ? detail : `CMS decision 输入不合法：${detail}`,
      options.decideSummaryAsRaw
        ? '请修正 decision 对象后重新调用 `mcp__cms__decide_cms_binding`，并按工具文档中的 ready 示例修正。'
        : '修正 `handoffId` 或 `decision` 对象后重新调用 `mcp__cms__decide_cms_binding`。',
      '不要直接调用 `mcp__cms__apply_cms_binding`，也不要直接改写页面。',
    )
  }

  return formatGuidedToolError(
    `CMS tool 输入不合法：${detail}`,
    '修正 tool 参数后重试。',
    '不要在不改动参数的情况下重复提交同一次调用，也不要猜测缺失字段。',
  )
}
