## ADDED Requirements

### Requirement: CMS 上游调用必须记录详细诊断日志
系统 SHALL 为 PageBuilder 发起的每次 CMS 上游请求记录详细诊断日志，覆盖 CMS 登录态校验、token 获取、CMS JSON API 读取和 CMS 资源代理请求。

#### Scenario: 记录 CMS 登录态校验请求
- **WHEN** 系统调用 `{AI_PAGE_BUILDER_CMS_BASE_URL}/ui/login` 校验 CMS 登录态
- **THEN** 系统 SHALL 记录本次请求的 API 地址、HTTP 方法、请求头、请求参数、响应状态、响应头、响应体、耗时和异常信息
- **AND** 日志 SHALL 标识该请求的 operation 为 CMS login validation

#### Scenario: 记录 CMS token 获取请求
- **WHEN** 系统调用 `{CMS baseUrl}/api/token` 获取旧 slim API token
- **THEN** 系统 SHALL 记录本次请求的 API 地址、HTTP 方法、请求头、请求体、响应状态、响应头、响应体、耗时和异常信息
- **AND** 日志 SHALL 标识该请求的 operation 为 CMS token refresh

#### Scenario: 记录 CMS JSON API 读取请求
- **WHEN** 系统调用 CMS `/api/sites`、`/api/catalogsTree`、`/api/catalogs` 或 `/api/catalogs/:catalogId/contents`
- **THEN** 系统 SHALL 记录本次请求的 API 地址、HTTP 方法、query 参数、请求头、响应状态、响应头、响应体、耗时和异常信息
- **AND** 日志 SHALL 标识该请求的 operation 为 CMS data request

#### Scenario: 记录 CMS 资源请求
- **WHEN** 系统代理或导出 CMS 图片、字体、脚本、样式或其他资源 URL
- **THEN** 系统 SHALL 记录本次资源请求的 URL、HTTP 方法、请求头、响应状态、响应头、content-type、content-length、耗时和异常信息
- **AND** 当资源请求失败且响应体可作为文本读取时，系统 SHALL 记录 CMS 返回的错误响应体

### Requirement: CMS 上游诊断日志不得脱敏 CMS 请求和响应字段
系统 SHALL 在 CMS 上游诊断日志中原样记录 CMS 请求和响应字段，不对 CMS Cookie、Authorization、Set-Cookie、username、password、token 或 access_token 做敏感字段脱敏。

#### Scenario: 诊断日志保留 CMS 请求头原值
- **WHEN** CMS 上游请求包含 `Cookie`、`Authorization` 或其他鉴权请求头
- **THEN** CMS 上游诊断日志 SHALL 记录这些请求头的原始值
- **AND** 系统 SHALL NOT 将这些值替换为 `[REDACTED]`、`[configured]` 或其他脱敏占位符

#### Scenario: 诊断日志保留 CMS 请求体和响应体原值
- **WHEN** CMS 上游请求体或响应体包含账号、密码、token、Cookie 或其他敏感字段
- **THEN** CMS 上游诊断日志 SHALL 记录这些字段的原始值
- **AND** 系统 SHALL NOT 对 CMS 上游诊断日志中的这些字段做敏感字段替换

### Requirement: CMS 上游失败必须返回可诊断错误详情
系统 SHALL 在 CMS 上游调用失败时构造包含 HTTP 状态码、CMS 接口路径或 URL、CMS 原始错误信息或响应体摘要的错误消息，而不是只返回固定鉴权失败文案。

#### Scenario: CMS API 返回 HTTP 鉴权失败
- **WHEN** CMS `/api/*` 请求返回 HTTP 401 或 HTTP 403
- **THEN** 系统 SHALL 将失败分类为 CMS 鉴权或权限错误
- **AND** 错误消息 SHALL 包含 HTTP 状态码、请求路径和 CMS 返回的错误信息或响应体摘要
- **AND** 错误消息 SHALL NOT 只包含“CMS 鉴权失败，请检查宿主配置中的账号密码是否正确”

#### Scenario: CMS API 返回业务失败状态
- **WHEN** CMS `/api/*` 请求返回 HTTP 200 但响应体中的 `status` 表示失败
- **THEN** 系统 SHALL 将失败分类为 CMS 上游业务失败
- **AND** 错误消息 SHALL 包含请求路径、CMS `message`、`msg`、`error` 或原始响应体摘要

#### Scenario: CMS 网络请求失败
- **WHEN** 系统无法连接 CMS、请求超时或 fetch 抛出异常
- **THEN** 系统 SHALL 将底层异常 message 写入 CMS 上游诊断日志
- **AND** 对外错误消息 SHALL 包含 CMS 请求失败摘要和底层异常 message

### Requirement: CMS token 失效时必须清理缓存并重试一次
系统 SHALL 在旧 CMS API 请求遇到明确 token 失效或鉴权失败时清理进程内缓存 token，并使用新 token 对原请求自动重试一次。

#### Scenario: 缓存 token 收到 401 后自动重试
- **WHEN** CMS JSON API 请求使用缓存 token 返回 HTTP 401 或 HTTP 403
- **THEN** 系统 SHALL 清理当前缓存 token
- **AND** 系统 SHALL 重新调用 `/api/token` 获取 token
- **AND** 系统 SHALL 使用新 token 重试原 CMS JSON API 请求一次

#### Scenario: 重试仍失败时返回第二次失败详情
- **WHEN** CMS JSON API 在 token 清理并重试后仍然返回鉴权失败或其他上游失败
- **THEN** 系统 SHALL 停止继续重试
- **AND** 错误消息 SHALL 包含重试后 CMS 返回的 HTTP 状态码和错误响应摘要

### Requirement: CMS 数据读取请求必须保持实时语义
系统 SHALL 对 CMS 站点、栏目、内容等数据读取请求使用实时读取语义，避免浏览器、服务端或中间层缓存导致读取旧数据。

#### Scenario: CMS JSON API 请求携带 no-cache 请求头
- **WHEN** 系统请求 CMS `/api/sites`、`/api/catalogsTree`、`/api/catalogs` 或 `/api/catalogs/:catalogId/contents`
- **THEN** 上游请求头 SHALL 包含 `Cache-Control: no-cache`
- **AND** 上游请求头 SHALL 包含 `Pragma: no-cache`

#### Scenario: CMS runtime 导出只复用任务内查询
- **WHEN** 静态导出或另存模板过程中多个 CMS islands 触发等价查询
- **THEN** 系统 MAY 在当前导出任务内复用查询结果
- **AND** 系统 SHALL NOT 跨不同导出任务或不同 HTTP 请求复用 CMS 列表、栏目或内容结果
