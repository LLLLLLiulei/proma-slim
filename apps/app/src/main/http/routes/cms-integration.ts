import { Hono } from 'hono'
import { createAgentSession, getAgentSessionMeta } from '../../lib/agent-session-manager'
import { assertIntegrationSecret } from '../../lib/cms-integration/cms-integration-auth'
import {
  assertCmsIntegrationModeEnabled,
  assertCmsIntegrationSecretConfigured,
  buildCmsIntegrationStatus,
  resolveCmsIntegrationConfig,
} from '../../lib/cms-integration/cms-integration-config'
import {
  CmsIntegrationError,
  invalidCmsRequest,
  toCmsIntegrationErrorResponse,
} from '../../lib/cms-integration/cms-integration-errors'
import type { CmsIntegratedProjectBinding } from '../../lib/cms-integration/cms-project-binding-store'
import { getSharedCmsProjectBindingStore } from '../../lib/cms-integration/cms-project-binding-store'
import { validateCmsLogin } from '../../lib/cms-integration/cms-login-validator'
import { deletePageBuilderProject } from '../../lib/page-builder-project-service'
import { createAgentWorkspace, getAgentWorkspace } from '../../lib/workspace-service'
import type { HttpAppEnv } from '../types'

interface CmsProjectCreateBody {
  externalRecordId?: unknown
  projectName?: unknown
  siteId?: unknown
  prompt?: unknown
}

export const cmsIntegrationRoutes = new Hono<HttpAppEnv>()

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

function readRequiredBodyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidCmsRequest(`${fieldName} 不能为空`)
  }

  return value.trim()
}

function isBindingInternalResourceAvailable(binding: CmsIntegratedProjectBinding): boolean {
  const workspace = getAgentWorkspace(binding.workspaceId)
  if (!workspace || workspace.template !== 'page-builder') {
    return false
  }

  const session = getAgentSessionMeta(binding.primarySessionId)
  return Boolean(session && session.workspaceId === workspace.id)
}

function cleanupCreatedProject(workspaceId: string): void {
  try {
    deletePageBuilderProject(workspaceId)
  } catch (error) {
    console.warn('[CMS Integration] 清理未绑定项目失败:', error)
  }
}
