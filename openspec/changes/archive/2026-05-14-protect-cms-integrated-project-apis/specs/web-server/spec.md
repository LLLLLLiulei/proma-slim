## MODIFIED Requirements

### Requirement: CMS integration 路由错误响应不得破坏既有 API 错误契约
系统 SHALL 对可预期 CMS integration 业务错误返回 `{ code, error }` 结构化错误；非 CMS integration 普通 HTTP 错误 SHALL 保持当前错误响应语义，但 CMS 集成模式下由 Builder Access Session 保护触发的项目 API 访问错误也 SHALL 使用 `{ code, error }`。

#### Scenario: CMS integration 业务错误返回 code 和 error
- **WHEN** `/api/integrations/cms/*` 路由抛出可预期 CMS integration 业务错误
- **THEN** HTTP 服务 SHALL 返回包含 `code` 和 `error` 的 JSON 响应

#### Scenario: CMS 模式受保护项目 API 访问错误返回 code 和 error
- **WHEN** `/api/sessions`、`/api/sessions/*`、`/api/workspaces`、`/api/workspaces/*` 或 `/api/page-builder/*` 在 CMS 集成模式下因 Builder Access Session 缺失、无效、过期、workspace/session mismatch、来源校验失败或 CMS 模式 fail closed 规则而拒绝请求
- **THEN** HTTP 服务 SHALL 返回包含 `code` 和 `error` 的 JSON 响应
- **AND** `code` SHALL 使用 CMS integration 标准错误码

#### Scenario: CMS 来源校验失败返回专用错误码
- **WHEN** CMS 集成模式下受保护项目 API 因 `Origin` 或 `Referer` 缺失、不合法或不匹配 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 而拒绝请求
- **THEN** HTTP 服务 SHALL 返回包含 `code` 和 `error` 的 JSON 响应
- **AND** `code` SHALL 为 `builder_access_origin_forbidden`

#### Scenario: 非 CMS integration 普通 API 保持原错误结构
- **WHEN** 现有非 CMS integration API 返回可预期普通 HTTP 错误，且该错误不是 CMS Builder Access Session 保护错误
- **THEN** HTTP 服务 SHALL 继续保持既有错误响应结构
- **AND** 本 change SHALL NOT 要求所有 API 全局迁移到 `{ code, error }`
