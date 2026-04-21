import {
  PAGE_BUILDER_CMS_APPLY_SKILL_CONTRACT_VERSION,
  type PageBuilderCmsApplySkillInput,
  type PageBuilderCmsApplyTargetSnapshot,
} from './page-builder-cms-apply'
import type {
  PageBuilderCmsSelectionEntryPoint,
  PageBuilderCmsSelectionResult,
} from './page-builder-cms'
import {
  buildPageBuilderCmsAuthoringDigest,
  resolvePageBuilderCmsAuthoringComponent,
} from './page-builder-cms-authoring-contract'

export const PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_SKILL = 'cms-binding-apply'
export const PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER = 'cms'
export const PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MESSAGE = '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。'

export interface PageBuilderCmsAutoAgentHandoffRequest {
  requestId: string
  userMessage: string
  composedUserMessage: string
  mentionedSkills: string[]
  bootstrappedSkills?: string[]
  mentionedMcpServers?: string[]
}

export interface PageBuilderCmsAutoAgentHandoffSettledResult {
  requestId: string
  status: 'sent' | 'failed'
  errorMessage?: string
}

function requireSelectionSiteId(selection: PageBuilderCmsSelectionResult): string {
  const siteId = typeof selection.siteId === 'string' ? selection.siteId.trim() : ''
  if (!siteId) {
    throw new Error('CMS 选择结果缺少 siteId')
  }

  return siteId
}

export function buildPageBuilderCmsApplySkillInput(
  selection: PageBuilderCmsSelectionResult,
  options: {
    handoffId: string
    targetSnapshot: PageBuilderCmsApplyTargetSnapshot
    authoringRevision: string
    uiEntryPoint?: PageBuilderCmsSelectionEntryPoint
  },
): PageBuilderCmsApplySkillInput {
  requireSelectionSiteId(selection)
  const authoringRevision = typeof options.authoringRevision === 'string'
    ? options.authoringRevision.trim()
    : ''
  if (!authoringRevision) {
    throw new Error('CMS auto handoff 缺少 authoringRevision')
  }

  const component = resolvePageBuilderCmsAuthoringComponent(selection)
  const notes = options?.uiEntryPoint
    ? [`opened-from:${options.uiEntryPoint}`]
    : undefined
  const uiContext = {
    userIntent: 'Preserve the current selected target structure and styles when compatible. Replace the selected target in place, and do not append a sibling CMS block.',
    ...(notes ? { notes } : {}),
  }

  return {
    version: PAGE_BUILDER_CMS_APPLY_SKILL_CONTRACT_VERSION,
    handoffId: options.handoffId,
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
    authoringContext: buildPageBuilderCmsAuthoringDigest(component, selection.sourceType),
    targetSnapshot: options.targetSnapshot,
    authoringRevision,
    uiContext,
  }
}

export function createPageBuilderCmsAutoAgentHandoffRequest(
  selection: PageBuilderCmsSelectionResult,
  options: {
    requestId: string
    targetSnapshot: PageBuilderCmsApplyTargetSnapshot
    authoringRevision: string
    uiEntryPoint?: PageBuilderCmsSelectionEntryPoint
  },
): PageBuilderCmsAutoAgentHandoffRequest {
  const skillInput = buildPageBuilderCmsApplySkillInput(selection, {
    handoffId: options.requestId,
    targetSnapshot: options.targetSnapshot,
    authoringRevision: options.authoringRevision,
    uiEntryPoint: options?.uiEntryPoint,
  })

  return {
    requestId: options.requestId,
    userMessage: PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MESSAGE,
    composedUserMessage: `<cms_binding_apply_input>${JSON.stringify(skillInput)}</cms_binding_apply_input>`,
    mentionedSkills: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_SKILL],
    bootstrappedSkills: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_SKILL],
    mentionedMcpServers: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER],
  }
}
