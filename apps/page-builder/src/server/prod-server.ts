import { existsSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORT = 3333
const DEFAULT_APP_ORIGIN = 'http://127.0.0.1:8888'

export interface PageBuilderProdServerOptions {
  distDir: string
  appOrigin: string
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
): Promise<Response> {
  const requestUrl = new URL(request.url)
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, appOrigin)
  const proxiedRequest = new Request(targetUrl, request)
  return fetchImpl(proxiedRequest)
}

function staticFileResponse(filePath: string): Response {
  return new Response(Bun.file(filePath))
}

export function createPageBuilderProdFetchHandler(options: PageBuilderProdServerOptions) {
  const fetchImpl = options.fetchImpl ?? ((request: Request) => fetch(request))
  const normalizedDistDir = resolve(options.distDir)

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    if (isApiRequest(url.pathname)) {
      return proxyApiRequest(request, options.appOrigin, fetchImpl)
    }

    let requestedPath: string
    try {
      requestedPath = normalizeStaticPath(normalizedDistDir, url.pathname)
    } catch (response) {
      if (response instanceof Response) {
        return response
      }
      throw response
    }

    if (existsSync(requestedPath) && statSync(requestedPath).isFile()) {
      return staticFileResponse(requestedPath)
    }

    if (isStaticAssetRequest(url.pathname)) {
      return new Response('Not Found', { status: 404 })
    }

    const fallbackPath = getFallbackIndexPath(normalizedDistDir)
    if (!existsSync(fallbackPath)) {
      return new Response(`page-builder static entry not found: ${fallbackPath}`, { status: 404 })
    }

    return staticFileResponse(fallbackPath)
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

function getAppOrigin(): string {
  const configuredOrigin = process.env.PROMA_APP_ORIGIN?.trim()
  return configuredOrigin || DEFAULT_APP_ORIGIN
}

export function startPageBuilderProdServer(): void {
  const distDir = getDistDir()
  const appOrigin = getAppOrigin()
  const port = getPort()

  const handler = createPageBuilderProdFetchHandler({
    distDir,
    appOrigin,
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
}

if (import.meta.main) {
  startPageBuilderProdServer()
}
