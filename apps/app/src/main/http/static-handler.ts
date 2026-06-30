import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { HttpError } from './errors'
import { createFileResponse } from './file-response'

export interface HttpAppOptions {
  distDir: string
  isDev: boolean
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
  return createFileResponse(filePath)
}

export async function serveStatic(request: Request, options: HttpAppOptions): Promise<Response> {
  if (options.isDev) {
    return new Response('Not Found', { status: 404 })
  }

  const url = new URL(request.url)
  const requestedPath = normalizeStaticPath(options.distDir, url.pathname)

  if (existsSync(requestedPath) && extname(requestedPath)) {
    return staticFileResponse(requestedPath)
  }

  const fallbackPath = fallbackStaticPath(options.distDir)
  if (!existsSync(fallbackPath)) {
    throw new HttpError(404, `前端静态资源不存在: ${fallbackPath}`)
  }

  return staticFileResponse(fallbackPath)
}
