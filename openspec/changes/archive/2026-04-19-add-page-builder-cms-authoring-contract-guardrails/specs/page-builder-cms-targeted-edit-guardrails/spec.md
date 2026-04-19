## ADDED Requirements

### Requirement: 普通 CMS 编辑链路必须把 turn 级回滚和 preview 安全协同起来
系统 SHALL 在普通 Agent 编辑链路修改已有 `cms-catalog` / `cms-content` 时，将 turn 级回滚 guardrail 与 preview 安全策略协同工作；当本轮写入导致 CMS 作者态失效时，系统 MUST 在回合结束后恢复到执行前的安全版本，并 SHALL 避免让无效中间状态长期停留为最终可见预览。

#### Scenario: 普通编辑回合失败后恢复执行前安全版本
- **WHEN** 一次普通 Agent 编辑回合在 `workspace-files/index.html` 中写入了阻断性的 CMS authoring 错误
- **THEN** 系统 SHALL 在该回合结束后恢复到执行前的安全版本
- **AND** 系统 SHALL 向会话追加结构化失败状态

#### Scenario: 回滚前的临时无效状态不应长期停留为最终预览
- **WHEN** 普通 Agent 编辑链路在一次回合中途短暂写入了无效 CMS 作者态
- **THEN** preview 与 turn 级 guardrail SHALL 协同避免该中间状态长期停留为用户最终看到的预览结果
- **AND** 系统 SHALL NOT 将该中间状态视为新的安全作者态基线
