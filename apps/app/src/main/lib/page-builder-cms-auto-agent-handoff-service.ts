import { randomUUID } from 'node:crypto'
import type {
  AgentWorkspace,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsApplyAuthoritativeSource,
  PageBuilderCmsCatalog,
  PageBuilderCmsContentSummary,
  PageBuilderCmsSelectionEntryPoint,
  PageBuilderCmsSelectionResult,
} from '@proma/shared'
import {
  buildPageBuilderCmsApplySkillInput,
  createPageBuilderCmsAutoAgentHandoffRequest,
} from '@proma/shared'
import {
  CmsGateway,
  CmsGatewayError,
  type CmsCatalogQuery,
  type CmsContentQuery,
} from './cms-gateway'
import {
  PageBuilderCmsAuthoringTargetSnapshotError,
  readPageBuilderCmsApplyTargetSnapshot,
} from './page-builder-cms-authoring-target-snapshot-service'
import { pageBuilderCmsBindingDecisionStore } from './page-builder-cms-binding-decision-store'
import { resolvePageBuilderCmsConfig } from './page-builder-cms-config'
import { getWorkspacePreviewState } from './workspace-preview-service'

type PageBuilderCmsAutoAgentHandoffServiceErrorCode =
  | 'target-snapshot-unavailable'
  | 'authoring-revision-missing'
  | 'cms-unavailable'
  | 'source-refresh-failed'
  | 'source-refresh-invalid-request'
  | 'source-refresh-upstream'

interface CmsGatewayLike {
  listCatalogs(query: CmsCatalogQuery): Promise<{ items: PageBuilderCmsCatalog[]; tree: PageBuilderCmsCatalog[] }>
  listContents(query: CmsContentQuery): Promise<{
    total: number
    items: PageBuilderCmsContentSummary[]
  }>
}

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
  deps: {
    cmsGateway?: CmsGatewayLike
  } = {},
): Promise<PageBuilderCmsAutoAgentHandoffRequest> {
  return createPageBuilderCmsAutoAgentHandoffInternal(workspace, input, deps)
}

async function createPageBuilderCmsAutoAgentHandoffInternal(
  workspace: AgentWorkspace,
  input: {
    sessionId: string
    selection: PageBuilderCmsSelectionResult
    uiEntryPoint?: PageBuilderCmsSelectionEntryPoint
  },
  deps: {
    cmsGateway?: CmsGatewayLike
  },
): Promise<PageBuilderCmsAutoAgentHandoffRequest> {
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
  const authoritativeSource = await resolveAuthoritativeSourceContext(input.selection, deps.cmsGateway)
  const skillInput = buildPageBuilderCmsApplySkillInput(input.selection, {
    handoffId: requestId,
    targetSnapshot,
    authoringRevision: previewState.revision,
    authoritativeSource,
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
    authoritativeSource,
    uiEntryPoint: input.uiEntryPoint,
  })
}

async function resolveAuthoritativeSourceContext(
  selection: PageBuilderCmsSelectionResult,
  injectedGateway?: CmsGatewayLike,
): Promise<PageBuilderCmsApplyAuthoritativeSource | undefined> {
  if (selection.selectionKind !== 'contents' || selection.sourceType !== 'contents-by-catalog') {
    return undefined
  }

  const gateway = injectedGateway ?? createCmsGateway()

  let catalogsResult
  try {
    catalogsResult = await gateway.listCatalogs({
      siteId: selection.siteId,
      ids: [selection.catalogId],
    })
  } catch (error) {
    throw mapGatewayFailure(error)
  }

  const catalog = catalogsResult.items.find((item) => item.id === selection.catalogId)
  if (!catalog) {
    throw new PageBuilderCmsAutoAgentHandoffServiceError(
      'source-refresh-failed',
      '当前所选栏目已无法从 CMS 权威数据中确认，请重新确认 CMS 选择后再应用',
    )
  }

  let contentsResult
  try {
    contentsResult = await gateway.listContents({
      siteId: selection.siteId,
      catalogId: selection.catalogId,
      pageIndex: 0,
      pageSize: 1,
    })
  } catch (error) {
    throw mapGatewayFailure(error)
  }

  return {
    catalog: {
      name: catalog.name,
      path: catalog.path,
      total: catalog.total,
    },
    contentsProbe: {
      total: contentsResult.total,
      items: contentsResult.items.map((item) => ({ id: item.id })),
    },
  }
}

function createCmsGateway(): CmsGatewayLike {
  const config = resolvePageBuilderCmsConfig()
  if (!config) {
    throw new PageBuilderCmsAutoAgentHandoffServiceError(
      'cms-unavailable',
      'CMS 浏览暂不可用，请先完成宿主 CMS 配置',
    )
  }

  return new CmsGateway({ config })
}

function mapGatewayFailure(error: unknown): PageBuilderCmsAutoAgentHandoffServiceError {
  if (error instanceof PageBuilderCmsAutoAgentHandoffServiceError) {
    return error
  }

  if (error instanceof CmsGatewayError && error.code === 'config') {
    return new PageBuilderCmsAutoAgentHandoffServiceError('cms-unavailable', error.message, { cause: error })
  }

  if (error instanceof CmsGatewayError && error.code === 'invalid_request') {
    return new PageBuilderCmsAutoAgentHandoffServiceError(
      'source-refresh-invalid-request',
      error.message,
      { cause: error },
    )
  }

  if (error instanceof CmsGatewayError) {
    return new PageBuilderCmsAutoAgentHandoffServiceError(
      'source-refresh-upstream',
      error.message,
      { cause: error },
    )
  }

  return new PageBuilderCmsAutoAgentHandoffServiceError(
    'source-refresh-upstream',
    '暂时无法刷新已选 CMS 来源，请稍后重试',
    { cause: error },
  )
}
