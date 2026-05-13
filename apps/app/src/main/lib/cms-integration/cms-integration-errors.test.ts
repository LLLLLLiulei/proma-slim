import { describe, expect, test } from 'bun:test'
import {
  builderAccessMismatch,
  builderAccessRequired,
  cmsProjectNotFound,
  handoffExpired,
  invalidCmsRequest,
  previewNotReady,
  toCmsIntegrationErrorResponse,
} from './cms-integration-errors'

describe('cms integration errors', () => {
  test('exports new structured error factories with the expected status codes', () => {
    expect(cmsProjectNotFound()).toMatchObject({
      code: 'project_not_found',
      status: 404,
      message: 'CMS 项目不存在',
    })
    expect(handoffExpired()).toMatchObject({
      code: 'handoff_expired',
      status: 410,
      message: 'CMS handoff 已失效，请重新从 CMS 进入',
    })
    expect(previewNotReady()).toMatchObject({
      code: 'preview_not_ready',
      status: 409,
      message: '当前项目尚未生成可预览内容，请先完成预览构建',
    })
    expect(builderAccessRequired()).toMatchObject({
      code: 'builder_access_required',
      status: 401,
      message: '请先通过 CMS handoff 重新进入 PageBuilder',
    })
    expect(builderAccessMismatch()).toMatchObject({
      code: 'builder_access_mismatch',
      status: 403,
      message: '当前访问会话与目标工作区不匹配，请从 CMS 重新进入',
    })
  })

  test('serializes error responses with code and error fields', async () => {
    const response = toCmsIntegrationErrorResponse(invalidCmsRequest('参数不合法'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: 'invalid_request',
      error: '参数不合法',
    })
  })
})
