import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import type {
  AgentSendInput,
  AskUserResponse,
  PermissionResponse,
} from '@proma/shared'
import { askUserService } from './lib/agent-ask-user-service'
import { agentEventBus, generateAgentTitle, isAgentSessionActive, runAgent, stopAgent } from './lib/agent-service'
import { permissionService } from './lib/agent-permission-service'
import {
  createAgentSession,
  deleteAgentSession,
  getAgentSessionMessages,
  getAgentSessionMeta,
  listAgentSessions,
  moveSessionToWorkspace,
  updateAgentSessionMeta,
} from './lib/agent-session-manager'
import { getRuntimeStatus } from './lib/runtime-init'
import { getSettings, updateSettings } from './lib/settings-service'
import { getUserProfile, updateUserProfile } from './lib/user-profile-service'
import {
  DEFAULT_WORKSPACE_SLUG,
  createAgentWorkspace,
  deleteAgentWorkspace,
  getAgentWorkspace,
  getWorkspaceCapabilities,
  getWorkspaceDirectoryContext,
  listAgentWorkspaces,
  searchWorkspaceFiles,
  updateAgentWorkspace,
} from './lib/workspace-service'
import { sseManager } from './sse-manager'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const

const DEFAULT_AGENT_SESSION_TITLE = '新 Agent 会话'

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  })
}

function noContent(): Response {
  return new Response(null, { status: 204 })
}

async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T
  } catch {
    throw new HttpError(400, '请求体必须是合法的 JSON')
  }
}

function resolveClaudeSdkCliPath(): string | null {
  try {
    const cjsRequire = createRequire(import.meta.url)
    const sdkEntryPath = cjsRequire.resolve('@anthropic-ai/claude-agent-sdk')
    const cliPath = join(dirname(sdkEntryPath), 'cli.js')
    return existsSync(cliPath) ? cliPath : null
  } catch {
    return null
  }
}

function createStatusPayload() {
  const apiKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  const sdkCliPath = resolveClaudeSdkCliPath()

  return {
    ok: apiKeyConfigured && Boolean(sdkCliPath),
    apiKeyConfigured,
    sdkCliAvailable: Boolean(sdkCliPath),
    sdkCliPath,
    runtimeStatus: getRuntimeStatus(),
  }
}

function normalizeStaticPath(distDir: string, pathname: string): string {
  const sanitized = pathname === '/' ? '/index.html' : pathname
  const resolvedPath = resolve(distDir, `.${sanitized}`)

  if (!resolvedPath.startsWith(distDir)) {
    throw new HttpError(403, '非法路径')
  }

  return resolvedPath
}

function fallbackStaticPath(distDir: string): string {
  return resolve(distDir, 'index.html')
}

function staticFileResponse(filePath: string): Response {
  return new Response(Bun.file(filePath))
}

interface HttpRouterOptions {
  distDir: string
  isDev: boolean
}

export function createAgentStreamCallbacks(sessionId: string) {
  return {
    onError: (message: string) => {
      agentEventBus.emit(sessionId, { type: 'error', message })
      sseManager.closeSession(sessionId)
    },
    onComplete: () => {
      sseManager.closeSession(sessionId)
    },
    onTitleUpdated: (title: string) => {
      sseManager.emitTitleUpdated(sessionId, title)
    },
  }
}

export async function persistGeneratedSessionTitle(sessionId: string, userMessage: string): Promise<void> {
  try {
    const meta = getAgentSessionMeta(sessionId)
    if (!meta || meta.title !== DEFAULT_AGENT_SESSION_TITLE) return

    const title = await generateAgentTitle({
      userMessage,
      channelId: '',
      modelId: '',
    })
    if (!title) return

    updateAgentSessionMeta(sessionId, { title })
  } catch (error) {
    console.warn(`[HTTP] 会话 ${sessionId} 预写入标题失败:`, error)
  }
}

export function createHttpRouter(options: HttpRouterOptions) {
  async function handleApi(request: Request, url: URL): Promise<Response> {
    const pathname = url.pathname
    const { method } = request

    if (pathname === '/api/status' && method === 'GET') {
      return json(createStatusPayload())
    }

    if (pathname === '/api/settings' && method === 'GET') {
      return json(getSettings())
    }

    if (pathname === '/api/settings' && method === 'PATCH') {
      const updates = await readJsonBody<Record<string, unknown>>(request)
      return json(updateSettings(updates))
    }

    if (pathname === '/api/user-profile' && method === 'GET') {
      return json(getUserProfile())
    }

    if (pathname === '/api/user-profile' && method === 'PATCH') {
      const updates = await readJsonBody<Record<string, unknown>>(request)
      return json(updateUserProfile(updates))
    }

    if (pathname === '/api/sessions' && method === 'GET') {
      return json(listAgentSessions())
    }

    if (pathname === '/api/sessions' && method === 'POST') {
      const body = await readJsonBody<{ title?: string; workspaceId?: string }>(request)
      return json(createAgentSession(body.title, undefined, body.workspaceId), 201)
    }

    if (pathname === '/api/workspaces' && method === 'GET') {
      return json(listAgentWorkspaces())
    }

    if (pathname === '/api/workspaces' && method === 'POST') {
      const body = await readJsonBody<{ name?: string }>(request)
      if (!body.name || !body.name.trim()) {
        throw new HttpError(400, '工作区名称不能为空')
      }
      return json(createAgentWorkspace(body.name.trim()), 201)
    }

    const workspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)(?:\/([^/]+))?$/)
    if (workspaceMatch) {
      const workspaceId = decodeURIComponent(workspaceMatch[1]!)
      const action = workspaceMatch[2]
      const workspace = getAgentWorkspace(workspaceId)

      if (!workspace) {
        throw new HttpError(404, `工作区不存在: ${workspaceId}`)
      }

      if (!action && method === 'PATCH') {
        const body = await readJsonBody<{ name?: string }>(request)
        if (!body.name || !body.name.trim()) {
          throw new HttpError(400, '工作区名称不能为空')
        }
        return json(updateAgentWorkspace(workspaceId, { name: body.name.trim() }))
      }

      if (!action && method === 'DELETE') {
        if (workspace.slug === DEFAULT_WORKSPACE_SLUG) {
          throw new HttpError(409, '默认工作区不可删除')
        }

        const workspaceSessions = listAgentSessions().filter((session) => session.workspaceId === workspaceId)
        if (workspaceSessions.length > 0) {
          throw new HttpError(409, '请先迁移或删除该工作区下的会话后再删除工作区')
        }

        deleteAgentWorkspace(workspaceId)
        return noContent()
      }

      if (action === 'capabilities' && method === 'GET') {
        return json(getWorkspaceCapabilities(workspace.slug))
      }

      if (action === 'directory-context' && method === 'GET') {
        return json(getWorkspaceDirectoryContext(workspaceId))
      }

      if (action === 'file-search' && method === 'GET') {
        const query = url.searchParams.get('q') ?? ''
        const limitParam = url.searchParams.get('limit')
        const limit = limitParam ? Math.max(1, Number.parseInt(limitParam, 10) || 20) : 20
        const extraDirectories = url.searchParams.getAll('dir').filter(Boolean)
        return json(searchWorkspaceFiles(workspaceId, query, limit, extraDirectories))
      }

      throw new HttpError(404, '接口不存在')
    }

    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/([^/]+))?$/)
    if (!sessionMatch) {
      throw new HttpError(404, '接口不存在')
    }

    const sessionId = decodeURIComponent(sessionMatch[1]!)
    const action = sessionMatch[2]

    if (!getAgentSessionMeta(sessionId)) {
      throw new HttpError(404, `会话不存在: ${sessionId}`)
    }

    if (!action && method === 'DELETE') {
      if (isAgentSessionActive(sessionId)) {
        stopAgent(sessionId)
      }
      deleteAgentSession(sessionId)
      return noContent()
    }

    if (!action && method === 'PATCH') {
      const body = await readJsonBody<{ title?: string }>(request)
      if (!body.title || !body.title.trim()) {
        throw new HttpError(400, '标题不能为空')
      }
      return json(updateAgentSessionMeta(sessionId, { title: body.title.trim() }))
    }

    if (action === 'messages' && method === 'GET') {
      return json(getAgentSessionMessages(sessionId))
    }

    if (action === 'move-workspace' && method === 'POST') {
      const body = await readJsonBody<{ workspaceId?: string; targetWorkspaceId?: string }>(request)
      const targetWorkspaceId = body.workspaceId ?? body.targetWorkspaceId
      if (!targetWorkspaceId) {
        throw new HttpError(400, '目标工作区不能为空')
      }
      return json(moveSessionToWorkspace(sessionId, targetWorkspaceId))
    }

    if (action === 'stop' && method === 'POST') {
      stopAgent(sessionId)
      sseManager.closeSession(sessionId)
      return noContent()
    }

    if (action === 'permission-respond' && method === 'POST') {
      const body = await readJsonBody<PermissionResponse>(request)
      const resolvedSessionId = permissionService.respondToPermission(
        body.requestId,
        body.behavior,
        body.alwaysAllow,
      )
      if (!resolvedSessionId) {
        throw new HttpError(404, `权限请求不存在: ${body.requestId}`)
      }
      return noContent()
    }

    if (action === 'ask-user-respond' && method === 'POST') {
      const body = await readJsonBody<AskUserResponse>(request)
      const resolvedSessionId = askUserService.respondToAskUser(body.requestId, body.answers)
      if (!resolvedSessionId) {
        throw new HttpError(404, `AskUser 请求不存在: ${body.requestId}`)
      }
      return noContent()
    }

    if (action === 'send' && method === 'POST') {
      if (isAgentSessionActive(sessionId)) {
        return json(
          {
            error: '上一条消息仍在处理中，请稍候再试',
          },
          409,
        )
      }

      const body = await readJsonBody<Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput>>(request)
      if (!body.userMessage || !body.userMessage.trim()) {
        throw new HttpError(400, '消息内容不能为空')
      }

      await persistGeneratedSessionTitle(sessionId, body.userMessage)

      const input: AgentSendInput = {
        sessionId,
        userMessage: body.userMessage,
        channelId: '',
        ...(body.workspaceId && { workspaceId: body.workspaceId }),
        ...(body.additionalDirectories && { additionalDirectories: body.additionalDirectories }),
        ...(body.customMcpServers && { customMcpServers: body.customMcpServers }),
        ...(body.permissionModeOverride && { permissionModeOverride: body.permissionModeOverride }),
        ...(body.mentionedSkills && { mentionedSkills: body.mentionedSkills }),
        ...(body.mentionedMcpServers && { mentionedMcpServers: body.mentionedMcpServers }),
      }

      const response = sseManager.createResponse(sessionId, () => {
        if (isAgentSessionActive(sessionId)) {
          stopAgent(sessionId)
        }
      })

      void runAgent(input, createAgentStreamCallbacks(sessionId)).catch((error) => {
        console.error(`[HTTP] 会话 ${sessionId} 流式执行失败:`, error)

        if (sseManager.hasSession(sessionId)) {
          const message = error instanceof Error ? error.message : String(error)
          agentEventBus.emit(sessionId, { type: 'error', message })
          sseManager.closeSession(sessionId)
        }
      })

      return response
    }

    throw new HttpError(404, '接口不存在')
  }

  async function serveStatic(request: Request, url: URL): Promise<Response> {
    if (options.isDev) {
      return new Response('Not Found', { status: 404 })
    }

    const pathname = url.pathname
    const requestedPath = normalizeStaticPath(options.distDir, pathname)

    if (existsSync(requestedPath) && extname(requestedPath)) {
      return staticFileResponse(requestedPath)
    }

    const fallbackPath = fallbackStaticPath(options.distDir)
    if (!existsSync(fallbackPath)) {
      throw new HttpError(404, `前端静态资源不存在: ${fallbackPath}`)
    }

    return staticFileResponse(fallbackPath)
  }

  return {
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url)

      try {
        if (url.pathname.startsWith('/api/')) {
          return await handleApi(request, url)
        }

        return await serveStatic(request, url)
      } catch (error) {
        if (error instanceof HttpError) {
          return json({ error: error.message }, error.status)
        }

        console.error('[HTTP] 路由处理失败:', error)
        return json({ error: '服务器内部错误' }, 500)
      }
    },
  }
}
