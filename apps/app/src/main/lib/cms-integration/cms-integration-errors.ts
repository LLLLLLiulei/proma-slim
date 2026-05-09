export type CmsIntegrationErrorCode =
  | 'invalid_request'
  | 'integration_unauthorized'
  | 'cms_login_expired'
  | 'cms_login_unavailable'
  | 'project_conflict'
  | 'project_not_found'

const DEFAULT_MESSAGES: Record<CmsIntegrationErrorCode, string> = {
  invalid_request: '请求参数不合法',
  integration_unauthorized: 'PageBuilder 集成鉴权失败',
  cms_login_expired: 'CMS 登录态已失效，请重新进入 CMS 后再试',
  cms_login_unavailable: 'CMS 登录态校验暂不可用，请稍后再试',
  project_conflict: 'CMS 项目绑定冲突，无法安全复用已有项目',
  project_not_found: 'CMS 项目不存在',
}

export class CmsIntegrationError extends Error {
  readonly code: CmsIntegrationErrorCode
  readonly status: number

  constructor(code: CmsIntegrationErrorCode, status: number, message = DEFAULT_MESSAGES[code]) {
    super(message)
    this.name = 'CmsIntegrationError'
    this.code = code
    this.status = status
  }
}

export function toCmsIntegrationErrorResponse(error: CmsIntegrationError): Response {
  return new Response(JSON.stringify({ code: error.code, error: error.message }), {
    status: error.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

export function invalidCmsRequest(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('invalid_request', 400, message)
}

export function cmsIntegrationUnauthorized(): CmsIntegrationError {
  return new CmsIntegrationError('integration_unauthorized', 401)
}

export function cmsLoginExpired(): CmsIntegrationError {
  return new CmsIntegrationError('cms_login_expired', 401)
}

export function cmsLoginUnavailable(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('cms_login_unavailable', 502, message)
}

export function cmsProjectConflict(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('project_conflict', 409, message)
}
