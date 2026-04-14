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
    composedUserMessage: `<cms_binding_apply_input>${JSON.stringify(skillInput)}</cms_binding_apply_input>`,
    mentionedSkills: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_SKILL],
    mentionedMcpServers: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER],
  }
}
