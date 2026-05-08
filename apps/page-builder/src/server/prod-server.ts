import { existsSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizePageBuilderPublicBasePath,
  stripPageBuilderPublicBasePath,
  toPageBuilderBaseHref,
} from '@ai-page-builder/shared'

const DEFAULT_PORT = 3333
const DEFAULT_APP_ORIGIN = 'http://127.0.0.1:8888'

export interface PageBuilderProdServerOptions {
  distDir: string
  appOrigin: string
  publicBasePath?: string | null
  fetchImpl?: (request: Request) => Promise<Response>
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

async function proxyApiRequest(
  request: Request,
  appOrigin: string,
  fetchImpl: (request: Request) => Promise<Response>,
  upstreamPathname?: string,
): Promise<Response> {
  const requestUrl = new URL(request.url)
  const targetUrl = new URL(`${upstreamPathname ?? requestUrl.pathname}${requestUrl.search}`, appOrigin)
  const proxiedRequest = new Request(targetUrl, request)
  return fetchImpl(proxiedRequest)
}

function staticFileResponse(filePath: string): Response {
  return new Response(Bun.file(filePath))
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function runtimeConfigScript(publicBasePath: string): string {
  const json = JSON.stringify({
    basePath: publicBasePath,
  }).replace(/</g, '\\u003c')

  return `<script>window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__=${json};</script>`
}

function stripExistingRuntimeInjection(html: string): string {
  return html
    .replace(/\s*<base\s+href="[^"]*"\s*\/?>\s*/i, '\n')
    .replace(/\s*<script>\s*window\.__AI_PAGE_BUILDER_RUNTIME_CONFIG__=.*?<\/script>\s*/si, '\n')
}

function injectRuntimeConfigIntoIndexHtml(html: string, publicBasePath: string): string {
  const baseTag = `<base href="${escapeHtmlAttribute(toPageBuilderBaseHref(publicBasePath))}">`
  const runtimeScript = runtimeConfigScript(publicBasePath)
  const headInjection = `${baseTag}\n    ${runtimeScript}`
  const cleanedHtml = stripExistingRuntimeInjection(html)

  if (cleanedHtml.includes('<head>')) {
    return cleanedHtml.replace('<head>', `<head>\n    ${headInjection}`)
  }

  return `${headInjection}\n${cleanedHtml}`
}

async function indexHtmlResponse(filePath: string, publicBasePath: string): Promise<Response> {
  const html = await Bun.file(filePath).text()
  return new Response(injectRuntimeConfigIntoIndexHtml(html, publicBasePath), {
    headers: {
      'content-type': 'text/html;charset=utf-8',
    },
  })
}

export function createPageBuilderProdFetchHandler(options: PageBuilderProdServerOptions) {
  const fetchImpl = options.fetchImpl ?? ((request: Request) => fetch(request))
  const normalizedDistDir = resolve(options.distDir)
  const publicBasePath = normalizePageBuilderPublicBasePath(options.publicBasePath)

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const upstreamPathname = stripPageBuilderPublicBasePath(url.pathname, publicBasePath)

    if (isApiRequest(upstreamPathname)) {
      return proxyApiRequest(request, options.appOrigin, fetchImpl, upstreamPathname)
    }

    let requestedPath: string
    try {
      requestedPath = normalizeStaticPath(normalizedDistDir, upstreamPathname)
    } catch (response) {
      if (response instanceof Response) {
        return response
      }
      throw response
    }

    if (existsSync(requestedPath) && statSync(requestedPath).isFile()) {
      if (requestedPath === getFallbackIndexPath(normalizedDistDir)) {
        return indexHtmlResponse(requestedPath, publicBasePath)
      }
      return staticFileResponse(requestedPath)
    }

    if (isStaticAssetRequest(upstreamPathname)) {
      return new Response('Not Found', { status: 404 })
    }

    const fallbackPath = getFallbackIndexPath(normalizedDistDir)
    if (!existsSync(fallbackPath)) {
      return new Response(`page-builder static entry not found: ${fallbackPath}`, { status: 404 })
    }

    return indexHtmlResponse(fallbackPath, publicBasePath)
  }
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

function getAppOrigin(): string {
  return resolvePageBuilderProdAppOrigin()
}

function getPublicBasePath(): string {
  return resolvePageBuilderProdPublicBasePath()
}

export function startPageBuilderProdServer(): void {
  const distDir = getDistDir()
  const appOrigin = getAppOrigin()
  const publicBasePath = getPublicBasePath()
  const port = getPort()

  const handler = createPageBuilderProdFetchHandler({
    distDir,
    appOrigin,
    publicBasePath,
  })

  const server = Bun.serve({
    port,
    idleTimeout: 255,
    fetch(request) {
      return handler(request)
    },
    error(error) {
      console.error('[Page Builder Web] Unhandled server error:', error)
      return new Response('Internal Server Error', { status: 500 })
    },
  })

  console.log(`[Page Builder Web] listening on http://0.0.0.0:${server.port}`)
  console.log(`[Page Builder Web] dist: ${distDir}`)
  console.log(`[Page Builder Web] app origin: ${appOrigin}`)
  console.log(`[Page Builder Web] public base path: ${publicBasePath || '/'}`)
}

if (import.meta.main) {
  startPageBuilderProdServer()
}
