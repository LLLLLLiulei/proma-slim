## ADDED Requirements

### Requirement: CMS 同步导出活动必须使项目不可获取新的编辑锁
系统 SHALL 在 CMS 同步导出活动期间把目标 page-builder workspace 视为 busy，并拒绝新的 edit lock acquire 请求，避免导出过程中项目文件继续被编辑。

#### Scenario: 同步导出期间获取编辑锁被拒绝
- **WHEN** 某个 page-builder workspace 正在执行 CMS 同步静态导出，且客户端请求获取该 workspace 的 edit lock
- **THEN** 系统 SHALL 拒绝获取编辑锁并返回冲突响应
- **AND** 系统 SHALL NOT 创建新的 edit lock
- **AND** 系统 SHALL 向调用方表达项目正在导出或暂不可编辑

#### Scenario: 同步导出活动进入项目编辑状态
- **WHEN** 某个 page-builder workspace 正在执行 CMS 同步静态导出，且系统查询该 workspace 的编辑可用状态
- **THEN** 系统 SHALL 将该项目报告为 locked
- **AND** locked reason SHALL 能区分导出活动与普通编辑锁或活跃 Agent

#### Scenario: 同步导出结束后项目可重新获取编辑锁
- **WHEN** 某个 page-builder workspace 的 CMS 同步导出完成或失败，并且该 workspace 没有有效 edit lock、活跃 Agent 或其他 busy 状态
- **THEN** 系统 SHALL 允许后续 edit lock acquire 按现有流程创建编辑锁
