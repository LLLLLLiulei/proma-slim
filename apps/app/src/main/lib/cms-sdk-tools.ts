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
    '`templateBody`、`emptyTemplate`、`errorTemplate` 必须承载完整动态区域。优先直接传 slot 内部内容；如果传了单层最外层 `<template v-slot:...>` 或 `<template #...>` 包装，运行时会自动解包；但仍然不要包含外层 `cms-catalog` / `cms-content` 标签。',
    '工具会自动在生成出来的 cms-catalog / cms-content 源码前加入宿主管理注释；保留这段注释，不要再为该区域额外引入整页 Vue runtime。',
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
    '列出 CMS 栏目树，支持按内容类型或关键字过滤。',
    {
      siteId: z.string().min(1).optional(),
      ids: z.array(z.string().min(1)).optional(),
      contentType: z.string().optional(),
      searchKeyword: z.string().optional(),
    },
    async (args) => {
      return executeCmsTool('list_catalogs', async () => {
        const result = await gateway.listCatalogs(args)
        return toToolResult(result)
      })
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

function assertValidListContentsToolArgs(args: {
  ids?: string[]
  catalogId?: string
}) {
  if (args.ids?.length && !args.catalogId) {
    throw new CmsSdkToolError('input-invalid', '固定内容 ids 查询必须同时提供 catalogId')
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

    const normalizedDecision = decisionInputSchema.safeParse(rawDecision)
    if (!normalizedDecision.success) {
      throw new CmsSdkToolError(
        'input-invalid',
        `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 不符合合约。请修正字段后以对象形态重试，不要直接改写页面。校验摘要：${formatZodIssueSummary(normalizedDecision.error)}。请按工具文档中的 ready 示例修正。`,
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

  const normalizedDecision = decisionInputSchema.safeParse(parsedDecision)
  if (!normalizedDecision.success) {
    throw new CmsSdkToolError(
      'input-invalid',
      `\`mcp__cms__decide_cms_binding\` 的 \`decision\` 必须是结构化对象。当前 JSON 字符串虽然可以解析，但解析结果不符合 decision 合约；请改为传入对象形态的 \`decision\` 后重试。校验摘要：${formatZodIssueSummary(normalizedDecision.error)}。请按工具文档中的 ready 示例修正。`,
    )
  }

  return normalizedDecision.data
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
    case 'handoff-stale':
      return formatGuidedToolError(
        `当前 CMS handoff 已过期：${safeMessage}`,
        '基于当前最新页面状态重新发起 CMS handoff，然后重新调用 `mcp__cms__decide_cms_binding`。',
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
    case 'decision-stale':
    case 'decision-session-mismatch':
      return formatGuidedToolError(
        `当前 decisionId 不可继续用于正式 CMS apply：${safeMessage}`,
        '基于当前有效 handoff 重新执行 `mcp__cms__decide_cms_binding`；如果 handoff 也已过期，先重新发起 handoff。',
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
        `CMS apply 写回失败：${safeMessage}`,
        '停止当前 CMS 调用链并交由宿主侧排查页面写回或 mutation pipeline 状态。',
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
  return `${summary} 下一步：${nextStep} ${forbiddenAction}`
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
  return formatCmsToolContractError(toolName, sanitizeCmsToolErrorMessage(validationDetail))
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
      '修正 `handoffId` 或 `decision` 对象后重新调用 `mcp__cms__decide_cms_binding`。',
      '不要直接调用 `mcp__cms__apply_cms_binding`，也不要直接改写页面。',
    )
  }

  return formatGuidedToolError(
    `CMS tool 输入不合法：${detail}`,
    '修正 tool 参数后重试。',
    '不要在不改动参数的情况下重复提交同一次调用，也不要猜测缺失字段。',
  )
}
