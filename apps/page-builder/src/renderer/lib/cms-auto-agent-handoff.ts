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
  '- 优先让 cms-* 标签作为动态区域源码根节点，并把 ul、nav、section、article 等主要动态容器写进 slot。',
  '- 不要把主要动态容器留在 cms-* 外面、只在 slot 中保留 li、article 等条目级碎片。',
]

export function buildPageBuilderCmsApplySkillInput(
  selection: PageBuilderCmsSelectionResult,
  options?: {
    uiEntryPoint?: PageBuilderCmsSelectionEntryPoint
  },
): PageBuilderCmsApplySkillInput {
  const notes = options?.uiEntryPoint
    ? [`opened-from:${options.uiEntryPoint}`]
    : undefined

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
    ...(notes ? {
      uiContext: {
        notes,
      },
    } : {}),
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
  const lines = [...CMS_AUTO_AGENT_HANDOFF_BASE_INSTRUCTIONS]
  if (selection.targetSelection?.kind === 'cms-island') {
    lines.push('- 当前目标已经是一个 cms-island，必须整体替换现有 cms 源标签，不能在它里面再包一层新的 cms-catalog 或 cms-content。')
  }

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
