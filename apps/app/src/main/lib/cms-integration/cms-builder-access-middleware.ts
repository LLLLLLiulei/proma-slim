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
import { resolvePageBuilderInternalAppOrigin } from '../page-builder-runtime-playwright'

type CmsBuilderAccessResolver = (c: Context<HttpAppEnv>) => string | undefined

const INTERNAL_READONLY_PREVIEW_PATH_PATTERNS = [
  /^\/api\/workspaces\/[^/]+\/preview(?:\/|$)/,
  /^\/api\/workspaces\/[^/]+\/page-builder\/cms\/(?:sites|contents|assets)$/,
  /^\/api\/workspaces\/[^/]+\/page-builder\/cms\/catalogs(?:\/[^/]+)?$/,
] as const

export interface CmsBuilderAccessMiddlewareOptions {
  workspaceId: string | CmsBuilderAccessResolver
  sessionId?: string | CmsBuilderAccessResolver
  requireOrigin?: boolean | ((c: Context<HttpAppEnv>) => boolean)
  allowDevStandaloneBypass?: boolean
}

export interface CmsBuilderApiAvailabilityOptions {
  allowDevStandaloneEntry?: boolean
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

    if (isInternalReadonlyPreviewRequest(c)) {
      c.set('cmsBuilderInternalReadonlyAccess', true)
      if (c.var.diagnostic) {
        c.var.diagnostic.resource.workspaceId = workspaceId
      }
      await next()
      return
    }

    if (config.devStandaloneEntryEnabled && options.allowDevStandaloneBypass !== false) {
      c.set('cmsBuilderDevStandaloneAccess', true)
      if (c.var.diagnostic) {
        c.var.diagnostic.resource.workspaceId = workspaceId
        const sessionId = resolveOptionValue(c, options.sessionId)
        if (sessionId) {
          c.var.diagnostic.resource.sessionId = sessionId
        }
      }
      await next()
      return
    }

    const sessionId = resolveOptionValue(c, options.sessionId)
    const accessSessionService = getSharedBuilderAccessSessionService({
      ttlMs: config.accessSessionTtlMs,
      renewThresholdMs: config.accessSessionRenewThresholdMs,
    })
    const validation = await accessSessionService.validate(c.req.header('cookie'), {
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

    const renewed = await accessSessionService.renew(validation.access.accessId, {
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

function isInternalReadonlyPreviewRequest(c: Context<HttpAppEnv>): boolean {
  if (c.req.method !== 'GET') {
    return false
  }

  const internalOrigin = resolvePageBuilderInternalAppOrigin()
  if (!internalOrigin) {
    return false
  }

  // 只有直连 server 的内部请求才允许走只读例外。
  // 经过 web/nginx 代理的 public 请求会携带 x-forwarded-host，不应被识别为内部访问。
  if (c.req.header('x-forwarded-host')?.trim()) {
    return false
  }

  let requestUrl: URL
  try {
    requestUrl = new URL(c.req.url)
  } catch {
    return false
  }

  if (requestUrl.origin !== internalOrigin) {
    return false
  }

  return INTERNAL_READONLY_PREVIEW_PATH_PATTERNS.some((pattern) => pattern.test(requestUrl.pathname))
}

export function assertCmsBuilderApiAvailableInCmsMode(
  message?: string,
  options: CmsBuilderApiAvailabilityOptions = {},
): void {
  const config = resolveCmsIntegrationConfig()
  if (!config.enabled) {
    return
  }

  if (options.allowDevStandaloneEntry && config.devStandaloneEntryEnabled) {
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
