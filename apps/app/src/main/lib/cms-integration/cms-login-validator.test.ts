import { describe, expect, mock, test } from 'bun:test'
import { CmsIntegrationError } from './cms-integration-errors'
import { validateCmsLogin } from './cms-login-validator'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('validateCmsLogin', () => {
  test('rejects missing CMS cookie before calling upstream login', async () => {
    const fetchFn = mock(async () => jsonResponse({ status: 1, data: { logined: true } }))

    await expect(validateCmsLogin({
      cmsBaseUrl: 'https://cms.example.com/manager',
      cmsCookie: '   ',
      fetchFn,
    })).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    })
    expect(fetchFn).toHaveBeenCalledTimes(0)
  })

  test('forwards CMS cookie and extracts user summary when /ui/login reports logged in', async () => {
    const fetchFn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://cms.example.com/manager/ui/login')
      expect(init?.method).toBe('GET')
      expect(new Headers(init?.headers).get('cookie')).toBe('JSESSIONID=abc; Path=/')
      expect(new Headers(init?.headers).get('accept')).toBe('application/json, text/plain, */*')
      expect(new Headers(init?.headers).get('referer')).toBe('https://cms.example.com/manager/app.html')
      return jsonResponse({
        status: 1,
        data: {
          logined: true,
          userName: 'cms-user',
          realName: 'CMS User',
          roleType: 'editor',
          isAdminUser: false,
        },
      })
    })

    await expect(validateCmsLogin({
      cmsBaseUrl: 'https://cms.example.com/manager/',
      cmsCookie: 'JSESSIONID=abc; Path=/',
      fetchFn,
    })).resolves.toEqual({
      userName: 'cms-user',
      realName: 'CMS User',
      roleType: 'editor',
      isAdminUser: false,
    })
  })

  test.each([
    ['status not success', jsonResponse({ status: 0, message: 'login expired', data: { logined: true } }), 'login expired'],
    ['not logged in', jsonResponse({ status: 1, message: 'not logged in', data: { logined: false } }), 'not logged in'],
    ['upstream 401', jsonResponse({ status: 0, message: 'session expired', data: { logined: false } }, 401), 'HTTP 401'],
    ['upstream 403', jsonResponse({ status: 0, message: 'permission denied', data: { logined: false } }, 403), 'HTTP 403'],
  ])('maps %s to cms_login_expired with upstream details', async (_name, response, expectedMessage) => {
    const fetchFn = mock(async () => response)

    await expect(validateCmsLogin({
      cmsBaseUrl: 'https://cms.example.com/manager',
      cmsCookie: 'JSESSIONID=abc',
      fetchFn,
    })).rejects.toMatchObject({
      code: 'cms_login_expired',
      status: 401,
      message: expect.stringContaining(expectedMessage),
    })
  })

  test.each([
    ['upstream 500', jsonResponse({ status: 0, message: 'server down' }, 500), 'HTTP 500'],
    ['non json', new Response('<html>error</html>', { status: 200, headers: { 'content-type': 'text/html' } }), '<html>error</html>'],
    ['missing data', jsonResponse({ status: 1, message: 'missing login data' }), 'missing login data'],
  ])('maps %s to cms_login_unavailable with upstream details', async (_name, response, expectedMessage) => {
    const fetchFn = mock(async () => response)

    await expect(validateCmsLogin({
      cmsBaseUrl: 'https://cms.example.com/manager',
      cmsCookie: 'JSESSIONID=abc',
      fetchFn,
    })).rejects.toMatchObject({
      code: 'cms_login_unavailable',
      status: 502,
      message: expect.stringContaining(expectedMessage),
    })
  })

  test('maps network failures to cms_login_unavailable', async () => {
    const fetchFn = mock(async () => {
      throw new Error('network down')
    })

    await expect(validateCmsLogin({
      cmsBaseUrl: 'https://cms.example.com/manager',
      cmsCookie: 'JSESSIONID=abc',
      fetchFn,
    })).rejects.toBeInstanceOf(CmsIntegrationError)
    await expect(validateCmsLogin({
      cmsBaseUrl: 'https://cms.example.com/manager',
      cmsCookie: 'JSESSIONID=abc',
      fetchFn,
    })).rejects.toMatchObject({
      code: 'cms_login_unavailable',
      status: 502,
      message: expect.stringContaining('network down'),
    })
  })
})
