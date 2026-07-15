import { cmsLoginExpired, cmsLoginUnavailable, invalidCmsRequest } from './cms-integration-errors'
import {
  buildCmsUpstreamFailureMessage,
  extractCmsPayloadMessage,
  logCmsUpstreamRequestFailure,
  logCmsUpstreamRequestStart,
  logCmsUpstreamResponse,
  parseCmsJsonSafely,
} from '../cms-upstream-diagnostics'

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
  const url = buildLoginUrl(options.cmsBaseUrl)
  const requestHeaders = {
    accept: 'application/json, text/plain, */*',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    referer: `${options.cmsBaseUrl.replace(/\/+$/, '')}/app.html`,
    cookie: cmsCookie,
  }
  const startedAt = Date.now()
  let response: Response

  logCmsUpstreamRequestStart({
    operation: 'login_validate',
    method: 'GET',
    url,
    requestHeaders,
    startedAt,
  })

  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: requestHeaders,
    })
  } catch (error) {
    logCmsUpstreamRequestFailure({
      operation: 'login_validate',
      method: 'GET',
      url,
      requestHeaders,
      startedAt,
      error,
    })
    throw cmsLoginUnavailable(buildCmsUpstreamFailureMessage({
      prefix: 'CMS 登录态校验暂不可用',
      url,
      error,
    }))
  }

  const rawText = await response.text()
  const parsed = parseCmsJsonSafely(rawText)
  const payloadRecord = asRecord(parsed)

  logCmsUpstreamResponse({
    operation: 'login_validate',
    method: 'GET',
    url,
    requestHeaders,
    startedAt,
    response,
    responseBody: rawText,
  })

  if (response.status === 401 || response.status === 403) {
    throw cmsLoginExpired(buildCmsUpstreamFailureMessage({
      prefix: 'CMS 登录态已失效',
      url,
      response,
      payload: parsed,
      rawText,
    }))
  }

  if (!response.ok) {
    throw cmsLoginUnavailable(buildCmsUpstreamFailureMessage({
      prefix: 'CMS 登录态校验暂不可用',
      url,
      response,
      payload: parsed,
      rawText,
    }))
  }

  if (!payloadRecord) {
    throw cmsLoginUnavailable(buildCmsUpstreamFailureMessage({
      prefix: 'CMS 登录态校验暂不可用',
      url,
      response,
      payload: parsed,
      rawText,
      fallbackDetail: 'CMS 登录态校验响应格式不正确',
    }))
  }

  const payload = payloadRecord
  const data = asRecord(payload.data)
  if (!data) {
    throw cmsLoginUnavailable(buildCmsUpstreamFailureMessage({
      prefix: 'CMS 登录态校验暂不可用',
      url,
      response,
      payload,
      rawText,
      fallbackDetail: extractCmsPayloadMessage(payload) || 'CMS 登录态校验响应缺少 data',
    }))
  }

  if (payload.status !== 1 || data.logined !== true) {
    throw cmsLoginExpired(buildCmsUpstreamFailureMessage({
      prefix: 'CMS 登录态已失效',
      url,
      response,
      payload,
      rawText,
    }))
  }

  return {
    ...(readOptionalString(data.userName) ? { userName: readOptionalString(data.userName) } : {}),
    ...(readOptionalString(data.realName) ? { realName: readOptionalString(data.realName) } : {}),
    ...(readOptionalString(data.roleType) ? { roleType: readOptionalString(data.roleType) } : {}),
    ...(readOptionalBoolean(data.isAdminUser) !== undefined ? { isAdminUser: readOptionalBoolean(data.isAdminUser) } : {}),
  }
}
