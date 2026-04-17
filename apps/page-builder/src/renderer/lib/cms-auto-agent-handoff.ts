import type {
  PageBuilderCmsApplySkillInput,
  PageBuilderCmsSelectionEntryPoint,
  PageBuilderCmsSelectionResult,
  PageBuilderCmsAutoAgentHandoffRequest,
} from '@proma/shared'
import {
  PAGE_BUILDER_CMS_APPLY_SKILL_CONTRACT_VERSION,
  PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER,
  PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_SKILL,
} from '@proma/shared'

export { PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER } from '@proma/shared'

export const PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MESSAGE = '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。'

const CMS_AUTO_AGENT_HANDOFF_BASE_INSTRUCTIONS = [
  '请严格遵守以下 CMS 作者态约束：',
  '- 只有当前这次“已确认的 CMS 选择结果”对应的受控插入流程可以新写入或重绑 cms-* 标签；普通页面生成或普通迭代不能凭空新增 cms-catalog / cms-content。',
  '- 必须先检查当前目标区块的现有源码结构、类名和主要布局骨架；在兼容时优先复用它们，只替换为 CMS 数据绑定。',
  '- 当前任务是对已选目标做原位替换，不是为当前区域重新发明一个新的通用列表、图文卡片或额外容器。',
  '- 优先让 cms-* 标签作为动态区域源码根节点，并把 ul、nav、section、article 等主要动态容器写进 slot。',
  '- 不要把主要动态容器留在 cms-* 外面、只在 slot 中保留 li、article 等条目级碎片。',
  '- 不要在当前选中区块旁边追加一个新的 cms-catalog / cms-content 并把原区块保留下来；必须原位替换当前目标。',
  '- 新写入或重绑的 cms-* 标签必须显式写出 site-id，并且该值必须等于 selection.siteId。',
  '- 如果 selection.siteId 缺失，必须立即停止并报错；不能假设 site-id=1，也不能从宿主静态配置推断站点。',
  '- 不要把 CMS 浏览弹框里的分页大小当作页面绑定时的默认 page-size。',
]

function requireSelectionSiteId(selection: PageBuilderCmsSelectionResult): string {
  const siteId = typeof selection.siteId === 'string' ? selection.siteId.trim() : ''
  if (!siteId) {
    throw new Error('CMS 选择结果缺少 siteId')
  }

  return siteId
}

export function buildPageBuilderCmsApplySkillInput(
  selection: PageBuilderCmsSelectionResult,
  options?: {
    uiEntryPoint?: PageBuilderCmsSelectionEntryPoint
  },
): PageBuilderCmsApplySkillInput {
  requireSelectionSiteId(selection)
  const notes = options?.uiEntryPoint
    ? [`opened-from:${options.uiEntryPoint}`]
    : undefined
  const uiContext = {
    userIntent: 'Preserve the current selected target structure and styles when compatible. Replace the selected target in place, and do not append a sibling CMS block.',
    ...(notes ? { notes } : {}),
  }

  return {
    version: PAGE_BUILDER_CMS_APPLY_SKILL_CONTRACT_VERSION,
    entryPoint: 'cms-browser-confirm',
    applyIntent: 'replace-current',
    workspacePolicy: {
      scope: 'target-selection-only',
      allowPageRewrite: false,
      allowCrossBlockMutation: false,
      outputTarget: 'workspace-files/index.html',
    },
    targetSelection: selection.targetSelection,
    targetBlock: {
      selector: selection.targetBlock.selector,
    },
    selection,
    uiContext,
  }
}

function resolveCmsAutoAgentHandoffRequestId(explicitRequestId?: string): string {
  if (explicitRequestId) {
    return explicitRequestId
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `cms-handoff-${Date.now()}`
}

function buildCmsAutoAgentHandoffInstructions(selection: PageBuilderCmsSelectionResult): string {
  const siteId = requireSelectionSiteId(selection)
  const lines = [...CMS_AUTO_AGENT_HANDOFF_BASE_INSTRUCTIONS]
  if (selection.targetSelection?.kind === 'cms-island') {
    lines.push('- 当前目标已经是一个 cms-island，必须整体替换现有 cms 源标签，不能在它里面再包一层新的 cms-catalog 或 cms-content。')
  }
  lines.push('- 如果当前目标结构与所选 CMS 数据无法安全兼容，先通过 AskUserQuestion 发起一个简短澄清，而不是擅自改造成新的通用列表或图文卡片。')
  if (selection.sourceType === 'contents-by-catalog') {
    lines.push('- 只有在用户明确要求展示条数，或当前目标已有 page-size 需要原样保留时，才传 source.pageSize；否则省略。')
  }
  if (selection.sourceType === 'contents-by-ids') {
    lines.push('- 当前选择是固定内容 ids，禁止传 source.pageSize，也不要生成 page-size。')
  }
  if (selection.selectionKind === 'catalogs') {
    lines.push('- catalog-nav 不支持 source.pageSize；如需限制栏目数量请使用 source.take。')
  }
  lines.push(`- 当前受控 CMS 选择结果的 selection.siteId = "${siteId}"。`)

  return lines.join('\n')
}

export function createPageBuilderCmsAutoAgentHandoffRequest(
  selection: PageBuilderCmsSelectionResult,
  options?: {
    requestId?: string
    uiEntryPoint?: PageBuilderCmsSelectionEntryPoint
  },
): PageBuilderCmsAutoAgentHandoffRequest {
  const requestId = resolveCmsAutoAgentHandoffRequestId(options?.requestId)
  const skillInput = buildPageBuilderCmsApplySkillInput(selection, {
    uiEntryPoint: options?.uiEntryPoint,
  })

  return {
    requestId,
    userMessage: PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MESSAGE,
    composedUserMessage: [
      `<cms_binding_apply_input>${JSON.stringify(skillInput)}</cms_binding_apply_input>`,
      buildCmsAutoAgentHandoffInstructions(selection),
    ].join('\n\n'),
    mentionedSkills: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_SKILL],
    mentionedMcpServers: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER],
  }
}
