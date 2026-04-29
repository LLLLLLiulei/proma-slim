## MODIFIED Requirements

### Requirement: 历史卡片悬浮时必须提供预览、编辑、删除操作
系统 SHALL 在用户悬浮历史项目卡片时显示交互蒙层，并提供 `预览`、`编辑`、`删除` 三个操作按钮；当项目当前被编辑锁或活跃 Agent 运行占用时，系统 SHALL 保持预览或查看入口可用，SHALL 允许用户进入 builder 由 builder 展示锁冲突反馈，并 SHALL 禁用删除入口以避免删除正在编辑或构建的项目。

#### Scenario: 悬浮可编辑卡片时显示三项操作
- **WHEN** 用户将鼠标悬浮到某个未被锁定的历史项目卡片上
- **THEN** 系统 SHALL 显示交互蒙层
- **AND** 系统 SHALL 显示 `预览`、`编辑`、`删除` 三个操作按钮

#### Scenario: 锁定项目展示忙碌状态并禁止删除
- **WHEN** 用户查看某个正在被编辑锁或活跃 Agent 运行占用的历史项目卡片
- **THEN** 系统 SHALL 显示项目正在编辑或构建中的状态
- **AND** 系统 SHALL 禁止用户从该卡片删除项目
- **AND** 系统 SHALL 保持 `编辑` 入口可用，使用户进入 builder 后看到统一的锁冲突反馈

#### Scenario: 预览操作打开当前项目预览
- **WHEN** 用户点击某个历史项目卡片上的 `预览` 或 `查看` 按钮
- **THEN** 系统 SHALL 打开该项目当前最新的预览入口

#### Scenario: 锁定项目没有预览时显示不可查看提示
- **WHEN** 某个历史项目被锁定且当前不存在可用预览入口
- **THEN** 系统 SHALL 告知用户该项目正在编辑或构建中且暂无可查看预览

### Requirement: 编辑操作必须恢复或补建可编辑会话
系统 SHALL 在用户点击历史项目卡片的 `编辑` 按钮时进入该项目的 builder 页面，并由 builder 页面负责取得编辑锁和展示锁冲突反馈；若该工作区下已经存在会话，则优先恢复最近一次会话，若该工作区当前没有可用会话，则 SHALL 自动创建一个新会话后再进入 builder。

#### Scenario: 工作区存在会话时恢复最近一次编辑
- **WHEN** 用户点击某个已有会话的历史项目卡片上的 `编辑` 按钮
- **THEN** 系统 SHALL 进入该工作区最近一次会话对应的 builder 页面
- **AND** builder 页面 SHALL 负责取得或拒绝 page-builder 编辑锁

#### Scenario: 工作区缺少会话时自动补建新会话
- **WHEN** 用户点击某个当前没有可用会话的历史项目卡片上的 `编辑` 按钮
- **THEN** 系统 SHALL 先为该工作区创建一个新会话
- **AND** 系统 SHALL 再进入该新会话对应的 builder 页面
- **AND** builder 页面 SHALL 负责取得或拒绝 page-builder 编辑锁

#### Scenario: 补建会话失败时不占用编辑锁
- **WHEN** 系统补建或解析 builder 会话失败
- **THEN** 系统 SHALL NOT 从首页流程占用项目编辑权
- **AND** 系统 SHALL 向用户展示进入 builder 失败的反馈

#### Scenario: Builder 获取锁失败时展示冲突反馈
- **WHEN** 用户从历史项目卡片进入 builder，但 builder 页面无法取得 page-builder 编辑锁
- **THEN** builder 页面 SHALL NOT 启用编辑能力
- **AND** builder 页面 SHALL 提示该项目正在被其他页面编辑或构建
- **AND** builder 页面 SHALL 提供返回首页或查看预览的操作

### Requirement: 删除操作必须删除整个 page-builder 项目
系统 SHALL 在用户确认删除某个未被锁定的历史项目后，级联删除该 `page-builder` 工作区、其下所有会话，以及该工作区中的 `workspace-files` 预览产物；该删除行为 MUST 仅适用于 `page-builder` 项目，而不改变普通工作区原有删除语义。当项目存在有效编辑锁或活跃 Agent 运行时，系统 SHALL 禁止删除该项目。

#### Scenario: 删除前要求用户确认
- **WHEN** 用户点击某个未被锁定的历史项目卡片上的 `删除` 按钮
- **THEN** 系统 SHALL 先要求用户确认删除该项目

#### Scenario: 确认删除后级联清理整个项目
- **WHEN** 用户确认删除某个未被锁定的历史项目
- **THEN** 系统 SHALL 删除该工作区下的所有会话
- **AND** 系统 SHALL 删除该工作区的 `workspace-files` 预览产物
- **AND** 系统 SHALL 删除该工作区本身

#### Scenario: 删除后历史区移除该项目卡片
- **WHEN** 某个历史项目被成功删除
- **THEN** 首页历史区 SHALL 不再展示该项目卡片

#### Scenario: 锁定项目禁止删除
- **WHEN** 某个历史项目存在有效编辑锁或活跃 Agent 运行
- **THEN** 系统 SHALL 禁止删除该项目
- **AND** 系统 SHALL 保留该项目的历史卡片

#### Scenario: 普通工作区删除语义保持不变
- **WHEN** 系统处理非 `page-builder` 工作区的删除请求
- **THEN** 系统 SHALL 继续遵循普通工作区现有删除规则
- **AND** 系统 SHALL NOT 因首页历史项目删除能力而自动把普通工作区删除升级为级联删除
