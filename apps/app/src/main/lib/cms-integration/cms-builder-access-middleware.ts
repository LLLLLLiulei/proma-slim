import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import {
  resolveCmsIntegrationConfig,
} from './cms-integration-config'
import {
  resolveCmsHandoffCookieSecure,
} from './cms-integration-config-helpers'
import {
  builderAccessMismatch,
  builderAccessOriginForbidden,
  builderAccessRequired,
} from './cms-integration-errors'
import {
  getSharedBuilderAccessSessionService,
} from './cms-integration-runtime'
import type { HttpAppEnv } from '../../http/types'

type CmsBuilderAccessResolver = (c: Context<HttpAppEnv>) => string | undefined

export interface CmsBuilderAccessMiddlewareOptions {
  workspaceId: string | CmsBuilderAccessResolver
  sessionId?: string | CmsBuilderAccessResolver
  requireOrigin?: boolean | ((c: Context<HttpAppEnv>) => boolean)
}

export const createCmsBuilderAccessMiddleware = (options: CmsBuilderAccessMiddlewareOptions) => {
  return createMiddleware<HttpAppEnv>(async (c, next) => {
    const config = resolveCmsIntegrationConfig()
    if (!config.enabled) {
      await next()
      return
    }

    const workspaceId = resolveOptionValue(c, options.workspaceId)
    if (!workspaceId) {
      throw builderAccessMismatch('当前请求缺少 workspace 上下文，请从 CMS 重新进入')
    }

    const sessionId = resolveOptionValue(c, options.sessionId)
    const accessSessionService = getSharedBuilderAccessSessionService(config.accessSessionTtlMs)
    const validation = accessSessionService.validate(c.req.header('cookie'), {
      workspaceId,
      ...(sessionId ? { sessionId } : {}),
    })

    if (!validation.valid || !validation.access) {
      throw validation.code === 'builder_access_mismatch'
        ? builderAccessMismatch()
        : builderAccessRequired()
    }

    if (shouldRequireOrigin(c, options.requireOrigin)) {
      assertTrustedRequestOrigin(c.req.raw, config.publicOrigin)
    }

    c.set('cmsBuilderAccess', validation.access)
    if (c.var.diagnostic) {
      c.var.diagnostic.resource.workspaceId = validation.access.workspaceId
      c.var.diagnostic.resource.sessionId = validation.access.sessionId
    }

    await next()

    if (c.res.status >= 400) {
      return
    }

    const renewed = accessSessionService.renew(validation.access.accessId, {
      basePath: config.basePath,
      isSecure: resolveCmsHandoffCookieSecure(
        config.publicOrigin ?? 'http://localhost',
        c.req.header('x-forwarded-proto'),
      ),
    })

    if (renewed) {
      c.header('set-cookie', renewed.cookie)
      c.set('cmsBuilderAccess', renewed.access)
    }
  })
}

export function assertCmsBuilderApiAvailableInCmsMode(message?: string): void {
  if (!resolveCmsIntegrationConfig().enabled) {
    return
  }

  throw builderAccessMismatch(message ?? 'CMS 集成模式下该 API 不可用，请从 CMS 当前项目上下文访问')
}

function resolveOptionValue(
  c: Context<HttpAppEnv>,
  value: string | CmsBuilderAccessResolver | undefined,
): string | undefined {
  const raw = typeof value === 'function' ? value(c) : value
  const normalized = raw?.trim()
  return normalized || undefined
}

function shouldRequireOrigin(
  c: Context<HttpAppEnv>,
  value: CmsBuilderAccessMiddlewareOptions['requireOrigin'],
): boolean {
  if (typeof value === 'function') {
    return value(c)
  }
  return value === true
}

function assertTrustedRequestOrigin(request: Request, publicOrigin: string | null): void {
  if (!publicOrigin) {
    throw builderAccessOriginForbidden()
  }

  const requestOrigin = resolveRequestOrigin(request)
  if (!requestOrigin || requestOrigin !== publicOrigin) {
    throw builderAccessOriginForbidden()
  }
}

function resolveRequestOrigin(request: Request): string | null {
  const origin = request.headers.get('origin')?.trim()
  if (origin) {
    return normalizeOrigin(origin)
  }

  const referer = request.headers.get('referer')?.trim()
  if (referer) {
    return normalizeOrigin(referer)
  }

  return null
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return null
  }
}
