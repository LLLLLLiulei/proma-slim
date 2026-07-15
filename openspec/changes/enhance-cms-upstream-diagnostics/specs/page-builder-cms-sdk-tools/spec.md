## ADDED Requirements

### Requirement: CMS SDK tools 上游失败必须包含 CMS 错误详情
系统 SHALL 在 Agent CMS SDK tools 因 CMS 上游请求失败而终止时，将底层 CMS HTTP 状态、请求路径和 CMS 原始错误摘要合并到 plain-text 工具错误中。

#### Scenario: list_catalogs 鉴权失败返回上游状态
- **WHEN** `mcp__cms__list_catalogs` 调用 CMS 上游接口时收到 HTTP 401、HTTP 403 或 CMS 业务鉴权失败
- **THEN** 工具错误 SHALL 指出当前是 CMS 上游鉴权或权限检查失败
- **AND** 工具错误 SHALL 包含 CMS HTTP 状态码、请求路径和 CMS 错误摘要
- **AND** 工具错误 SHALL 明确禁止 agent 伪造栏目或宣称本次 CMS 操作已经成功

#### Scenario: list_contents 上游失败返回原始错误摘要
- **WHEN** `mcp__cms__list_contents` 调用 CMS 上游接口时收到非 2xx、CMS 业务失败或网络异常
- **THEN** 工具错误 SHALL 包含 CMS 请求失败类型、请求路径、HTTP 状态码或底层异常 message
- **AND** 工具错误 SHALL 指示 agent 停止依赖本次失败结果继续执行后续 CMS tool

#### Scenario: decision 或 apply 链路保留底层 CMS gateway 错误
- **WHEN** `mcp__cms__decide_cms_binding` 或 `mcp__cms__apply_cms_binding` 依赖的 CMS gateway 调用失败
- **THEN** 工具错误 SHALL 保留底层 CMS gateway error message 中的上游状态和 CMS 错误摘要
- **AND** 工具错误 SHALL 继续包含恢复方向和禁止伪造上下文的约束
