import { Hono } from 'hono'
import type {
  PageBuilderBlockDeletionPayload,
  PageBuilderImageReplacementPayload,
  PageBuilderInlineTextSavePayload,
  PageBuilderTargetSelection,
} from '@proma/shared'
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
  PageBuilderStaticExportServiceError,
  pageBuilderStaticExportService,
} from '../../lib/page-builder-static-export-service'
import { listAgentSessions } from '../../lib/agent-session-manager'
import { HttpError } from '../errors'
import { json, noContent, readJsonBody } from '../responses'
import type { HttpAppEnv } from '../types'
import { workspaceMiddleware } from '../middleware/workspace'

export const workspaceRoutes = new Hono<HttpAppEnv>()

function getWorkspacePreviewRequestPath(url: string, workspaceId: string): string {
  const pathname = new URL(url).pathname
  const prefix = `/api/workspaces/${encodeURIComponent(workspaceId)}/preview`
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '/'

  return suffix || '/'
}

workspaceRoutes.get('/', (c) => {
  return c.json(listAgentWorkspaces())
})

workspaceRoutes.post('/', async (c) => {
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

workspaceRoutes.patch('/:workspaceId', async (c) => {
  const body = await readJsonBody<{ name?: string }>(c.req.raw)
  if (!body.name || !body.name.trim()) {
    throw new HttpError(400, '工作区名称不能为空')
  }

  return c.json(updateAgentWorkspace(c.var.workspace.id, { name: body.name.trim() }))
})

workspaceRoutes.delete('/:workspaceId', (c) => {
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

workspaceRoutes.post('/:workspaceId/page-builder/inline-text', async (c) => {
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

workspaceRoutes.post('/:workspaceId/page-builder/export-static-jobs', (c) => {
  try {
    return json(pageBuilderStaticExportService.createJob(c.var.workspace), 202)
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
