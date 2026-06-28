import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { workspaceFilesApi } from './workspace-files-api'
import { ApiError } from '@/lib/api'

const originalFetch = globalThis.fetch
const fetchMock = mock((_url: string | URL, _init?: RequestInit) =>
  Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function lastCall(): [string | URL, RequestInit | undefined] {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  return call as [string | URL, RequestInit | undefined]
}

describe('workspace-files-api', () => {
  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockClear()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('list 发起 GET /files', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ entries: [] })))
    await workspaceFilesApi.list('ws-1')
    const [url, init] = lastCall()
    expect(String(url)).toMatch(/\/api\/workspaces\/ws-1\/files$/)
    expect(init?.method).toBe('GET')
  })

  test('read 编码文件路径段但保留分隔符', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({
      path: 'a',
      content: '',
      size: 0,
      largeFileWarning: false,
      version: 'v1',
    })))
    const result = await workspaceFilesApi.read('ws-1', 'assets/a b.js')
    const [url, init] = lastCall()
    expect(String(url)).toContain('/api/workspaces/ws-1/files/assets/a%20b.js')
    expect(init?.method).toBe('GET')
    expect(result.version).toBe('v1')
  })

  test('save 发起 PUT、body 含 content/baseVersion、注入编辑锁 header', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({
      path: 'index.html', changed: true, version: 'v2', manifestUpdated: true,
      previewState: { hasPreview: true, entryUrl: null, revision: 'r', hasCmsRendering: false, requiresSameOrigin: false },
    })))
    await workspaceFilesApi.save('ws-1', 'index.html', '<html/>', {
      editLock: { lockId: 'L', holderId: 'H' },
      baseVersion: 'v1',
    })
    const [url, init] = lastCall()
    expect(init?.method).toBe('PUT')
    expect(String(url)).toContain('/api/workspaces/ws-1/files/index.html')
    expect(init?.body).toBe(JSON.stringify({ content: '<html/>', baseVersion: 'v1' }))
    const headers = new Headers(init?.headers)
    expect(headers.get('x-proma-page-builder-edit-lock')).toBe('L')
    expect(headers.get('x-proma-page-builder-edit-holder')).toBe('H')
  })

  test('save 未传 editLock 时不注入锁 header', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({
      path: 'a.css', changed: false, version: 'v1', manifestUpdated: false,
      previewState: { hasPreview: false, entryUrl: null, revision: null, hasCmsRendering: false, requiresSameOrigin: false },
    })))
    await workspaceFilesApi.save('ws-1', 'a.css', 'x')
    const [, init] = lastCall()
    const headers = new Headers(init?.headers)
    expect(headers.get('x-proma-page-builder-edit-lock')).toBeNull()
  })

  test('客户端不暴露新建或删除文件能力', () => {
    expect('create' in workspaceFilesApi).toBe(false)
    expect('delete' in workspaceFilesApi).toBe(false)
  })

  test('非 2xx 响应抛出带 status 的 ApiError', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ error: '编辑锁已失效' }, 409)))
    await expect(workspaceFilesApi.list('ws-1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
    })
    expect(ApiError).toBeDefined()
  })
})
