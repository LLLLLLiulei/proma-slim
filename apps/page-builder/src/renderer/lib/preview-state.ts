import type { WorkspacePreviewState } from '@/lib/api'

export const BUILDER_PREVIEW_POLL_INTERVAL_MS = 1000

export function areWorkspacePreviewStatesEqual(
  left: WorkspacePreviewState | null,
  right: WorkspacePreviewState | null,
): boolean {
  return left?.hasPreview === right?.hasPreview
    && left?.entryUrl === right?.entryUrl
    && left?.revision === right?.revision
}

export function resolveWorkspacePreviewUrl(state: WorkspacePreviewState | null): string | null {
  if (!state?.hasPreview || !state.entryUrl || !state.revision) {
    return null
  }

  const separator = state.entryUrl.includes('?') ? '&' : '?'
  return `${state.entryUrl}${separator}v=${encodeURIComponent(state.revision)}`
}
