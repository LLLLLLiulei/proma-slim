import type {
  AgentMessage,
  AgentSendInput,
  AgentSessionMeta,
  AgentWorkspace,
  AskUserResponse,
  FileSearchResult,
  PageBuilderBlockDeletionPayload,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsApplyTargetSnapshot,
  PageBuilderCmsCatalogList,
  PageBuilderCmsCatalogDetail,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
  PageBuilderCmsSelectionResult,
  PageBuilderCmsSiteSummary,
  PageBuilderEditLockAcquireRequest,
  PageBuilderEditLockCredentials,
  PageBuilderEditLockHolderRequest,
  PageBuilderEditLockLease,
  PageBuilderEditLockStatus,
  PageBuilderImageReplacementPayload,
  PageBuilderInlineTextSavePayload,
  PageBuilderProjectSummary,
  PageBuilderStaticExportJobCreateOptions,
  PageBuilderStaticExportJob,
  PageBuilderTargetSelection,
  PermissionResponse,
  RuntimeStatus,
  WorkspaceCapabilities,
  WorkspaceDirectoryContext,
} from '@ai-page-builder/shared'
import type { AppSettings, UserProfile } from '../../types'

export interface AppStatus {
  ok: boolean
  apiKeyConfigured: boolean
  sdkCliAvailable: boolean
  sdkCliPath?: string | null
  runtimeStatus?: RuntimeStatus | null
}

export interface WorkspacePreviewState {
  hasPreview: boolean
  entryUrl: string | null
  revision: string | null
  hasCmsRendering: boolean
  requiresSameOrigin: boolean
}

interface CreateWorkspaceOptions {
  template?: 'page-builder'
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  editLock?: PageBuilderEditLockCredentials
}

interface PageBuilderImageReplacementRequest extends PageBuilderImageReplacementPayload {
  file: File
}

const CMS_REALTIME_REQUEST_OPTIONS = {
  cache: 'no-store' as const,
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type SendMessagePayload = Partial<AgentSendInput> & {
  userMessage: string
  attachmentFiles?: File[]
}

interface PageBuilderEditLockRequestOptions {
  editLock?: PageBuilderEditLockCredentials
}

function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData
}

function buildHeaders(
  headers?: HeadersInit,
  body?: unknown,
  editLock?: PageBuilderEditLockCredentials,
): Headers {
  const next = new Headers(headers)
  if (editLock) {
    next.set('x-proma-page-builder-edit-lock', editLock.lockId)
    next.set('x-proma-page-builder-edit-holder', editLock.holderId)
  }
  if (body !== undefined && !isFormDataBody(body) && !next.has('content-type')) {
    next.set('content-type', 'application/json')
  }
  return next
}

function buildRequestBody(body: unknown): BodyInit | undefined {
  if (body === undefined) {
    return undefined
  }

  if (isFormDataBody(body)) {
    return body
  }

  return JSON.stringify(body)
}

function buildSendMessageBody(payload: SendMessagePayload): FormData | Omit<SendMessagePayload, 'attachmentFiles'> {
  const { attachmentFiles, ...jsonPayload } = payload
  if (!attachmentFiles || attachmentFiles.length === 0) {
    return jsonPayload
  }

  const formData = new FormData()
  formData.set('payload', JSON.stringify(jsonPayload))
  for (const file of attachmentFiles) {
    formData.append('attachments', file)
  }

  return formData
}

function buildPageBuilderImageReplacementBody(payload: PageBuilderImageReplacementRequest): FormData {
  const formData = new FormData()
  formData.set('payload', JSON.stringify({
    selector: payload.selector,
    imageTargetDescriptor: payload.imageTargetDescriptor,
  }))
  formData.set('file', payload.file)
  return formData
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

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options.headers, options.body, options.editLock),
    body: buildRequestBody(options.body),
  })

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return await response.json() as T
}

async function requestStream(url: string, options: RequestOptions = {}): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options.headers, options.body, options.editLock),
    body: buildRequestBody(options.body),
  })

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  return response
}

export const api = {
  getStatus(): Promise<AppStatus> {
    return request<AppStatus>('/api/status')
  },

  getSettings(): Promise<AppSettings> {
    return request<AppSettings>('/api/settings')
  },

  updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    return request<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: updates,
    })
  },

  getUserProfile(): Promise<UserProfile> {
    return request<UserProfile>('/api/user-profile')
  },

  updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    return request<UserProfile>('/api/user-profile', {
      method: 'PATCH',
      body: updates,
    })
  },

  listSessions(): Promise<AgentSessionMeta[]> {
    return request<AgentSessionMeta[]>('/api/sessions')
  },

  listWorkspaces(): Promise<AgentWorkspace[]> {
    return request<AgentWorkspace[]>('/api/workspaces')
  },

  createWorkspace(name: string, options?: CreateWorkspaceOptions): Promise<AgentWorkspace> {
    return request<AgentWorkspace>('/api/workspaces', {
      method: 'POST',
      body: {
        name,
        ...(options?.template ? { template: options.template } : {}),
      },
    })
  },

  updateWorkspace(
    workspaceId: string,
    updates: Partial<Pick<AgentWorkspace, 'name'>>,
    options?: PageBuilderEditLockRequestOptions,
  ): Promise<AgentWorkspace> {
    return request<AgentWorkspace>(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH',
      body: updates,
      editLock: options?.editLock,
    })
  },

  deleteWorkspace(workspaceId: string): Promise<void> {
    return request<void>(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
    })
  },

  listPageBuilderProjects(): Promise<PageBuilderProjectSummary[]> {
    return request<PageBuilderProjectSummary[]>('/api/page-builder/projects')
  },

  deletePageBuilderProject(workspaceId: string): Promise<void> {
    return request<void>(`/api/page-builder/projects/${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
    })
  },

  acquirePageBuilderEditLock(
    workspaceId: string,
    payload: PageBuilderEditLockAcquireRequest = {},
  ): Promise<PageBuilderEditLockLease> {
    return request<PageBuilderEditLockLease>(`/api/page-builder/projects/${encodeURIComponent(workspaceId)}/edit-lock`, {
      method: 'POST',
      body: payload,
    })
  },

  renewPageBuilderEditLock(
    workspaceId: string,
    lockId: string,
    payload: PageBuilderEditLockHolderRequest,
  ): Promise<PageBuilderEditLockLease> {
    return request<PageBuilderEditLockLease>(`/api/page-builder/projects/${encodeURIComponent(workspaceId)}/edit-lock/${encodeURIComponent(lockId)}/renew`, {
      method: 'POST',
      body: payload,
    })
  },

  getPageBuilderEditLockStatus(workspaceId: string, lockId: string): Promise<PageBuilderEditLockStatus> {
    return request<PageBuilderEditLockStatus>(`/api/page-builder/projects/${encodeURIComponent(workspaceId)}/edit-lock/${encodeURIComponent(lockId)}`)
  },

  releasePageBuilderEditLock(
    workspaceId: string,
    lockId: string,
    payload: PageBuilderEditLockHolderRequest,
  ): Promise<void> {
    return request<void>(`/api/page-builder/projects/${encodeURIComponent(workspaceId)}/edit-lock/${encodeURIComponent(lockId)}/release`, {
      method: 'POST',
      body: payload,
      keepalive: true,
    })
  },

  listPageBuilderCmsCatalogs(query: PageBuilderCmsCatalogQuery = {}): Promise<PageBuilderCmsCatalogList> {
    const params = new URLSearchParams()
    if (query.siteId) {
      params.set('siteId', query.siteId)
    }
    if (query.ids?.length) {
      params.set('ids', query.ids.join(','))
    }
    if (query.contentType) {
      params.set('contentType', query.contentType)
    }
    if (query.searchKeyword) {
      params.set('searchKeyword', query.searchKeyword)
    }

    const url = params.size > 0
      ? `/api/page-builder/cms/catalogs?${params.toString()}`
      : '/api/page-builder/cms/catalogs'

    return request<PageBuilderCmsCatalogList>(url, CMS_REALTIME_REQUEST_OPTIONS)
  },

  listPageBuilderCmsSites(): Promise<PageBuilderCmsSiteSummary[]> {
    return request<PageBuilderCmsSiteSummary[]>('/api/page-builder/cms/sites', CMS_REALTIME_REQUEST_OPTIONS)
  },

  getPageBuilderCmsCatalogDetail(catalogId: string, siteId?: string): Promise<PageBuilderCmsCatalogDetail> {
    const params = new URLSearchParams()
    if (siteId) {
      params.set('siteId', siteId)
    }

    const url = params.size > 0
      ? `/api/page-builder/cms/catalogs/${encodeURIComponent(catalogId)}?${params.toString()}`
      : `/api/page-builder/cms/catalogs/${encodeURIComponent(catalogId)}`

    return request<PageBuilderCmsCatalogDetail>(url, CMS_REALTIME_REQUEST_OPTIONS)
  },

  listPageBuilderCmsContents(query: PageBuilderCmsContentQuery): Promise<PageBuilderCmsContentList> {
    const params = new URLSearchParams()
    if (query.siteId) {
      params.set('siteId', query.siteId)
    }
    if (query.catalogId) {
      params.set('catalogId', query.catalogId)
    }
    if (query.ids?.length) {
      params.set('ids', query.ids.join(','))
    }
    if (query.pageIndex !== undefined) {
      params.set('pageIndex', String(query.pageIndex))
    }
    if (query.pageSize !== undefined) {
      params.set('pageSize', String(query.pageSize))
    }
    if (query.keyword) {
      params.set('keyword', query.keyword)
    }

    return request<PageBuilderCmsContentList>(`/api/page-builder/cms/contents?${params.toString()}`, CMS_REALTIME_REQUEST_OPTIONS)
  },

  getWorkspaceCapabilities(workspaceId: string): Promise<WorkspaceCapabilities> {
    return request<WorkspaceCapabilities>(`/api/workspaces/${encodeURIComponent(workspaceId)}/capabilities`)
  },

  getWorkspaceContext(workspaceId: string): Promise<WorkspaceDirectoryContext> {
    return request<WorkspaceDirectoryContext>(`/api/workspaces/${encodeURIComponent(workspaceId)}/directory-context`)
  },

  getWorkspacePreviewState(workspaceId: string): Promise<WorkspacePreviewState> {
    return request<WorkspacePreviewState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/preview-state`)
  },

  getPageBuilderCmsTargetSnapshot(
    workspaceId: string,
    targetSelection: PageBuilderTargetSelection,
  ): Promise<PageBuilderCmsApplyTargetSnapshot> {
    return request<PageBuilderCmsApplyTargetSnapshot>(`/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/cms-target-snapshot`, {
      method: 'POST',
      body: { targetSelection },
    })
  },

  createPageBuilderCmsAutoHandoff(
    workspaceId: string,
    payload: {
      sessionId: string
      selection: PageBuilderCmsSelectionResult
      uiEntryPoint?: 'block-toolbar' | 'agent-flow'
    },
    options: PageBuilderEditLockRequestOptions = {},
  ): Promise<PageBuilderCmsAutoAgentHandoffRequest> {
    return request<PageBuilderCmsAutoAgentHandoffRequest>(`/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/cms-auto-handoff`, {
      method: 'POST',
      body: payload,
      editLock: options.editLock,
    })
  },

  savePageBuilderInlineText(
    workspaceId: string,
    payload: PageBuilderInlineTextSavePayload,
    options: PageBuilderEditLockRequestOptions = {},
  ): Promise<WorkspacePreviewState> {
    return request<WorkspacePreviewState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/inline-text`, {
      method: 'POST',
      body: payload,
      editLock: options.editLock,
    })
  },

  deletePageBuilderBlock(
    workspaceId: string,
    payload: PageBuilderBlockDeletionPayload,
    options: PageBuilderEditLockRequestOptions = {},
  ): Promise<WorkspacePreviewState> {
    return request<WorkspacePreviewState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/block-delete`, {
      method: 'POST',
      body: payload,
      editLock: options.editLock,
    })
  },

  replacePageBuilderImage(
    workspaceId: string,
    payload: PageBuilderImageReplacementRequest,
    options: PageBuilderEditLockRequestOptions = {},
  ): Promise<WorkspacePreviewState> {
    return request<WorkspacePreviewState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/image`, {
      method: 'POST',
      body: buildPageBuilderImageReplacementBody(payload),
      editLock: options.editLock,
    })
  },

  createPageBuilderStaticExportJob(
    workspaceId: string,
    options?: PageBuilderStaticExportJobCreateOptions,
    requestOptions: PageBuilderEditLockRequestOptions = {},
  ): Promise<PageBuilderStaticExportJob> {
    return request<PageBuilderStaticExportJob>(`/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/export-static-jobs`, {
      method: 'POST',
      body: {
        downloadCmsRemoteAssets: options?.downloadCmsRemoteAssets ?? true,
      },
      editLock: requestOptions.editLock,
    })
  },

  getPageBuilderStaticExportJob(
    workspaceId: string,
    jobId: string,
  ): Promise<PageBuilderStaticExportJob> {
    return request<PageBuilderStaticExportJob>(`/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/export-static-jobs/${encodeURIComponent(jobId)}`)
  },

  getPageBuilderStaticExportDownloadUrl(workspaceId: string, jobId: string): string {
    return `/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/export-static-jobs/${encodeURIComponent(jobId)}/download`
  },

  searchWorkspaceFiles(
    workspaceId: string,
    query: string,
    limit = 8,
    extraDirectories: string[] = [],
  ): Promise<FileSearchResult> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
    })
    for (const directory of extraDirectories) {
      params.append('dir', directory)
    }
    return request<FileSearchResult>(`/api/workspaces/${encodeURIComponent(workspaceId)}/file-search?${params.toString()}`)
  },

  createSession(title?: string, workspaceId?: string): Promise<AgentSessionMeta> {
    const body = {
      ...(title ? { title } : {}),
      ...(workspaceId ? { workspaceId } : {}),
    }

    return request<AgentSessionMeta>('/api/sessions', {
      method: 'POST',
      body,
    })
  },

  deleteSession(sessionId: string): Promise<void> {
    return request<void>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
  },

  updateSessionTitle(sessionId: string, title: string): Promise<AgentSessionMeta> {
    return request<AgentSessionMeta>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: { title },
    })
  },

  moveSessionToWorkspace(sessionId: string, workspaceId: string): Promise<AgentSessionMeta> {
    return request<AgentSessionMeta>(`/api/sessions/${encodeURIComponent(sessionId)}/move-workspace`, {
      method: 'POST',
      body: { workspaceId },
    })
  },

  getSessionMessages(sessionId: string): Promise<AgentMessage[]> {
    return request<AgentMessage[]>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  },

  getSessionActivity(sessionId: string): Promise<{ active: boolean }> {
    return request<{ active: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/activity`)
  },

  sendMessage(
    sessionId: string,
    payload: SendMessagePayload,
    init?: Pick<RequestInit, 'signal'> & PageBuilderEditLockRequestOptions,
  ): Promise<Response> {
    return requestStream(`/api/sessions/${encodeURIComponent(sessionId)}/send`, {
      method: 'POST',
      body: buildSendMessageBody(payload),
      signal: init?.signal,
      editLock: init?.editLock,
    })
  },

  stopSession(sessionId: string): Promise<void> {
    return request<void>(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, {
      method: 'POST',
    })
  },

  respondPermission(sessionId: string, response: PermissionResponse): Promise<void> {
    return request<void>(`/api/sessions/${encodeURIComponent(sessionId)}/permission-respond`, {
      method: 'POST',
      body: response,
    })
  },

  respondAskUser(sessionId: string, response: AskUserResponse): Promise<void> {
    return request<void>(`/api/sessions/${encodeURIComponent(sessionId)}/ask-user-respond`, {
      method: 'POST',
      body: response,
    })
  },
}
