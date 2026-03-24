export type PageBuilderRoute =
  | { name: 'home' }
  | { name: 'builder'; workspaceId: string; sessionId: string }
  | { name: 'not-found' }

export function parsePageBuilderRoute(pathname: string): PageBuilderRoute {
  if (pathname === '/') {
    return { name: 'home' }
  }

  const match = pathname.match(/^\/builder\/([^/]+)\/([^/]+)$/)
  if (!match) {
    return { name: 'not-found' }
  }

  return {
    name: 'builder',
    workspaceId: decodeURIComponent(match[1]!),
    sessionId: decodeURIComponent(match[2]!),
  }
}

export function buildBuilderPath(workspaceId: string, sessionId: string): string {
  return `/builder/${encodeURIComponent(workspaceId)}/${encodeURIComponent(sessionId)}`
}
