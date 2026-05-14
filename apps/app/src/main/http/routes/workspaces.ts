import { Hono } from 'hono'
import { PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION } from '@ai-page-builder/shared'
import type {
  PageBuilderBlockDeletionPayload,
  PageBuilderCmsSelectionEntryPoint,
  PageBuilderCmsSelectionResult,
  PageBuilderImageReplacementPayload,
  PageBuilderInlineTextSavePayload,
  PageBuilderStaticExportJobCreateOptions,
  PageBuilderStaticExportJobCreateRequest,
  PageBuilderTargetSelection,
} from '@ai-page-builder/shared'
import {
  DEFAULT_WORKSPACE_SLUG,
  createAgentWorkspace,
  deleteAgentWorkspace,
  getWorkspaceCapabilities,
  getWorkspaceDirectoryContext,
  listAgentWorkspaces,
  searchWorkspaceFiles,
  updateAgentWorkspace,
} from '../../lib/workspace-service'
import {
  createWorkspacePreviewResponse,
  getWorkspacePreviewState,
} from '../../lib/workspace-preview-service'
import {
  assertCmsBuilderApiAvailableInCmsMode,
  createCmsBuilderAccessMiddleware,
} from '../../lib/cms-integration/cms-builder-access-middleware'
import { resolveCmsIntegrationConfig } from '../../lib/cms-integration/cms-integration-config'
import { builderAccessMismatch, builderAccessRequired, cmsProjectNotFound } from '../../lib/cms-integration/cms-integration-errors'
import { getSharedCmsProjectBindingStore, type CmsIntegratedProjectBinding } from '../../lib/cms-integration/cms-project-binding-store'
import {
  PageBuilderBlockDeletionError,
  savePageBuilderBlockDeletion,
} from '../../lib/page-builder-block-deletion-service'
import {
  PageBuilderInlineTextSaveError,
  savePageBuilderInlineText,
} from '../../lib/page-builder-inline-text-service'
import { PageBuilderImageReplacementError, savePageBuilderImageReplacement } from '../../lib/page-builder-image-replacement-service'
import {
  PageBuilderCmsAuthoringTargetSnapshotError,
  readPageBuilderCmsApplyTargetSnapshot,
} from '../../lib/page-builder-cms-authoring-target-snapshot-service'
import {
  PageBuilderCmsAutoAgentHandoffServiceError,
  createPageBuilderCmsAutoAgentHandoff,
} from '../../lib/page-builder-cms-auto-agent-handoff-service'
import {
  PageBuilderStaticExportServiceError,
  pageBuilderStaticExportService,
} from '../../lib/page-builder-static-export-service'
import { listAgentSessions } from '../../lib/agent-session-manager'
import { HttpError } from '../errors'
import { json, noContent, readJsonBody } from '../responses'
import type { HttpAppEnv } from '../types'
import { workspaceMiddleware } from '../middleware/workspace'
import { assertPageBuilderEditLockForWorkspace } from '../page-builder-edit-lock-auth'
import {
  type PageBuilderCmsBrowserScope,
  handlePageBuilderCmsAsset,
  handlePageBuilderCmsCatalogDetail,
  handlePageBuilderCmsCatalogs,
  handlePageBuilderCmsContents,
  handlePageBuilderCmsSites,
} from './page-builder-cms-browser-handlers'

export const workspaceRoutes = new Hono<HttpAppEnv>()

function getWorkspacePreviewRequestPath(url: string, workspaceId: string): string {
  const pathname = new URL(url).pathname
  const prefix = `/api/workspaces/${encodeURIComponent(workspaceId)}/preview`
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '/'

  return suffix || '/'
}

function resolveCmsWorkspaceBrowserScope(c: { var: HttpAppEnv['Variables'] }): PageBuilderCmsBrowserScope {
  if (!resolveCmsIntegrationConfig().enabled) {
    return {}
  }

  const binding = resolveCmsProjectBindingForWorkspace(c)
  return {
    siteId: binding.siteId,
    filterSitesToSiteId: binding.siteId,
  }
}

function resolveCmsProjectBindingForWorkspace(c: { var: HttpAppEnv['Variables'] }): CmsIntegratedProjectBinding {
  const access = c.var.cmsBuilderAccess
  if (!access) {
    throw builderAccessRequired()
  }

  const binding = getSharedCmsProjectBindingStore().findByProjectId(access.projectId)
  if (!binding) {
    throw cmsProjectNotFound()
  }

  if (
    binding.workspaceId !== access.workspaceId
    || binding.workspaceId !== c.var.workspace.id
    || binding.primarySessionId !== access.sessionId
  ) {
    throw builderAccessMismatch('当前 CMS access session 与 project binding 不匹配，请从 CMS 重新进入')
  }

  return binding
}

workspaceRoutes.get('/', (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可读取全量 workspace 列表')
  return c.json(listAgentWorkspaces())
})

workspaceRoutes.post('/', async (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可从浏览器本地创建 workspace')
  const body = await readJsonBody<{ name?: string; template?: string }>(c.req.raw)
  if (!body.name || !body.name.trim()) {
    throw new HttpError(400, '工作区名称不能为空')
  }

  if (body.template && body.template !== 'page-builder') {
    throw new HttpError(400, '不支持的工作区模板')
  }

  const template = body.template === 'page-builder'
    ? 'page-builder'
    : undefined

  return c.json(createAgentWorkspace(
    body.name.trim(),
    template ? { template } : undefined,
  ), 201)
})

workspaceRoutes.use('/:workspaceId', workspaceMiddleware)
workspaceRoutes.use('/:workspaceId/*', workspaceMiddleware)
workspaceRoutes.use('/:workspaceId', async (c, next) => {
  if (c.req.method === 'DELETE') {
    assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可删除 project binding 关联的 workspace')
  }
  await next()
})
workspaceRoutes.use('/:workspaceId', createCmsBuilderAccessMiddleware({
  workspaceId: (c) => c.var.workspace.id,
  requireOrigin: (c) => c.req.method === 'PATCH',
}))
workspaceRoutes.use('/:workspaceId/*', createCmsBuilderAccessMiddleware({
  workspaceId: (c) => c.var.workspace.id,
  requireOrigin: (c) => c.req.method !== 'GET',
}))

workspaceRoutes.patch('/:workspaceId', async (c) => {
  assertPageBuilderEditLockForWorkspace(c.var.workspace, c.req.raw)

  const body = await readJsonBody<{ name?: string }>(c.req.raw)
  if (!body.name || !body.name.trim()) {
    throw new HttpError(400, '工作区名称不能为空')
  }

  return c.json(updateAgentWorkspace(c.var.workspace.id, { name: body.name.trim() }))
})

workspaceRoutes.delete('/:workspaceId', (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可删除 project binding 关联的 workspace')
  if (c.var.workspace.slug === DEFAULT_WORKSPACE_SLUG) {
    throw new HttpError(409, '默认工作区不可删除')
  }

  const workspaceSessions = listAgentSessions().filter((session) => session.workspaceId === c.var.workspace.id)
  if (workspaceSessions.length > 0) {
    throw new HttpError(409, '请先迁移或删除该工作区下的会话后再删除工作区')
  }

  deleteAgentWorkspace(c.var.workspace.id)
  return noContent()
})

workspaceRoutes.get('/:workspaceId/capabilities', (c) => {
  return c.json(getWorkspaceCapabilities(c.var.workspace.slug))
})

workspaceRoutes.get('/:workspaceId/directory-context', (c) => {
  return c.json(getWorkspaceDirectoryContext(c.var.workspace.id))
})

workspaceRoutes.get('/:workspaceId/preview-state', (c) => {
  return json(getWorkspacePreviewState(c.var.workspace))
})

workspaceRoutes.get('/:workspaceId/page-builder/cms/sites', async (c) => {
  const scope = resolveCmsWorkspaceBrowserScope(c)
  return handlePageBuilderCmsSites(c, scope)
})

workspaceRoutes.get('/:workspaceId/page-builder/cms/catalogs', async (c) => {
  const scope = resolveCmsWorkspaceBrowserScope(c)
  return handlePageBuilderCmsCatalogs(c, scope)
})

workspaceRoutes.get('/:workspaceId/page-builder/cms/catalogs/:catalogId', async (c) => {
  const scope = resolveCmsWorkspaceBrowserScope(c)
  return handlePageBuilderCmsCatalogDetail(c, c.req.param('catalogId'), scope)
})

workspaceRoutes.get('/:workspaceId/page-builder/cms/contents', async (c) => {
  const scope = resolveCmsWorkspaceBrowserScope(c)
  return handlePageBuilderCmsContents(c, scope)
})

workspaceRoutes.get('/:workspaceId/page-builder/cms/assets', async (c) => {
  resolveCmsWorkspaceBrowserScope(c)
  return handlePageBuilderCmsAsset(c)
})

workspaceRoutes.post('/:workspaceId/page-builder/cms-target-snapshot', async (c) => {
  const body = await readJsonBody<{ targetSelection?: unknown }>(c.req.raw)
  const targetSelection = readPageBuilderTargetSelection(body.targetSelection)

  try {
    return json(readPageBuilderCmsApplyTargetSnapshot(c.var.workspace, targetSelection))
  } catch (error) {
    if (!(error instanceof PageBuilderCmsAuthoringTargetSnapshotError)) {
      throw error
    }

    if (error.code === 'entry-missing') {
      throw new HttpError(404, error.message)
    }

    if (error.code === 'target-not-found' || error.code === 'selector-not-unique' || error.code === 'target-mismatch') {
      throw new HttpError(409, error.message)
    }

    throw error
  }
})

workspaceRoutes.post('/:workspaceId/page-builder/cms-auto-handoff', async (c) => {
  assertPageBuilderEditLockForWorkspace(c.var.workspace, c.req.raw)

  const body = await readJsonBody<{
    sessionId?: unknown
    selection?: unknown
    uiEntryPoint?: unknown
  }>(c.req.raw)
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!sessionId) {
    throw new HttpError(400, 'sessionId 不能为空')
  }
  const cmsBuilderAccess = c.var.cmsBuilderAccess
  if (cmsBuilderAccess && sessionId !== cmsBuilderAccess.sessionId) {
    throw builderAccessMismatch('当前 CMS handoff 请求的 session 与 CMS access session 不匹配，请从 CMS 重新进入')
  }

  const selection = readPageBuilderCmsSelectionResult(body.selection)
  if (cmsBuilderAccess) {
    const binding = resolveCmsProjectBindingForWorkspace(c)
    if (selection.siteId !== binding.siteId) {
      throw builderAccessMismatch('当前 CMS handoff selection.siteId 与当前项目绑定站点不匹配，请从 CMS 重新进入')
    }
  }
  const uiEntryPoint = readPageBuilderCmsSelectionEntryPoint(body.uiEntryPoint)

  try {
    return json(await createPageBuilderCmsAutoAgentHandoff(c.var.workspace, {
      sessionId,
      selection,
      ...(uiEntryPoint ? { uiEntryPoint } : {}),
    }))
  } catch (error) {
    if (error instanceof PageBuilderCmsAuthoringTargetSnapshotError) {
      if (error.code === 'entry-missing') {
        throw new HttpError(404, error.message)
      }

      if (error.code === 'target-not-found' || error.code === 'selector-not-unique' || error.code === 'target-mismatch') {
        throw new HttpError(409, error.message)
      }
    }

    if (error instanceof PageBuilderCmsAutoAgentHandoffServiceError) {
      if (error.code === 'authoring-revision-missing' || error.code === 'source-refresh-failed') {
        throw new HttpError(409, error.message)
      }

      if (error.code === 'source-refresh-invalid-request') {
        throw new HttpError(400, error.message)
      }

      if (error.code === 'source-refresh-upstream') {
        throw new HttpError(502, error.message)
      }

      if (error.code === 'cms-unavailable') {
        throw new HttpError(503, error.message)
      }
    }

    throw error
  }
})

workspaceRoutes.post('/:workspaceId/page-builder/inline-text', async (c) => {
  assertPageBuilderEditLockForWorkspace(c.var.workspace, c.req.raw)

  const body = await readJsonBody<Partial<PageBuilderInlineTextSavePayload>>(c.req.raw)
  const payload = readInlineTextSavePayload(body)

  try {
    return json(savePageBuilderInlineText(c.var.workspace, payload))
  } catch (error) {
    if (!(error instanceof PageBuilderInlineTextSaveError)) {
      throw error
    }

    if (error.code === 'entry-missing') {
      throw new HttpError(404, error.message)
    }

    if (error.code === 'invalid-descriptor') {
      throw new HttpError(400, error.message)
    }

    throw new HttpError(409, error.message)
  }
})

workspaceRoutes.post('/:workspaceId/page-builder/block-delete', async (c) => {
  assertPageBuilderEditLockForWorkspace(c.var.workspace, c.req.raw)

  const body = await readJsonBody<Partial<PageBuilderBlockDeletionPayload>>(c.req.raw)
  const payload = readPageBuilderBlockDeletionPayload(body)

  try {
    return json(savePageBuilderBlockDeletion(c.var.workspace, payload))
  } catch (error) {
    if (!(error instanceof PageBuilderBlockDeletionError)) {
      throw error
    }

    if (error.code === 'entry-missing') {
      throw new HttpError(404, error.message)
    }

    throw new HttpError(409, error.message)
  }
})

workspaceRoutes.post('/:workspaceId/page-builder/image', async (c) => {
  assertPageBuilderEditLockForWorkspace(c.var.workspace, c.req.raw)

  const { payload, file } = await readPageBuilderImageReplacementRequest(c.req.raw)

  try {
    return json(await savePageBuilderImageReplacement(c.var.workspace, payload, file))
  } catch (error) {
    if (!(error instanceof PageBuilderImageReplacementError)) {
      throw error
    }

    if (error.code === 'entry-missing') {
      throw new HttpError(404, error.message)
    }

    if (error.code === 'invalid-descriptor' || error.code === 'invalid-file') {
      throw new HttpError(400, error.message)
    }

    throw new HttpError(409, error.message)
  }
})

workspaceRoutes.post('/:workspaceId/page-builder/export-static-jobs', async (c) => {
  assertPageBuilderEditLockForWorkspace(c.var.workspace, c.req.raw)

  const payload = await readPageBuilderStaticExportJobCreatePayload(c.req.raw)

  try {
    return json(pageBuilderStaticExportService.createJob(c.var.workspace, payload), 202)
  } catch (error) {
    throw mapStaticExportServiceError(error)
  }
})

workspaceRoutes.get('/:workspaceId/page-builder/export-static-jobs/:jobId', (c) => {
  const job = pageBuilderStaticExportService.getJob(c.var.workspace.id, c.req.param('jobId'))
  if (!job) {
    throw new HttpError(404, '导出任务不存在')
  }

  return json(job)
})

workspaceRoutes.get('/:workspaceId/page-builder/export-static-jobs/:jobId/download', (c) => {
  try {
    const artifact = pageBuilderStaticExportService.resolveDownload(c.var.workspace.id, c.req.param('jobId'))
    return new Response(Bun.file(artifact.filePath), {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': `attachment; filename="${artifact.fallbackFileName}"; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
        'content-type': 'application/zip',
      },
    })
  } catch (error) {
    throw mapStaticExportServiceError(error)
  }
})

const handleWorkspacePreview = (c: { req: { raw: Request }; var: { workspace: HttpAppEnv['Variables']['workspace'] } }) => {
  const url = new URL(c.req.raw.url)
  const requestPath = getWorkspacePreviewRequestPath(c.req.raw.url, c.var.workspace.id)
  const enablePageBuilderBridge = url.searchParams.get('page-builder-bridge') === '1'

  return createWorkspacePreviewResponse(c.var.workspace, requestPath, { enablePageBuilderBridge })
}

workspaceRoutes.get('/:workspaceId/preview', handleWorkspacePreview)
workspaceRoutes.get('/:workspaceId/preview/', handleWorkspacePreview)
workspaceRoutes.get('/:workspaceId/preview/*', handleWorkspacePreview)

workspaceRoutes.get('/:workspaceId/file-search', (c) => {
  const query = c.req.query('q') ?? ''
  const limitParam = c.req.query('limit')
  const limit = limitParam ? Math.max(1, Number.parseInt(limitParam, 10) || 20) : 20
  const extraDirectories = (c.req.queries('dir') ?? []).filter(Boolean)

  return c.json(searchWorkspaceFiles(c.var.workspace.id, query, limit, extraDirectories))
})

function readInlineTextSavePayload(value: Partial<PageBuilderInlineTextSavePayload>): PageBuilderInlineTextSavePayload {
  if (!value.selector || typeof value.selector !== 'string') {
    throw new HttpError(400, 'selector 不能为空')
  }

  if (!value.textTargetDescriptor || typeof value.textTargetDescriptor !== 'object') {
    throw new HttpError(400, 'textTargetDescriptor 不能为空')
  }

  if (typeof value.nextText !== 'string') {
    throw new HttpError(400, 'nextText 必须是字符串')
  }

  return {
    selector: value.selector,
    textTargetDescriptor: value.textTargetDescriptor,
    nextText: value.nextText,
  }
}

function readPageBuilderBlockDeletionPayload(
  value: Partial<PageBuilderBlockDeletionPayload>,
): PageBuilderBlockDeletionPayload {
  if (!value.selector || typeof value.selector !== 'string') {
    throw new HttpError(400, 'selector 不能为空')
  }

  return {
    selector: value.selector,
    targetSelection: value.targetSelection
      ? readPageBuilderTargetSelection(value.targetSelection)
      : undefined,
  }
}

function readPageBuilderTargetSelection(value: unknown): PageBuilderTargetSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'targetSelection 必须是对象')
  }

  const selection = value as Record<string, unknown>

  if (selection.kind === 'block') {
    if (typeof selection.selector !== 'string' || !selection.selector.trim()) {
      throw new HttpError(400, 'targetSelection.selector 不能为空')
    }

    if (typeof selection.parentBlockSelector !== 'string' || !selection.parentBlockSelector.trim()) {
      throw new HttpError(400, 'targetSelection.parentBlockSelector 不能为空')
    }

    if (selection.editBoundary !== 'block') {
      throw new HttpError(400, 'targetSelection.editBoundary 不合法')
    }

    return {
      kind: 'block',
      selector: selection.selector,
      parentBlockSelector: selection.parentBlockSelector,
      editBoundary: 'block',
    }
  }

  if (selection.kind === 'cms-island') {
    if (typeof selection.htmlPath !== 'string' || !selection.htmlPath.trim()) {
      throw new HttpError(400, 'targetSelection.htmlPath 不能为空')
    }

    if (typeof selection.sourceSelector !== 'string' || !selection.sourceSelector.trim()) {
      throw new HttpError(400, 'targetSelection.sourceSelector 不能为空')
    }

    if (typeof selection.parentBlockSelector !== 'string' || !selection.parentBlockSelector.trim()) {
      throw new HttpError(400, 'targetSelection.parentBlockSelector 不能为空')
    }

    if (selection.component !== 'cms-catalog' && selection.component !== 'cms-content') {
      throw new HttpError(400, 'targetSelection.component 不合法')
    }

    if (selection.editBoundary !== 'source-atomic') {
      throw new HttpError(400, 'targetSelection.editBoundary 不合法')
    }

    return {
      kind: 'cms-island',
      htmlPath: selection.htmlPath.trim(),
      sourceSelector: selection.sourceSelector.trim(),
      parentBlockSelector: selection.parentBlockSelector,
      component: selection.component,
      editBoundary: 'source-atomic',
    }
  }

  throw new HttpError(400, 'targetSelection.kind 不合法')
}

function readPageBuilderCmsSelectionEntryPoint(value: unknown): PageBuilderCmsSelectionEntryPoint | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === 'block-toolbar' || value === 'agent-flow') {
    return value
  }

  throw new HttpError(400, 'uiEntryPoint 不合法')
}

function readPageBuilderCmsSelectionResult(value: unknown): PageBuilderCmsSelectionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'selection 必须是对象')
  }

  const selection = value as Record<string, unknown>
  const siteId = typeof selection.siteId === 'string' ? selection.siteId.trim() : ''
  if (!siteId) {
    throw new HttpError(400, 'selection.siteId 不能为空')
  }

  const targetSelection = readPageBuilderTargetSelection(selection.targetSelection)
  const targetBlock = selection.targetBlock
  if (!targetBlock || typeof targetBlock !== 'object' || Array.isArray(targetBlock)) {
    throw new HttpError(400, 'selection.targetBlock 不能为空')
  }

  const targetBlockSelectorValue = (targetBlock as Record<string, unknown>).selector
  const targetBlockSelector = typeof targetBlockSelectorValue === 'string'
    ? targetBlockSelectorValue.trim()
    : ''
  if (!targetBlockSelector) {
    throw new HttpError(400, 'selection.targetBlock.selector 不能为空')
  }

  const snapshot = selection.snapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new HttpError(400, 'selection.snapshot 不能为空')
  }

  const version = selection.version === PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION
    ? PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION
    : 0
  if (version === 0) {
    throw new HttpError(400, 'selection.version 不合法')
  }

  if (selection.selectionKind === 'catalogs') {
    if (selection.sourceType === 'catalogs-by-parent') {
      const parentCatalogId = typeof selection.parentCatalogId === 'string' ? selection.parentCatalogId.trim() : ''
      if (!parentCatalogId) {
        throw new HttpError(400, 'selection.parentCatalogId 不能为空')
      }

      if (selection.selectionMode !== 'children-of-parent') {
        throw new HttpError(400, 'selection.selectionMode 不合法')
      }

      return {
        version,
        siteId,
        targetSelection,
        targetBlock: {
          selector: targetBlockSelector,
        },
        selectionKind: 'catalogs',
        sourceType: 'catalogs-by-parent',
        selectionMode: 'children-of-parent',
        parentCatalogId,
        snapshot: snapshot as Extract<
          PageBuilderCmsSelectionResult,
          { selectionKind: 'catalogs'; sourceType: 'catalogs-by-parent' }
        >['snapshot'],
      }
    }

    if (selection.sourceType === 'catalogs-by-ids') {
      const catalogIds = readRequiredStringArray(selection.catalogIds, 'selection.catalogIds')
      if (selection.selectionMode !== 'fixed-items') {
        throw new HttpError(400, 'selection.selectionMode 不合法')
      }

      return {
        version,
        siteId,
        targetSelection,
        targetBlock: {
          selector: targetBlockSelector,
        },
        selectionKind: 'catalogs',
        sourceType: 'catalogs-by-ids',
        selectionMode: 'fixed-items',
        catalogIds,
        snapshot: snapshot as Extract<
          PageBuilderCmsSelectionResult,
          { selectionKind: 'catalogs'; sourceType: 'catalogs-by-ids' }
        >['snapshot'],
      }
    }
  }

  if (selection.selectionKind === 'contents') {
    if (selection.sourceType === 'contents-by-catalog') {
      const catalogId = typeof selection.catalogId === 'string' ? selection.catalogId.trim() : ''
      if (!catalogId) {
        throw new HttpError(400, 'selection.catalogId 不能为空')
      }

      if (selection.selectionMode !== 'by-catalog') {
        throw new HttpError(400, 'selection.selectionMode 不合法')
      }

      return {
        version,
        siteId,
        targetSelection,
        targetBlock: {
          selector: targetBlockSelector,
        },
        selectionKind: 'contents',
        sourceType: 'contents-by-catalog',
        selectionMode: 'by-catalog',
        catalogId,
        snapshot: snapshot as Extract<
          PageBuilderCmsSelectionResult,
          { selectionKind: 'contents'; sourceType: 'contents-by-catalog' }
        >['snapshot'],
      }
    }

    if (selection.sourceType === 'contents-by-ids') {
      const catalogId = typeof selection.catalogId === 'string' ? selection.catalogId.trim() : ''
      if (!catalogId) {
        throw new HttpError(400, 'selection.catalogId 不能为空')
      }

      const contentIds = readRequiredStringArray(selection.contentIds, 'selection.contentIds')
      if (selection.selectionMode !== 'fixed-items') {
        throw new HttpError(400, 'selection.selectionMode 不合法')
      }

      return {
        version,
        siteId,
        targetSelection,
        targetBlock: {
          selector: targetBlockSelector,
        },
        selectionKind: 'contents',
        sourceType: 'contents-by-ids',
        selectionMode: 'fixed-items',
        catalogId,
        contentIds,
        snapshot: snapshot as Extract<
          PageBuilderCmsSelectionResult,
          { selectionKind: 'contents'; sourceType: 'contents-by-ids' }
        >['snapshot'],
      }
    }
  }

  throw new HttpError(400, 'selection.sourceType 不合法')
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${fieldName} 必须是数组`)
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)

  if (normalized.length === 0) {
    throw new HttpError(400, `${fieldName} 不能为空`)
  }

  return normalized
}

async function readPageBuilderImageReplacementRequest(request: Request): Promise<{
  payload: PageBuilderImageReplacementPayload
  file: File
}> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw new HttpError(400, '请求体必须是合法的 multipart/form-data')
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw new HttpError(400, '请求体必须是合法的 multipart/form-data')
  }

  const rawPayload = formData.get('payload')
  if (typeof rawPayload !== 'string') {
    throw new HttpError(400, 'multipart 请求缺少 payload 字段')
  }

  let parsedPayload: Record<string, unknown>
  try {
    const value = JSON.parse(rawPayload) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid payload')
    }
    parsedPayload = value as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'payload 必须是合法的 JSON 对象')
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw new HttpError(400, 'multipart 请求缺少 file 字段')
  }

  return {
    payload: readPageBuilderImageReplacementPayload(parsedPayload as Partial<PageBuilderImageReplacementPayload>),
    file,
  }
}

function readPageBuilderImageReplacementPayload(
  value: Partial<PageBuilderImageReplacementPayload>,
): PageBuilderImageReplacementPayload {
  if (!value.selector || typeof value.selector !== 'string') {
    throw new HttpError(400, 'selector 不能为空')
  }

  if (!value.imageTargetDescriptor || typeof value.imageTargetDescriptor !== 'object') {
    throw new HttpError(400, 'imageTargetDescriptor 不能为空')
  }

  return {
    selector: value.selector,
    imageTargetDescriptor: value.imageTargetDescriptor,
  }
}

async function readPageBuilderStaticExportJobCreatePayload(
  request: Request,
): Promise<Required<PageBuilderStaticExportJobCreateOptions>> {
  let body: PageBuilderStaticExportJobCreateRequest = {}
  const rawBody = await request.text()

  if (rawBody.trim()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      throw new HttpError(400, '请求体必须是合法的 JSON')
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, '请求体必须是 JSON 对象')
    }

    body = parsed as PageBuilderStaticExportJobCreateRequest
  }

  if (
    body.downloadCmsRemoteAssets !== undefined
    && typeof body.downloadCmsRemoteAssets !== 'boolean'
  ) {
    throw new HttpError(400, 'downloadCmsRemoteAssets 必须是 boolean')
  }

  return {
    downloadCmsRemoteAssets: body.downloadCmsRemoteAssets ?? true,
  }
}

function mapStaticExportServiceError(error: unknown): Error {
  if (error instanceof HttpError) {
    return error
  }

  if (error instanceof PageBuilderStaticExportServiceError) {
    if (error.code === 'entry-missing' || error.code === 'job-missing') {
      return new HttpError(404, error.message)
    }

    return new HttpError(409, error.message)
  }

  return error instanceof Error ? error : new Error(String(error))
}
