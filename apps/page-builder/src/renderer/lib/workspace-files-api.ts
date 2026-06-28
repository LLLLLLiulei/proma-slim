import { ApiError, resolveApiUrl, type WorkspacePreviewState } from '@/lib/api'
import type { PageBuilderEditLockCredentials } from '@ai-page-builder/shared'

export interface WorkspaceFileEntry {
  /** 相对 `workspace-files/` 的 posix 路径 */
  path: string
  name: string
  type: 'file' | 'directory'
  size: number
}

export interface WorkspaceFileTree {
  entries: WorkspaceFileEntry[]
}

export interface WorkspaceFileContent {
  path: string
  content: string
  size: number
  largeFileWarning: boolean
  version: string
}

export interface WorkspaceFileSaveResult {
  path: string
  changed: boolean
  version: string
  manifestUpdated: boolean
  previewState: WorkspacePreviewState
}

export interface WorkspaceFileWriteOptions {
  editLock?: PageBuilderEditLockCredentials
  baseVersion?: string
}

interface RequestOptions {
  method: string
  body?: unknown
  editLock?: PageBuilderEditLockCredentials
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json() as { error?: string; message?: string }
      return payload.error ?? payload.message ?? `请求失败 (${response.status})`
    } catch {
      return `请求失败 (${response.status})`
    }
  }
  try {
    const text = await response.text()
    return text.trim() || `请求失败 (${response.status})`
  } catch {
    return `请求失败 (${response.status})`
  }
}

async function requestJson<T>(url: string, options: RequestOptions): Promise<T> {
  const headers = new Headers()
  if (options.editLock) {
    headers.set('x-proma-page-builder-edit-lock', options.editLock.lockId)
    headers.set('x-proma-page-builder-edit-holder', options.editLock.holderId)
  }
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(resolveApiUrl(url), { method: options.method, headers, body })
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return await response.json() as T
}

function filesBase(workspaceId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/files`
}

/** 按路径段编码，保留 `/` 分隔 */
function encodeFilePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export const workspaceFilesApi = {
  list(workspaceId: string): Promise<WorkspaceFileTree> {
    return requestJson<WorkspaceFileTree>(filesBase(workspaceId), { method: 'GET' })
  },
  read(workspaceId: string, path: string): Promise<WorkspaceFileContent> {
    return requestJson<WorkspaceFileContent>(`${filesBase(workspaceId)}/${encodeFilePath(path)}`, { method: 'GET' })
  },
  save(
    workspaceId: string,
    path: string,
    content: string,
    options: WorkspaceFileWriteOptions = {},
  ): Promise<WorkspaceFileSaveResult> {
    return requestJson<WorkspaceFileSaveResult>(`${filesBase(workspaceId)}/${encodeFilePath(path)}`, {
      method: 'PUT',
      body: {
        content,
        ...(options.baseVersion ? { baseVersion: options.baseVersion } : {}),
      },
      editLock: options.editLock,
    })
  },
}
