## ADDED Requirements

### Requirement: CMS 登录态校验失败必须保留上游响应详情
系统 SHALL 在 CMS 集成接口调用 CMS `/ui/login` 校验登录态失败时，保留并返回可诊断的上游失败摘要。

#### Scenario: CMS 登录请求被上游拒绝时返回状态和错误摘要
- **WHEN** CMS `/ui/login` 返回 HTTP 401 或 HTTP 403
- **THEN** PageBuilder SHALL 返回结构化 `cms_login_expired` 错误
- **AND** 响应 `error` SHALL 包含上游 HTTP 状态码和 CMS 返回的错误信息或响应体摘要

#### Scenario: CMS 登录接口不可用时返回状态和错误摘要
- **WHEN** CMS `/ui/login` 返回 HTTP 500、HTTP 502、其他非 2xx 响应、非 JSON 或缺少必要结构
- **THEN** PageBuilder SHALL 返回结构化 `cms_login_unavailable` 错误
- **AND** 响应 `error` SHALL 包含上游 HTTP 状态码、解析失败原因或 CMS 响应体摘要

#### Scenario: CMS 登录网络异常时返回异常摘要
- **WHEN** PageBuilder 调用 CMS `/ui/login` 时发生网络异常或 fetch 抛错
- **THEN** PageBuilder SHALL 返回结构化 `cms_login_unavailable` 错误
- **AND** 响应 `error` SHALL 包含底层异常 message 摘要

### Requirement: CMS 同步导出失败必须保留底层 CMS 上游错误详情
系统 SHALL 在 CMS 同步导出过程中保留 CMS islands 预取、CMS 资源本地化或 CMS 数据读取失败的底层错误摘要，并通过结构化错误返回给 CMS 调用方。

#### Scenario: CMS 数据预取导致同步导出失败
- **WHEN** CMS 同步导出中的 CMS island 预取因 CMS 上游请求失败而终止
- **THEN** CMS 同步导出接口 SHALL 返回 `export_upstream_failed`
- **AND** 响应 `error` SHALL 包含底层 CMS HTTP 状态码、请求路径和 CMS 错误摘要

#### Scenario: CMS 资源下载失败导致同步导出失败
- **WHEN** CMS 同步导出下载 CMS 资源时收到 CMS HTTP 错误或 CMS 资源请求异常
- **THEN** CMS 同步导出接口 SHALL 返回 `export_upstream_failed`
- **AND** 响应 `error` SHALL 包含失败资源 URL、HTTP 状态码或底层异常摘要
