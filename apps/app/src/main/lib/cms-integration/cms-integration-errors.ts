export type CmsIntegrationErrorCode =
  | 'invalid_request'
  | 'integration_unauthorized'
  | 'cms_login_expired'
  | 'cms_login_unavailable'
  | 'project_conflict'
  | 'project_not_found'
  | 'handoff_expired'
  | 'preview_not_ready'
  | 'builder_access_required'
  | 'builder_access_mismatch'
  | 'builder_access_origin_forbidden'

const DEFAULT_MESSAGES: Record<CmsIntegrationErrorCode, string> = {
  invalid_request: '请求参数不合法',
  integration_unauthorized: 'PageBuilder 集成鉴权失败',
  cms_login_expired: 'CMS 登录态已失效，请重新进入 CMS 后再试',
  cms_login_unavailable: 'CMS 登录态校验暂不可用，请稍后再试',
  project_conflict: 'CMS 项目绑定冲突，无法安全复用已有项目',
  project_not_found: 'CMS 项目不存在',
  handoff_expired: 'CMS handoff 已失效，请重新从 CMS 进入',
  preview_not_ready: '当前项目尚未生成可预览内容，请先完成预览构建',
  builder_access_required: '请先通过 CMS handoff 重新进入 PageBuilder',
  builder_access_mismatch: '当前访问会话与目标工作区不匹配，请从 CMS 重新进入',
  builder_access_origin_forbidden: '当前请求来源不可信，请从 CMS 页面重新进入 PageBuilder',
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

export function cmsProjectNotFound(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('project_not_found', 404, message)
}

export function handoffExpired(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('handoff_expired', 410, message)
}

export function previewNotReady(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('preview_not_ready', 409, message)
}

export function builderAccessRequired(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('builder_access_required', 401, message)
}

export function builderAccessMismatch(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('builder_access_mismatch', 403, message)
}

export function builderAccessOriginForbidden(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('builder_access_origin_forbidden', 403, message)
}
