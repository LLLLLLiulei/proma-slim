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
    ['status not success', jsonResponse({ status: 0, data: { logined: true } })],
    ['not logged in', jsonResponse({ status: 1, data: { logined: false } })],
    ['upstream 401', jsonResponse({ status: 0, data: { logined: false } }, 401)],
    ['upstream 403', jsonResponse({ status: 0, data: { logined: false } }, 403)],
  ])('maps %s to cms_login_expired', async (_name, response) => {
    const fetchFn = mock(async () => response)

    await expect(validateCmsLogin({
      cmsBaseUrl: 'https://cms.example.com/manager',
      cmsCookie: 'JSESSIONID=abc',
      fetchFn,
    })).rejects.toMatchObject({
      code: 'cms_login_expired',
      status: 401,
    })
  })

  test.each([
    ['upstream 500', jsonResponse({ status: 0 }, 500)],
    ['non json', new Response('<html>error</html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['missing data', jsonResponse({ status: 1 })],
  ])('maps %s to cms_login_unavailable', async (_name, response) => {
    const fetchFn = mock(async () => response)

    await expect(validateCmsLogin({
      cmsBaseUrl: 'https://cms.example.com/manager',
      cmsCookie: 'JSESSIONID=abc',
      fetchFn,
    })).rejects.toMatchObject({
      code: 'cms_login_unavailable',
      status: 502,
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
    })
  })
})
