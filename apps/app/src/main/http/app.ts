import { Hono } from 'hono'
import { normalizePageBuilderPublicBasePath } from '@ai-page-builder/shared'
import {
  createRequestTraceContext,
  getDiagnosticBackendLogger,
  getHttpAccessLogger,
  serializeDiagnosticError,
  shouldSkipHttpAccessLogging,
} from '../lib/diagnostic-logging'
import { HttpError } from './errors'
import {
  CmsIntegrationError,
  toCmsIntegrationErrorResponse,
} from '../lib/cms-integration/cms-integration-errors'
import type { HttpAppOptions } from './static-handler'
import { serveStatic } from './static-handler'
import { json } from './responses'
import { settingsRoutes } from './routes/settings'
import { sessionRoutes } from './routes/sessions'
import { agentRoutes } from './routes/agent'
import { statusRoutes } from './routes/status'
import { userProfileRoutes } from './routes/user-profile'
import { pageBuilderRoutes } from './routes/page-builder'
import { cmsIntegrationRoutes } from './routes/cms-integration'
import { workspaceRoutes } from './routes/workspaces'
import type { HttpAppEnv } from './types'

const ROOT_API_PREFIX = '/api'

function buildAccessLogBindings(c: { var?: HttpAppEnv['Variables'] }) {
  const diagnostic = c.var?.diagnostic
  return {
    requestId: diagnostic?.requestTrace.requestId ?? null,
    sessionId: diagnostic?.resource.sessionId ?? null,
    workspaceId: diagnostic?.resource.workspaceId ?? null,
    turnId: diagnostic?.resource.turnId ?? null,
    sseConnectionId: diagnostic?.resource.sseConnectionId ?? null,
  }
}

function resolveApiPrefixes(): string[] {
  const basePath = normalizePageBuilderPublicBasePath(process.env.AI_PAGE_BUILDER_BASE_PATH)
  return basePath ? [ROOT_API_PREFIX, `${basePath}${ROOT_API_PREFIX}`] : [ROOT_API_PREFIX]
}

function isApiPath(path: string, apiPrefixes: string[]): boolean {
  return apiPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function toLogicalApiPath(path: string, apiPrefix: string): string {
  if (apiPrefix === ROOT_API_PREFIX) {
    return path
  }

  const basePath = apiPrefix.slice(0, -ROOT_API_PREFIX.length)
  const stripped = path.slice(basePath.length)
  return stripped.startsWith(ROOT_API_PREFIX) ? stripped : path
}

function registerApiDiagnostics(app: Hono<HttpAppEnv>, apiPrefix: string): void {
  app.use(`${apiPrefix}/*`, async (c, next) => {
    const logicalPath = toLogicalApiPath(c.req.path, apiPrefix)
    const requestTrace = createRequestTraceContext({
      method: c.req.method,
      path: logicalPath,
    })
    c.set('diagnostic', {
      requestTrace,
      requestStartedAt: Date.now(),
      resource: {},
    })

    const requestUrl = new URL(c.req.raw.url)
    const skipAccessLog = shouldSkipHttpAccessLogging(logicalPath)
    const accessLogger = skipAccessLog ? null : getHttpAccessLogger(logicalPath)

    accessLogger?.info({
      phase: 'request_start',
      method: c.req.method,
      path: logicalPath,
      query: requestUrl.search || null,
      contentType: c.req.header('content-type') ?? null,
      contentLength: c.req.header('content-length') ?? null,
      ...buildAccessLogBindings(c),
    }, '收到 HTTP API 请求')

    try {
      await next()
    } catch (error) {
      accessLogger?.error({
        phase: 'request_exception',
        method: c.req.method,
        path: logicalPath,
        durationMs: Date.now() - c.var.diagnostic.requestStartedAt,
        error: serializeDiagnosticError(error),
        ...buildAccessLogBindings(c),
      }, 'HTTP API 请求在返回前失败')
      throw error
    }

    c.res.headers.set('x-request-id', requestTrace.requestId)

    accessLogger?.info({
      phase: 'request_complete',
      method: c.req.method,
      path: logicalPath,
      status: c.res.status,
      durationMs: Date.now() - c.var.diagnostic.requestStartedAt,
      ...buildAccessLogBindings(c),
    }, 'HTTP API 请求已完成')
  })
}

function registerApiRoutes(app: Hono<HttpAppEnv>, apiPrefix: string): void {
  app.route(`${apiPrefix}/status`, statusRoutes)
  app.route(`${apiPrefix}/agent`, agentRoutes)
  app.route(`${apiPrefix}/settings`, settingsRoutes)
  app.route(`${apiPrefix}/user-profile`, userProfileRoutes)
  app.route(`${apiPrefix}/page-builder`, pageBuilderRoutes)
  app.route(`${apiPrefix}/integrations/cms`, cmsIntegrationRoutes)
  app.route(`${apiPrefix}/workspaces`, workspaceRoutes)
  app.route(`${apiPrefix}/sessions`, sessionRoutes)
}

export function createHttpApp(options: HttpAppOptions) {
  const app = new Hono<HttpAppEnv>()
  const apiPrefixes = resolveApiPrefixes()

  for (const apiPrefix of apiPrefixes) {
    registerApiDiagnostics(app, apiPrefix)
    registerApiRoutes(app, apiPrefix)
  }

  app.notFound(async (c) => {
    if (isApiPath(c.req.path, apiPrefixes)) {
      return json({ error: '接口不存在' }, 404)
    }

    return serveStatic(c.req.raw, options)
  })

  app.onError((error, c) => {
    if (isApiPath(c.req.path, apiPrefixes)) {
      const logger = getDiagnosticBackendLogger({
        component: 'http',
        category: 'access',
        method: c.req.method,
        path: c.req.path,
        ...buildAccessLogBindings(c),
      })
      logger.error({
        phase: 'route_error',
        error: serializeDiagnosticError(error),
      }, 'HTTP API 路由处理失败')
    }

    if (error instanceof CmsIntegrationError) {
      const response = toCmsIntegrationErrorResponse(error)
      const requestId = c.var?.diagnostic?.requestTrace.requestId
      if (requestId) {
        response.headers.set('x-request-id', requestId)
      }
      return response
    }

    if (error instanceof HttpError) {
      const response = json({ error: error.message }, error.status)
      const requestId = c.var?.diagnostic?.requestTrace.requestId
      if (requestId) {
        response.headers.set('x-request-id', requestId)
      }
      return response
    }

    console.error('[HTTP] 路由处理失败:', error)
    const response = json({ error: '服务器内部错误' }, 500)
    const requestId = c.var?.diagnostic?.requestTrace.requestId
    if (requestId) {
      response.headers.set('x-request-id', requestId)
    }
    return response
  })

  return app
}
