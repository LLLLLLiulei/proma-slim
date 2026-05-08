import {
  prependPageBuilderPublicBasePath,
  stripPageBuilderPublicBasePath,
} from '@ai-page-builder/shared'

export type PageBuilderRoute =
  | { name: 'home' }
  | { name: 'builder'; workspaceId: string; sessionId: string }
  | { name: 'not-found' }

export function parsePageBuilderRoute(pathname: string, publicBasePath?: string | null): PageBuilderRoute {
  const logicalPathname = stripPageBuilderPublicBasePath(pathname, publicBasePath)
  if (logicalPathname === '/') {
    return { name: 'home' }
  }

  const match = logicalPathname.match(/^\/builder\/([^/]+)\/([^/]+)$/)
  if (!match) {
    return { name: 'not-found' }
  }

  return {
    name: 'builder',
    workspaceId: decodeURIComponent(match[1]!),
    sessionId: decodeURIComponent(match[2]!),
  }
}

export function buildHomePath(publicBasePath?: string | null): string {
  return prependPageBuilderPublicBasePath('/', publicBasePath)
}

export function buildBuilderPath(workspaceId: string, sessionId: string, publicBasePath?: string | null): string {
  return prependPageBuilderPublicBasePath(
    `/builder/${encodeURIComponent(workspaceId)}/${encodeURIComponent(sessionId)}`,
    publicBasePath,
  )
}
