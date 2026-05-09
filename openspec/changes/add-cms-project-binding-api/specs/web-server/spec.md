## ADDED Requirements

### Requirement: HTTP 服务必须提供 CMS integration 路由组
系统 SHALL 在 Bun HTTP 应用中注册 `/api/integrations/cms` 路由组，用于承载 CMS 集成模式状态和 CMS server-to-server 创建项目接口。

#### Scenario: 注册 CMS integration status 路由
- **WHEN** 客户端请求 `GET /api/integrations/cms/status`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS integration status 处理逻辑
- **AND** 未启用 CMS 集成模式时也 SHALL 返回 JSON 状态而不是 404

#### Scenario: 注册 CMS 创建项目路由
- **WHEN** CMS 请求 `POST /api/integrations/cms/projects`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS integration 创建项目处理逻辑
- **AND** 该路由 SHALL 使用 CMS integration 结构化错误响应

### Requirement: CMS integration 路由错误响应不得破坏既有 API 错误契约
系统 SHALL 仅对 CMS integration 路由返回 `{ code, error }` 结构化错误，其他既有 API 路由 SHALL 保持当前错误响应语义。

#### Scenario: CMS integration 业务错误返回 code 和 error
- **WHEN** `/api/integrations/cms/*` 路由抛出可预期 CMS integration 业务错误
- **THEN** HTTP 服务 SHALL 返回包含 `code` 和 `error` 的 JSON 响应

#### Scenario: 非 CMS integration API 保持原错误结构
- **WHEN** 现有非 CMS integration API 返回可预期 HTTP 错误
- **THEN** HTTP 服务 SHALL 继续保持既有错误响应结构
- **AND** 本 change SHALL NOT 要求所有 API 全局迁移到 `{ code, error }`
