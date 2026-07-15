import { afterEach, describe, expect, mock, test } from 'bun:test'

const TEST_CONFIG = {
  baseUrl: 'https://demo.zving.com/manager',
  username: 'test-user',
  password: 'test-pass',
} as const

afterEach(() => {
  mock.restore()
})

describe('CmsTokenProvider', () => {
  test('requests a bearer token with username and password', async () => {
    const { createCmsTokenProvider } = await import('./cms-token-provider')
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://demo.zving.com/manager/api/token')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      })
      expect(init?.body).toBe(JSON.stringify({
        username: 'test-user',
        password: 'test-pass',
      }))

      return new Response(JSON.stringify({
        status: 1,
        message: '操作成功!',
        access_token: 'Bearer slim-token-1',
        expires_in: 18000,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const provider = createCmsTokenProvider({
      config: TEST_CONFIG,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await expect(provider.getAuthorizationHeader()).resolves.toBe('Bearer slim-token-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('reuses cached tokens until the refresh window and then refreshes them', async () => {
    const { createCmsTokenProvider } = await import('./cms-token-provider')
    let now = 0
    let tokenCounter = 0
    const fetchMock = mock(async () => {
      tokenCounter += 1
      return new Response(JSON.stringify({
        status: 1,
        message: '操作成功!',
        access_token: `Bearer slim-token-${tokenCounter}`,
        expires_in: 100,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const provider = createCmsTokenProvider({
      config: TEST_CONFIG,
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => now,
    })

    expect(await provider.getAuthorizationHeader()).toBe('Bearer slim-token-1')
    now = 60_000
    expect(await provider.getAuthorizationHeader()).toBe('Bearer slim-token-1')
    now = 75_001
    expect(await provider.getAuthorizationHeader()).toBe('Bearer slim-token-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('deduplicates concurrent token refreshes', async () => {
    const { createCmsTokenProvider } = await import('./cms-token-provider')
    let resolveRequest: ((response: Response) => void) | null = null
    const fetchMock = mock(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve
    }))

    const provider = createCmsTokenProvider({
      config: TEST_CONFIG,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const pending = Promise.all([
      provider.getAuthorizationHeader(),
      provider.getAuthorizationHeader(),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const completePendingRequest = resolveRequest as ((response: Response) => void) | null

    if (!completePendingRequest) {
      throw new Error('expected a pending token refresh request')
    }

    completePendingRequest(new Response(JSON.stringify({
      status: 1,
      message: '操作成功!',
      access_token: 'Bearer slim-token-1',
      expires_in: 18000,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await expect(pending).resolves.toEqual([
      'Bearer slim-token-1',
      'Bearer slim-token-1',
    ])
  })

  test('returns auth failures with http status and raw cms error details', async () => {
    const { createCmsTokenProvider } = await import('./cms-token-provider')
    const fetchMock = mock(async () => new Response(JSON.stringify({
      status: 0,
      message: 'login failed for username=test-user password=test-pass',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }))

    const provider = createCmsTokenProvider({
      config: TEST_CONFIG,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    try {
      await provider.getAuthorizationHeader()
      throw new Error('expected getAuthorizationHeader to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).toContain('CMS 鉴权失败')
      expect(message).toContain('HTTP 401')
      expect(message).toContain('/api/token')
      expect(message).toContain('login failed for username=test-user password=test-pass')
    }
  })

  test('allows invalidating cached token before the refresh window', async () => {
    const { createCmsTokenProvider } = await import('./cms-token-provider')
    let tokenCounter = 0
    const fetchMock = mock(async () => {
      tokenCounter += 1
      return new Response(JSON.stringify({
        status: 1,
        message: '操作成功!',
        access_token: `Bearer slim-token-${tokenCounter}`,
        expires_in: 18000,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const provider = createCmsTokenProvider({
      config: TEST_CONFIG,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    expect(await provider.getAuthorizationHeader()).toBe('Bearer slim-token-1')
    if (!provider.invalidateAuthorizationHeader) {
      throw new Error('Expected CMS token provider to support cache invalidation')
    }
    provider.invalidateAuthorizationHeader()
    expect(await provider.getAuthorizationHeader()).toBe('Bearer slim-token-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('reuses the shared provider for the same auth config without a site dimension', async () => {
    const { getSharedCmsTokenProvider } = await import('./cms-token-provider')
    const fetchMock = mock(async () => new Response(JSON.stringify({
      status: 1,
      message: '操作成功!',
      access_token: 'Bearer slim-token-1',
      expires_in: 18000,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const providerA = getSharedCmsTokenProvider({
      config: TEST_CONFIG,
      fetchFn: fetchMock as unknown as typeof fetch,
    })
    const providerB = getSharedCmsTokenProvider({
      config: {
        baseUrl: 'https://demo.zving.com/manager',
        username: 'test-user',
        password: 'test-pass',
      },
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    expect(providerA).toBe(providerB)
  })
})
