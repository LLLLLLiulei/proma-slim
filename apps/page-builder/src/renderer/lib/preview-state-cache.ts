import type { WorkspacePreviewState } from '@/lib/api'

function getWorkspacePreviewStateStorageKey(workspaceId: string): string {
  return `page-builder.preview-state.${workspaceId}`
}

export function writeWorkspacePreviewState(
  storage: Storage,
  workspaceId: string,
  state: WorkspacePreviewState,
): void {
  if (!state.hasPreview || !state.entryUrl || !state.revision) {
    clearWorkspacePreviewState(storage, workspaceId)
    return
  }

  storage.setItem(getWorkspacePreviewStateStorageKey(workspaceId), JSON.stringify({
    hasPreview: true,
    entryUrl: state.entryUrl,
    revision: state.revision,
  } satisfies WorkspacePreviewState))
}

export function readWorkspacePreviewState(
  storage: Storage,
  workspaceId: string,
): WorkspacePreviewState | null {
  const raw = storage.getItem(getWorkspacePreviewStateStorageKey(workspaceId))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspacePreviewState>
    if (
      parsed.hasPreview !== true
      || typeof parsed.entryUrl !== 'string'
      || typeof parsed.revision !== 'string'
    ) {
      clearWorkspacePreviewState(storage, workspaceId)
      return null
    }

    return {
      hasPreview: true,
      entryUrl: parsed.entryUrl,
      revision: parsed.revision,
    }
  } catch {
    clearWorkspacePreviewState(storage, workspaceId)
    return null
  }
}

export function clearWorkspacePreviewState(storage: Storage, workspaceId: string): void {
  storage.removeItem(getWorkspacePreviewStateStorageKey(workspaceId))
}
