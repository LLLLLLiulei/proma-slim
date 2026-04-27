## ADDED Requirements

### Requirement: CMS runtime SDK tools must return unified agent-actionable error guidance
系统 SHALL 在 `page-builder` 会话的 runtime CMS SDK tools 失败时，将底层 gateway、domain store、参数校验或未预期异常收敛为单条 plain-text 工具错误；该错误 MUST 同时包含失败原因摘要、下一步恢复方向与 agent 禁止执行的动作，并且 MUST NOT 依赖额外的建议字段、结构化 UI 元数据或暴露宿主凭据、内部路径、完整请求头等敏感信息。

#### Scenario: Upstream authentication or gateway failure returns safe recovery guidance
- **WHEN** `mcp__cms__list_catalogs`、`mcp__cms__list_contents`、`mcp__cms__decide_cms_binding` 或 `mcp__cms__apply_cms_binding` 因上游 CMS 认证失败、权限不足或网关异常而终止
- **THEN** 系统 SHALL 返回说明当前是 CMS 上游失败的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出应检查 CMS 配置或权限，或仅在瞬时网关失败时稍后重试
- **AND** 错误内容 SHALL 明确禁止 agent 伪造栏目、内容、`handoffId`、`decisionId` 或宣称本次 CMS 操作已经成功
- **AND** 错误内容 SHALL NOT 泄露密码、token、Cookie、完整请求头或宿主内部地址

#### Scenario: Tool input validation failure tells agent to fix the input before retrying
- **WHEN** 某个 CMS runtime SDK tool 因输入缺少必填字段、字段组合非法或 payload 不符合当前 contract 而被拒绝
- **THEN** 系统 SHALL 返回指出具体缺失或非法字段的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出应先修正 tool 参数或模板输入，再重新调用该 tool
- **AND** 错误内容 SHALL 明确禁止 agent 在不改动参数的情况下重复提交同一次调用

#### Scenario: Unclassified tool failure falls back to a guarded default message
- **WHEN** 某个未被分类的异常到达 CMS runtime SDK tool 边界
- **THEN** 系统 SHALL 返回统一兜底的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出当前 CMS 步骤未完成，需停止当前调用链并交由宿主侧进一步排查
- **AND** 错误内容 SHALL 明确禁止 agent 伪造缺失上下文、推断成功结果或继续执行依赖本次失败结果的后续 CMS tool
