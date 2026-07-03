import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  normalizePageBuilderPublicBasePath,
  stripPageBuilderPublicBasePath,
  toPageBuilderBaseHref,
} from '@ai-page-builder/shared'
import { Hono } from 'hono'
import { proxy } from 'hono/proxy'
import { fetch as undiciFetch } from 'undici'
import type { RequestInfo as UndiciRequestInfo, RequestInit as UndiciRequestInit } from 'undici'
import {
  normalizePageBuilderHiddenToolbarItems,
  type PageBuilderToolbarItemKey,
} from '../renderer/lib/toolbar-visibility'

const DEFAULT_PORT = 3333
const DEFAULT_APP_ORIGIN = 'http://127.0.0.1:8888'

export interface PageBuilderProdServerOptions {
  distDir: string
  appOrigin: string
  publicBasePath?: string | null
  hiddenToolbarItems?: readonly PageBuilderToolbarItemKey[] | null
  fetchImpl?: (request: Request, init?: RequestInit) => Promise<Response>
}

function normalizeStaticPath(distDir: string, pathname: string): string {
  const sanitized = pathname === '/' ? '/index.html' : pathname
  const resolvedPath = resolve(distDir, `.${sanitized}`)

  if (!resolvedPath.startsWith(distDir)) {
    throw new Response('Forbidden', { status: 403 })
  }

  return resolvedPath
}

function getFallbackIndexPath(distDir: string): string {
  return resolve(distDir, 'index.html')
}

function isApiRequest(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function isStaticAssetRequest(pathname: string): boolean {
  return extname(pathname) !== ''
}

function isAbortLikeError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === 'AbortError'
}

function canRequestHaveBody(method: string): boolean {
  const normalizedMethod = method.toUpperCase()
  return normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD'
}

// Hono's proxy helper defaults to global fetch; use bundled undici to avoid
// affected Node built-in undici versions crashing on paused upstream responses.
export function nodeSafeProxyFetch(request: Request, init?: RequestInit): Promise<Response> {
  const body = canRequestHaveBody(request.method) ? request.body : null
  const requestInit: UndiciRequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: request.headers as unknown as UndiciRequestInit['headers'],
    body: body as unknown as UndiciRequestInit['body'],
    redirect: init?.redirect ?? request.redirect,
    signal: init?.signal ?? request.signal,
  }

  if (body) {
    requestInit.duplex = 'half'
  }

  return undiciFetch(
    request.url as unknown as UndiciRequestInfo,
    requestInit,
  ) as unknown as Promise<Response>
}

async function proxyApiRequest(
  request: Request,
  appOrigin: string,
  fetchImpl: (request: Request, init?: RequestInit) => Promise<Response>,
  upstreamPathname?: string,
): Promise<Response> {
  const requestUrl = new URL(request.url)
  const targetUrl = new URL(`${upstreamPathname ?? requestUrl.pathname}${requestUrl.search}`, appOrigin)
  const headers = new Headers(request.headers)
  const forwardedHost = request.headers.get('x-forwarded-host')?.trim() || requestUrl.host
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    || requestUrl.protocol.replace(/:$/, '')
  headers.set('x-forwarded-host', forwardedHost)
  headers.set('x-forwarded-proto', forwardedProto)

  return proxy(targetUrl, {
    raw: request,
    headers,
    redirect: 'manual',
    customFetch: (proxiedRequest: Request) => fetchImpl(proxiedRequest, { redirect: 'manual' }),
  })
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function runtimeConfigScript(publicBasePath: string, hiddenToolbarItems: readonly PageBuilderToolbarItemKey[]): string {
  const json = JSON.stringify({
    basePath: publicBasePath,
    hiddenToolbarItems,
  }).replace(/</g, '\\u003c')

  return `<script>window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__=${json};</script>`
}

function stripExistingRuntimeInjection(html: string): string {
  return html
    .replace(/\s*<base\s+href="[^"]*"\s*\/?>\s*/i, '\n')
    .replace(/\s*<script>\s*window\.__AI_PAGE_BUILDER_RUNTIME_CONFIG__=.*?<\/script>\s*/si, '\n')
}

function injectRuntimeConfigIntoIndexHtml(
  html: string,
  publicBasePath: string,
  hiddenToolbarItems: readonly PageBuilderToolbarItemKey[],
): string {
  const baseTag = `<base href="${escapeHtmlAttribute(toPageBuilderBaseHref(publicBasePath))}">`
  const runtimeScript = runtimeConfigScript(publicBasePath, hiddenToolbarItems)
  const headInjection = `${baseTag}\n    ${runtimeScript}`
  const cleanedHtml = stripExistingRuntimeInjection(html)

  if (cleanedHtml.includes('<head>')) {
    return cleanedHtml.replace('<head>', `<head>\n    ${headInjection}`)
  }

  return `${headInjection}\n${cleanedHtml}`
}

async function indexHtmlResponse(
  filePath: string,
  publicBasePath: string,
  hiddenToolbarItems: readonly PageBuilderToolbarItemKey[],
): Promise<Response> {
  const html = await readFile(filePath, 'utf-8')
  return new Response(injectRuntimeConfigIntoIndexHtml(html, publicBasePath, hiddenToolbarItems), {
    headers: {
      'content-type': 'text/html;charset=utf-8',
      'content-security-policy': "frame-ancestors 'self'",
    },
  })
}

export function createPageBuilderProdApp(options: PageBuilderProdServerOptions): Hono {
  const fetchImpl = options.fetchImpl ?? nodeSafeProxyFetch
  const normalizedDistDir = resolve(options.distDir)
  const publicBasePath = normalizePageBuilderPublicBasePath(options.publicBasePath)
  const hiddenToolbarItems = normalizePageBuilderHiddenToolbarItems(options.hiddenToolbarItems)
  const app = new Hono()

  app.use('*', async (c, next) => {
    const request = c.req.raw
    const url = new URL(request.url)
    const upstreamPathname = stripPageBuilderPublicBasePath(url.pathname, publicBasePath)

    if (isApiRequest(upstreamPathname)) {
      try {
        return await proxyApiRequest(request, options.appOrigin, fetchImpl, upstreamPathname)
      } catch (error) {
        if (!isAbortLikeError(error)) {
          console.error('[Page Builder Web] API proxy request failed:', error)
        }
        return new Response(isAbortLikeError(error) ? 'Client Closed Request' : 'Bad Gateway', {
          status: isAbortLikeError(error) ? 499 : 502,
        })
      }
    }

    if (upstreamPathname === '/' || upstreamPathname === '/index.html') {
      const fallbackPath = getFallbackIndexPath(normalizedDistDir)
      if (!existsSync(fallbackPath)) {
        return new Response(`page-builder static entry not found: ${fallbackPath}`, { status: 404 })
      }
      return indexHtmlResponse(fallbackPath, publicBasePath, hiddenToolbarItems)
    }

    if (isStaticAssetRequest(upstreamPathname)) {
      try {
        normalizeStaticPath(normalizedDistDir, upstreamPathname)
      } catch (response) {
        if (response instanceof Response) {
          return response
        }
        throw response
      }

      return next()
    }

    const fallbackPath = getFallbackIndexPath(normalizedDistDir)
    if (!existsSync(fallbackPath)) {
      return new Response(`page-builder static entry not found: ${fallbackPath}`, { status: 404 })
    }

    return indexHtmlResponse(fallbackPath, publicBasePath, hiddenToolbarItems)
  })

  app.use('*', serveStatic({
    root: normalizedDistDir,
    rewriteRequestPath: (path) => stripPageBuilderPublicBasePath(path, publicBasePath),
  }))

  app.notFound(() => new Response('Not Found', { status: 404 }))

  app.onError((error) => {
    console.error('[Page Builder Web] Unhandled server error:', error)
    return new Response('Internal Server Error', { status: 500 })
  })

  return app
}

export function createPageBuilderProdFetchHandler(options: PageBuilderProdServerOptions) {
  const app = createPageBuilderProdApp(options)
  return (request: Request): Promise<Response> => Promise.resolve(app.fetch(request))
}

function getPort(): number {
  const rawPort = process.env.PORT?.trim()
  if (!rawPort) return DEFAULT_PORT

  const parsed = Number(rawPort)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid PORT: ${rawPort}`)
  }

  return parsed
}

function getDistDir(): string {
  const configuredPath = process.env.PAGE_BUILDER_DIST_DIR?.trim()
  return configuredPath
    ? resolve(configuredPath)
    : fileURLToPath(new URL('../../dist', import.meta.url))
}

type EnvSource = Record<string, string | undefined>

export function resolvePageBuilderProdAppOrigin(env: EnvSource = process.env): string {
  const configuredOrigin = env.AI_PAGE_BUILDER_SERVER_ORIGIN?.trim()
    || env.PROMA_APP_ORIGIN?.trim()
  return configuredOrigin || DEFAULT_APP_ORIGIN
}

export function resolvePageBuilderProdPublicBasePath(env: EnvSource = process.env): string {
  return normalizePageBuilderPublicBasePath(env.AI_PAGE_BUILDER_BASE_PATH)
}

export function resolvePageBuilderProdHiddenToolbarItems(
  env: EnvSource = process.env,
): PageBuilderToolbarItemKey[] {
  return normalizePageBuilderHiddenToolbarItems(env.AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS)
}

function getAppOrigin(): string {
  return resolvePageBuilderProdAppOrigin()
}

function getPublicBasePath(): string {
  return resolvePageBuilderProdPublicBasePath()
}

function getHiddenToolbarItems(): PageBuilderToolbarItemKey[] {
  return resolvePageBuilderProdHiddenToolbarItems()
}

export function startPageBuilderProdServer(): void {
  const distDir = getDistDir()
  const appOrigin = getAppOrigin()
  const publicBasePath = getPublicBasePath()
  const hiddenToolbarItems = getHiddenToolbarItems()
  const port = getPort()

  const app = createPageBuilderProdApp({
    distDir,
    appOrigin,
    publicBasePath,
    hiddenToolbarItems,
  })

  serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`[Page Builder Web] listening on http://0.0.0.0:${info.port}`)
  })
  console.log(`[Page Builder Web] dist: ${distDir}`)
  console.log(`[Page Builder Web] app origin: ${appOrigin}`)
  console.log(`[Page Builder Web] public base path: ${publicBasePath || '/'}`)
  console.log(`[Page Builder Web] hidden toolbar items: ${hiddenToolbarItems.join(',') || '(none)'}`)
}

if (import.meta.main) {
  startPageBuilderProdServer()
}
