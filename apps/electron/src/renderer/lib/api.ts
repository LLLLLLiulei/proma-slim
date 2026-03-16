import type {
  AgentMessage,
  AgentSendInput,
  AgentSessionMeta,
  AskUserResponse,
  PermissionResponse,
  RuntimeStatus,
} from '@proma/shared'
import type { UserProfile } from '../../types'

export interface AppStatus {
  ok: boolean
  apiKeyConfigured: boolean
  sdkCliAvailable: boolean
  sdkCliPath?: string | null
  runtimeStatus?: RuntimeStatus | null
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

function buildHeaders(headers?: HeadersInit, hasBody = false): Headers {
  const next = new Headers(headers)
  if (hasBody && !next.has('content-type')) {
    next.set('content-type', 'application/json')
  }
  return next
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
  const hasBody = options.body !== undefined
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options.headers, hasBody),
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return await response.json() as T
}

async function requestStream(url: string, options: RequestOptions = {}): Promise<Response> {
  const hasBody = options.body !== undefined
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options.headers, hasBody),
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return response
}

export const api = {
  getStatus(): Promise<AppStatus> {
    return request<AppStatus>('/api/status')
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

  createSession(title?: string): Promise<AgentSessionMeta> {
    return request<AgentSessionMeta>('/api/sessions', {
      method: 'POST',
      body: title ? { title } : {},
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

  getSessionMessages(sessionId: string): Promise<AgentMessage[]> {
    return request<AgentMessage[]>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  },

  sendMessage(
    sessionId: string,
    payload: Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput>,
    init?: Pick<RequestInit, 'signal'>,
  ): Promise<Response> {
    return requestStream(`/api/sessions/${encodeURIComponent(sessionId)}/send`, {
      method: 'POST',
      body: payload,
      signal: init?.signal,
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
