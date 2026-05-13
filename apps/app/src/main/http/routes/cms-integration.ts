import { Hono } from 'hono'
import type { AgentSessionMeta, AgentWorkspace } from '@ai-page-builder/shared'
import { createAgentSession, getAgentSessionMeta } from '../../lib/agent-session-manager'
import { assertIntegrationSecret } from '../../lib/cms-integration/cms-integration-auth'
import {
  assertCmsIntegrationModeEnabled,
  assertCmsIntegrationSecretConfigured,
  buildCmsIntegrationStatus,
  resolveCmsIntegrationConfig,
} from '../../lib/cms-integration/cms-integration-config'
import {
  buildCmsHandoffOpenUrl,
  normalizeCmsHandoffPublicOrigin,
  resolveCmsHandoffCookieSecure,
} from '../../lib/cms-integration/cms-integration-config-helpers'
import {
  builderAccessMismatch,
  builderAccessRequired,
  CmsIntegrationError,
  cmsProjectNotFound,
  handoffExpired,
  invalidCmsRequest,
  previewNotReady,
  toCmsIntegrationErrorResponse,
} from '../../lib/cms-integration/cms-integration-errors'
import {
  getSharedBuilderAccessSessionService,
  getSharedCmsHandoffService,
  resetCmsIntegrationRuntimeState,
} from '../../lib/cms-integration/cms-integration-runtime'
import type { CmsIntegratedProjectBinding } from '../../lib/cms-integration/cms-project-binding-store'
import { getSharedCmsProjectBindingStore } from '../../lib/cms-integration/cms-project-binding-store'
import { validateCmsLogin } from '../../lib/cms-integration/cms-login-validator'
import { deletePageBuilderProject } from '../../lib/page-builder-project-service'
import { createAgentWorkspace, getAgentWorkspace } from '../../lib/workspace-service'
import { getWorkspacePreviewState } from '../../lib/workspace-preview-service'
import type { HttpAppEnv } from '../types'

interface CmsProjectCreateBody {
  externalRecordId?: unknown
  projectName?: unknown
  siteId?: unknown
  prompt?: unknown
}

interface CmsHandoffCreateBody {
  target?: unknown
  openMode?: unknown
}

export const cmsIntegrationRoutes = new Hono<HttpAppEnv>()

export function resetCmsIntegrationTestState(): void {
  resetCmsIntegrationRuntimeState()
}

cmsIntegrationRoutes.onError((error) => {
  if (error instanceof CmsIntegrationError) {
    return toCmsIntegrationErrorResponse(error)
  }

  throw error
})

cmsIntegrationRoutes.get('/status', (c) => {
  return c.json(buildCmsIntegrationStatus(resolveCmsIntegrationConfig()))
})

cmsIntegrationRoutes.post('/projects', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const body = await readProjectCreateBody(c.req.raw)
  const cmsUser = await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  const store = getSharedCmsProjectBindingStore()
  let createdWorkspaceId: string | null = null

  try {
    const result = await store.createOrGetByExternalRecord({
      externalRecordId: body.externalRecordId,
      projectName: body.projectName,
      siteId: body.siteId,
      cmsUser,
    }, () => {
      const workspace = createAgentWorkspace(body.projectName, { template: 'page-builder' })
      createdWorkspaceId = workspace.id
      const session = createAgentSession(undefined, undefined, workspace.id)
      return {
        workspaceId: workspace.id,
        primarySessionId: session.id,
      }
    }, isBindingInternalResourceAvailable)

    return c.json({
      projectId: result.binding.projectId,
      created: result.created,
    }, result.created ? 201 : 200)
  } catch (error) {
    if (createdWorkspaceId) {
      cleanupCreatedProject(createdWorkspaceId)
    }
    throw error
  }
})

cmsIntegrationRoutes.post('/projects/:projectId/handoffs', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const publicOrigin = normalizeCmsHandoffPublicOrigin(config.publicOrigin)
  if (!publicOrigin) {
    throw invalidCmsRequest('AI_PAGE_BUILDER_PUBLIC_ORIGIN 不能为空且必须是合法 origin')
  }

  const projectId = c.req.param('projectId').trim()
  if (!projectId) {
    throw invalidCmsRequest('projectId 不能为空')
  }

  const body = await readOptionalJsonBody<CmsHandoffCreateBody>(c.req.raw)
  const target = normalizeHandoffTarget(body.target)
  const openMode = normalizeHandoffOpenMode(body.openMode)
  const cmsUser = await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  const binding = getSharedCmsProjectBindingStore().findByProjectId(projectId)
  if (!binding || !isBindingInternalResourceAvailable(binding)) {
    throw cmsProjectNotFound()
  }

  if (target === 'preview' && !getWorkspacePreviewState(getAgentWorkspace(binding.workspaceId)!).hasPreview) {
    throw previewNotReady()
  }

  const handoffService = getSharedCmsHandoffService(config.handoffTtlMs)

  const created = handoffService.create({
    projectId: binding.projectId,
    workspaceId: binding.workspaceId,
    sessionId: binding.primarySessionId,
    target,
    openMode,
    userSummary: cmsUser,
  })

  return c.json({
    handoffId: created.handoffId,
    openUrl: buildCmsHandoffOpenUrl({
      publicOrigin,
      basePath: config.basePath,
      handoffId: created.handoffId,
    }),
    expiresAt: created.expiresAt,
    target,
    openMode,
  })
})

cmsIntegrationRoutes.get('/handoffs/:handoffId/open', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)

  const handoffId = c.req.param('handoffId').trim()
  if (!handoffId) {
    throw handoffExpired()
  }

  const handoffService = getSharedCmsHandoffService(config.handoffTtlMs)
  const handoff = handoffService.peek(handoffId)
  if (!handoff) {
    throw new CmsIntegrationError('handoff_expired', 404)
  }

  const consumed = handoffService.consume(handoffId)
  const binding = getSharedCmsProjectBindingStore().findByProjectId(consumed.projectId)
  if (!binding || !doesBindingMatchSession(binding, consumed) || !isBindingInternalResourceAvailable(binding)) {
    throw cmsProjectNotFound()
  }

  const accessSessionService = getSharedBuilderAccessSessionService(config.accessSessionTtlMs)
  const access = accessSessionService.create({
    projectId: consumed.projectId,
    workspaceId: consumed.workspaceId,
    sessionId: consumed.sessionId,
    basePath: config.basePath,
    isSecure: resolveCmsHandoffCookieSecure(
      config.publicOrigin ?? 'http://localhost',
      c.req.header('x-forwarded-proto'),
    ),
    userSummary: consumed.userSummary,
  })

  const location = consumed.target === 'preview'
    ? withBasePath(config.basePath, `/api/workspaces/${encodeURIComponent(consumed.workspaceId)}/preview/`)
    : withBasePath(config.basePath, `/builder/${encodeURIComponent(consumed.workspaceId)}/${encodeURIComponent(consumed.sessionId)}`)

  return new Response(null, {
    status: 302,
    headers: {
      location,
      'set-cookie': access.cookie,
    },
  })
})

cmsIntegrationRoutes.get('/builder-context', (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)

  const workspaceId = c.req.query('workspaceId')?.trim() ?? ''
  const sessionId = c.req.query('sessionId')?.trim() ?? ''
  if (!workspaceId || !sessionId) {
    throw invalidCmsRequest('workspaceId 和 sessionId 不能为空')
  }

  const accessSessionService = getSharedBuilderAccessSessionService(config.accessSessionTtlMs)
  const validation = accessSessionService.validate(c.req.header('cookie'), { workspaceId, sessionId })
  if (!validation.valid) {
    throw validation.code === 'builder_access_mismatch' ? builderAccessMismatch() : builderAccessRequired()
  }

  const access = validation.access
  const binding = getSharedCmsProjectBindingStore().findByProjectId(access?.projectId ?? '')
  const internals = binding ? resolveBindingInternals(binding) : null
  if (!access || !binding || !doesBindingMatchSession(binding, access) || !internals) {
    throw cmsProjectNotFound()
  }

  return c.json({
    projectId: binding.projectId,
    workspace: toPublicWorkspaceContext(internals.workspace),
    session: toPublicSessionContext(internals.session),
    access: {
      expiresAt: access.expiresAt,
    },
  })
})

async function readProjectCreateBody(request: Request): Promise<{
  externalRecordId: string
  projectName: string
  siteId: string
}> {
  let parsed: CmsProjectCreateBody
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('invalid body')
    }
    parsed = body as CmsProjectCreateBody
  } catch {
    throw invalidCmsRequest('请求体必须是合法的 JSON 对象')
  }

  if ('prompt' in parsed) {
    throw invalidCmsRequest('创建 CMS 项目时不支持 prompt 字段')
  }

  return {
    externalRecordId: readRequiredBodyString(parsed.externalRecordId, 'externalRecordId'),
    projectName: readRequiredBodyString(parsed.projectName, 'projectName'),
    siteId: readRequiredBodyString(parsed.siteId, 'siteId'),
  }
}

async function readOptionalJsonBody<T extends object>(request: Request): Promise<T> {
  if (request.body === null || request.headers.get('content-length') === '0') {
    return {} as T
  }

  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('invalid body')
    }
    return body as T
  } catch {
    throw invalidCmsRequest('请求体必须是合法的 JSON 对象')
  }
}

function readRequiredBodyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidCmsRequest(`${fieldName} 不能为空`)
  }

  return value.trim()
}

function normalizeHandoffTarget(value: unknown): 'builder' | 'preview' {
  if (value === undefined || value === null) {
    return 'builder'
  }
  if (value === 'builder' || value === 'preview') {
    return value
  }
  throw invalidCmsRequest('target 只能是 builder 或 preview')
}

function normalizeHandoffOpenMode(value: unknown): 'iframe' | 'window' {
  if (value === undefined || value === null) {
    return 'window'
  }
  if (value === 'iframe' || value === 'window') {
    return value
  }
  throw invalidCmsRequest('openMode 只能是 iframe 或 window')
}

function withBasePath(basePath: string, pathname: string): string {
  const normalizedBasePath = basePath.trim()
  if (!normalizedBasePath || normalizedBasePath === '/') {
    return pathname
  }

  return `${normalizedBasePath}${pathname.startsWith('/') ? '' : '/'}${pathname}`
}

function isBindingInternalResourceAvailable(binding: CmsIntegratedProjectBinding): boolean {
  return Boolean(resolveBindingInternals(binding))
}

function resolveBindingInternals(binding: CmsIntegratedProjectBinding) {
  const workspace = getAgentWorkspace(binding.workspaceId)
  if (!workspace || workspace.template !== 'page-builder') {
    return null
  }

  const session = getAgentSessionMeta(binding.primarySessionId)
  if (!session || session.workspaceId !== workspace.id) {
    return null
  }

  return { workspace, session }
}

function doesBindingMatchSession(
  binding: CmsIntegratedProjectBinding,
  session: { workspaceId: string; sessionId: string },
): boolean {
  return binding.workspaceId === session.workspaceId && binding.primarySessionId === session.sessionId
}

function toPublicWorkspaceContext(workspace: AgentWorkspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    ...(workspace.template ? { template: workspace.template } : {}),
  }
}

function toPublicSessionContext(session: AgentSessionMeta) {
  return {
    id: session.id,
    title: session.title,
    ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
  }
}

function cleanupCreatedProject(workspaceId: string): void {
  try {
    deletePageBuilderProject(workspaceId)
  } catch (error) {
    console.warn('[CMS Integration] 清理未绑定项目失败:', error)
  }
}
