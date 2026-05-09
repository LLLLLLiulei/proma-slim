import { cmsLoginExpired, cmsLoginUnavailable, invalidCmsRequest } from './cms-integration-errors'

export interface CmsLoginUserSummary {
  userName?: string
  realName?: string
  roleType?: string
  isAdminUser?: boolean
}

interface ValidateCmsLoginOptions {
  cmsBaseUrl: string | null
  cmsCookie: string | null | undefined
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function buildLoginUrl(cmsBaseUrl: string): string {
  return `${cmsBaseUrl.replace(/\/+$/, '')}/ui/login`
}

export async function validateCmsLogin(options: ValidateCmsLoginOptions): Promise<CmsLoginUserSummary> {
  const cmsCookie = options.cmsCookie?.trim()
  if (!cmsCookie) {
    throw invalidCmsRequest('X-CMS-Cookie 不能为空')
  }

  if (!options.cmsBaseUrl) {
    throw cmsLoginUnavailable()
  }

  const fetchFn = options.fetchFn ?? fetch
  let response: Response
  try {
    response = await fetchFn(buildLoginUrl(options.cmsBaseUrl), {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        referer: `${options.cmsBaseUrl.replace(/\/+$/, '')}/app.html`,
        cookie: cmsCookie,
      },
    })
  } catch {
    throw cmsLoginUnavailable()
  }

  if (response.status === 401 || response.status === 403) {
    throw cmsLoginExpired()
  }

  if (!response.ok) {
    throw cmsLoginUnavailable()
  }

  let payload: Record<string, unknown>
  try {
    const parsed = await response.json()
    const record = asRecord(parsed)
    if (!record) {
      throw new Error('invalid payload')
    }
    payload = record
  } catch {
    throw cmsLoginUnavailable()
  }

  const data = asRecord(payload.data)
  if (!data) {
    throw cmsLoginUnavailable()
  }

  if (payload.status !== 1 || data.logined !== true) {
    throw cmsLoginExpired()
  }

  return {
    ...(readOptionalString(data.userName) ? { userName: readOptionalString(data.userName) } : {}),
    ...(readOptionalString(data.realName) ? { realName: readOptionalString(data.realName) } : {}),
    ...(readOptionalString(data.roleType) ? { roleType: readOptionalString(data.roleType) } : {}),
    ...(readOptionalBoolean(data.isAdminUser) !== undefined ? { isAdminUser: readOptionalBoolean(data.isAdminUser) } : {}),
  }
}
