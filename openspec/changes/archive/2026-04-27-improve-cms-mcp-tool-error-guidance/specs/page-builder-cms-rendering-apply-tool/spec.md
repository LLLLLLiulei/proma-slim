## ADDED Requirements

### Requirement: `apply_cms_binding` failures must differentiate retry, re-decide, and re-handoff recovery paths
系统 SHALL 在 `mcp__cms__apply_cms_binding` 因 `decisionId` 失效、作者态 revision 不可读、模板 contract / preflight 校验失败、结构护栏冲突或上游 CMS 写入失败而终止时，向 agent 返回单条 plain-text 工具错误；该错误 MUST 说明本次 apply 失败属于哪类恢复路径，并明确 agent 下一步应重试、重做 decision、重建 handoff、修正模板，还是终止当前 CMS 路径。

#### Scenario: Invalid or consumed decision tells the agent to rebuild decision context
- **WHEN** `mcp__cms__apply_cms_binding` 收到的 `decisionId` 不存在、已消费、已失效或与当前作者态上下文冲突
- **THEN** 系统 SHALL 返回指出当前 `decisionId` 不可继续用于正式 apply 的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出 agent 必须基于当前仍有效的 handoff 或重新创建的 handoff 重新执行 `mcp__cms__decide_cms_binding`
- **AND** 错误内容 SHALL 明确禁止 agent 重复使用同一个失效 `decisionId`，或在未重新获取有效 decision 的情况下继续调用 `mcp__cms__apply_cms_binding`
- **AND** 错误内容 SHALL NOT 将本次写入表述为已成功或部分成功

#### Scenario: Missing authoring revision tells the agent to refresh authoring state instead of guessing
- **WHEN** `mcp__cms__apply_cms_binding` 无法读取当前正式 apply 所需的 authoring revision、preview revision 或等价作者态上下文
- **THEN** 系统 SHALL 返回指出当前页面状态尚不可用于正式 CMS apply 的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出 agent 必须等待或重新获取最新作者态上下文，再重新走 handoff / decision / apply 链路
- **AND** 错误内容 SHALL 明确禁止 agent 猜测 revision、沿用未知新鲜度的旧上下文，或宣称当前页面已经完成 CMS 绑定

#### Scenario: Template or upstream apply failure tells the agent whether to fix input or stop on host-side issues
- **WHEN** `mcp__cms__apply_cms_binding` 因模板 contract / preflight 校验失败、结构护栏冲突、上游 CMS 鉴权失败或网关异常而终止
- **THEN** 系统 SHALL 返回指出失败属于“修正模板后重试”或“检查上游 CMS 后再试”的 plain-text 工具错误
- **AND** 当失败原因是模板或结构问题时，错误内容 SHALL 指出应修改对应模板字段或收缩模板结构后重试
- **AND** 当失败原因是上游 CMS 失败时，错误内容 SHALL 指出仅在上游恢复后再试，或先检查 CMS 配置与权限
- **AND** 错误内容 SHALL 明确禁止 agent 伪造成功结果、跳过校验强行继续，或基于失败结果继续生成依赖本次 apply 成功的后续操作
