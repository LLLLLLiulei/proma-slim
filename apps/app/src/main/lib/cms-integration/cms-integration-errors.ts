export type CmsIntegrationErrorCode =
  | 'invalid_request'
  | 'integration_unauthorized'
  | 'cms_login_expired'
  | 'cms_login_unavailable'
  | 'project_conflict'
  | 'project_not_found'
  | 'handoff_expired'
  | 'preview_not_ready'
  | 'project_busy'
  | 'export_upstream_failed'
  | 'export_timeout'
  | 'builder_access_required'
  | 'builder_access_mismatch'
  | 'builder_access_origin_forbidden'
  | 'template_not_found'
  | 'template_import_invalid'
  | 'template_size_limit'
  | 'template_import_forbidden'
  | 'template_import_failed'
  | 'template_operation_forbidden'
  | 'template_operation_failed'

const DEFAULT_MESSAGES: Record<CmsIntegrationErrorCode, string> = {
  invalid_request: '请求参数不合法',
  integration_unauthorized: 'PageBuilder 集成鉴权失败',
  cms_login_expired: 'CMS 登录态已失效，请重新进入 CMS 后再试',
  cms_login_unavailable: 'CMS 登录态校验暂不可用，请稍后再试',
  project_conflict: 'CMS 项目绑定冲突，无法安全复用已有项目',
  project_not_found: 'CMS 项目不存在',
  handoff_expired: 'CMS handoff 已失效，请重新从 CMS 进入',
  preview_not_ready: '当前项目尚未生成可预览内容，请先完成预览构建',
  project_busy: '项目正在导出或暂无可导出产物，请稍后再试',
  export_upstream_failed: '同步导出依赖资源请求失败，请稍后再试',
  export_timeout: '同步导出超时，请稍后再试',
  builder_access_required: '请先通过 CMS handoff 重新进入 PageBuilder',
  builder_access_mismatch: '当前访问会话与目标工作区不匹配，请从 CMS 重新进入',
  builder_access_origin_forbidden: '当前请求来源不可信，请从 CMS 页面重新进入 PageBuilder',
  template_not_found: '模板不存在',
  template_import_invalid: '模板压缩包不合法，无法导入',
  template_size_limit: '模板压缩包超过大小限制',
  template_import_forbidden: '模板压缩包包含不允许的内容',
  template_import_failed: '模板导入失败，请稍后再试',
  template_operation_forbidden: '模板操作被拒绝',
  template_operation_failed: '模板操作失败，请稍后再试',
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

export function projectBusy(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('project_busy', 409, message)
}

export function cmsSyncExportUpstreamFailed(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('export_upstream_failed', 502, message)
}

export function cmsSyncExportTimeout(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('export_timeout', 504, message)
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

export function cmsTemplateNotFound(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('template_not_found', 404, message)
}

export function cmsTemplateImportInvalid(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('template_import_invalid', 400, message)
}

export function cmsTemplateSizeLimit(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('template_size_limit', 413, message)
}

export function cmsTemplateImportForbidden(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('template_import_forbidden', 403, message)
}

export function cmsTemplateImportFailed(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('template_import_failed', 500, message)
}

export function cmsTemplateOperationForbidden(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('template_operation_forbidden', 403, message)
}

export function cmsTemplateOperationFailed(message?: string): CmsIntegrationError {
  return new CmsIntegrationError('template_operation_failed', 500, message)
}
