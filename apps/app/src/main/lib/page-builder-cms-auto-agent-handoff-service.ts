import { randomUUID } from 'node:crypto'
import type {
  AgentWorkspace,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsSelectionEntryPoint,
  PageBuilderCmsSelectionResult,
} from '@proma/shared'
import {
  buildPageBuilderCmsApplySkillInput,
  createPageBuilderCmsAutoAgentHandoffRequest,
} from '@proma/shared'
import {
  PageBuilderCmsAuthoringTargetSnapshotError,
  readPageBuilderCmsApplyTargetSnapshot,
} from './page-builder-cms-authoring-target-snapshot-service'
import { pageBuilderCmsBindingDecisionStore } from './page-builder-cms-binding-decision-store'
import { getWorkspacePreviewState } from './workspace-preview-service'

type PageBuilderCmsAutoAgentHandoffServiceErrorCode =
  | 'target-snapshot-unavailable'
  | 'authoring-revision-missing'

export class PageBuilderCmsAutoAgentHandoffServiceError extends Error {
  code: PageBuilderCmsAutoAgentHandoffServiceErrorCode

  constructor(code: PageBuilderCmsAutoAgentHandoffServiceErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PageBuilderCmsAutoAgentHandoffServiceError'
    this.code = code
  }
}

export function createPageBuilderCmsAutoAgentHandoff(
  workspace: AgentWorkspace,
  input: {
    sessionId: string
    selection: PageBuilderCmsSelectionResult
    uiEntryPoint?: PageBuilderCmsSelectionEntryPoint
  },
): PageBuilderCmsAutoAgentHandoffRequest {
  let targetSnapshot
  try {
    targetSnapshot = readPageBuilderCmsApplyTargetSnapshot(workspace, input.selection.targetSelection)
  } catch (error) {
    if (error instanceof PageBuilderCmsAuthoringTargetSnapshotError) {
      throw error
    }

    throw new PageBuilderCmsAutoAgentHandoffServiceError(
      'target-snapshot-unavailable',
      '无法读取当前目标的作者态源码快照',
      { cause: error },
    )
  }

  const previewState = getWorkspacePreviewState(workspace)
  if (!previewState.revision) {
    throw new PageBuilderCmsAutoAgentHandoffServiceError(
      'authoring-revision-missing',
      '无法读取当前页面 revision，暂时不能继续 CMS apply',
    )
  }

  const requestId = randomUUID()
  const skillInput = buildPageBuilderCmsApplySkillInput(input.selection, {
    handoffId: requestId,
    targetSnapshot,
    authoringRevision: previewState.revision,
    uiEntryPoint: input.uiEntryPoint,
  })

  pageBuilderCmsBindingDecisionStore.registerHandoff({
    handoffId: requestId,
    workspaceId: workspace.id,
    sessionId: input.sessionId,
    input: skillInput,
  })

  return createPageBuilderCmsAutoAgentHandoffRequest(input.selection, {
    requestId,
    targetSnapshot,
    authoringRevision: previewState.revision,
    uiEntryPoint: input.uiEntryPoint,
  })
}

