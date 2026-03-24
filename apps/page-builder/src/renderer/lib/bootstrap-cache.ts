export interface PageBuilderBootstrapPayload {
  sessionId: string
  workspaceId: string
  initialPrompt: string
}

function getBootstrapStorageKey(sessionId: string): string {
  return `page-builder.bootstrap.${sessionId}`
}

export function writeBootstrapPayload(
  storage: Storage,
  payload: PageBuilderBootstrapPayload,
): void {
  storage.setItem(getBootstrapStorageKey(payload.sessionId), JSON.stringify(payload))
}

export function readBootstrapPayload(
  storage: Storage,
  sessionId: string,
): PageBuilderBootstrapPayload | null {
  const raw = storage.getItem(getBootstrapStorageKey(sessionId))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PageBuilderBootstrapPayload>
    if (
      typeof parsed.sessionId !== 'string'
      || typeof parsed.workspaceId !== 'string'
      || typeof parsed.initialPrompt !== 'string'
    ) {
      clearBootstrapPayload(storage, sessionId)
      return null
    }

    return {
      sessionId: parsed.sessionId,
      workspaceId: parsed.workspaceId,
      initialPrompt: parsed.initialPrompt,
    }
  } catch {
    clearBootstrapPayload(storage, sessionId)
    return null
  }
}

export function clearBootstrapPayload(storage: Storage, sessionId: string): void {
  storage.removeItem(getBootstrapStorageKey(sessionId))
}
