## ADDED Requirements

### Requirement: Builder 另存模板入口
系统 SHALL 在 PageBuilder Builder 页面提供当前项目“另存模板”入口。

#### Scenario: standalone Builder 显示另存入口
- **WHEN** 用户打开 standalone PageBuilder Builder 页面且页面加载完成
- **THEN** 系统 SHALL 在项目标题区域或相近操作区展示“另存模板”入口

#### Scenario: CMS 集成 Builder 显示另存入口
- **WHEN** 用户通过 CMS Builder Context 打开 PageBuilder Builder 页面且页面加载完成
- **THEN** 系统 SHALL 在项目标题区域或相近操作区展示“另存模板”入口

#### Scenario: 入口不影响标题编辑
- **WHEN** 用户在 Builder 页面使用项目标题编辑能力
- **THEN** 系统 SHALL 保持原有项目标题编辑、保存和取消行为可用
- **AND** 系统 SHALL NOT 因新增另存模板入口阻断标题文本截断展示

### Requirement: 另存模板入口可用性
系统 SHALL 根据当前 Builder 编辑状态控制另存模板入口可用性，避免在不可安全写入时提交另存请求。

#### Scenario: 持有编辑锁时允许打开表单
- **WHEN** 当前 PageBuilder Builder 持有有效编辑锁且 Agent 未处于写入中
- **THEN** 用户点击“另存模板”入口 SHALL 打开另存模板表单

#### Scenario: 编辑锁失效时阻止打开或提交
- **WHEN** 当前 PageBuilder Builder 的编辑锁缺失、失效或已被标记为丢失
- **THEN** 系统 SHALL 禁用另存模板入口或在用户触发时展示现有编辑锁失效提示
- **AND** 系统 SHALL NOT 发送另存模板请求

#### Scenario: Agent 写入中阻止另存
- **WHEN** 当前 Agent 会话正在回复或写入页面
- **THEN** 系统 SHALL 禁用另存模板入口或在用户触发时提示当前项目正在生成中
- **AND** 系统 SHALL NOT 发送另存模板请求

### Requirement: 另存模板表单
系统 SHALL 提供另存模板表单，仅收集模板名称。

#### Scenario: 模板名称必填
- **WHEN** 另存模板表单中的模板名称为空或仅包含空白字符
- **THEN** 系统 SHALL 禁用提交或阻止提交
- **AND** 系统 SHALL NOT 发送另存模板请求

#### Scenario: 表单不要求模板描述或标签
- **WHEN** 用户打开另存模板表单
- **THEN** 系统 SHALL NOT 展示模板描述或模板标签输入控件
- **AND** 用户只需填写模板名称即可提交

#### Scenario: 合法名称提交
- **WHEN** 用户填写模板名称并提交另存模板表单
- **THEN** 系统 SHALL 允许提交
- **AND** 请求体 SHALL 只包含规范化后的模板名称

#### Scenario: 提交中禁用表单重复提交
- **WHEN** 另存模板请求正在提交中
- **THEN** 系统 SHALL 禁用提交按钮
- **AND** 系统 SHALL 阻止同一表单产生重复提交

### Requirement: CMS 固化提示
系统 SHALL 在 CMS 集成 Builder 的另存模板表单中展示 CMS 数据固化提示。

#### Scenario: CMS 集成 Builder 展示固化提示
- **WHEN** 当前 Builder 是通过 CMS Builder Context 成功加载的 CMS 集成 Builder
- **THEN** 另存模板表单 SHALL 提示当前 CMS 数据会被固化为静态模板
- **AND** 该提示 SHALL 说明模板不会保留 CMS 动态绑定或鉴权信息

#### Scenario: dev standalone CMS 模式不误提示
- **WHEN** CMS 功能处于 enabled 状态但当前 Builder 不是通过 CMS Builder Context 加载
- **THEN** 另存模板表单 SHALL NOT 将当前项目误提示为 CMS 集成来源

### Requirement: 另存模板 API 提交
系统 SHALL 通过 renderer API client 调用 workspace 维度的另存模板 API，并携带当前编辑锁凭证。

#### Scenario: 提交合法表单
- **WHEN** 用户在 Builder 页面提交合法另存模板表单
- **THEN** 系统 SHALL 调用 `POST /api/workspaces/:workspaceId/page-builder/templates`
- **AND** 请求体 SHALL 包含规范化后的模板名称

#### Scenario: 携带编辑锁凭证
- **WHEN** 用户提交另存模板表单且当前 Builder 持有编辑锁
- **THEN** 系统 SHALL 在请求中携带 `x-proma-page-builder-edit-lock` 和 `x-proma-page-builder-edit-holder`

#### Scenario: 不以前端预览状态作为最终拦截条件
- **WHEN** 当前 preview polling 尚未返回可预览状态但用户提交另存模板表单
- **THEN** 系统 SHALL 允许请求发送到后端进行权威校验
- **AND** 系统 SHALL 使用后端返回的错误或成功结果作为用户反馈

### Requirement: 另存模板结果反馈
系统 SHALL 为另存模板流程提供明确的成功、失败和编辑锁失效反馈。

#### Scenario: 保存成功
- **WHEN** 另存模板 API 返回成功结果
- **THEN** 系统 SHALL 关闭另存模板表单
- **AND** 系统 SHALL 显示成功提示，说明模板可在首页模板库查看

#### Scenario: 保存失败
- **WHEN** 另存模板 API 返回非编辑锁类错误
- **THEN** 系统 SHALL 在表单错误区或 toast 中展示后端返回的可读错误
- **AND** 系统 SHALL 保持用户可以修正表单或重试

#### Scenario: 编辑锁写入拒绝
- **WHEN** 另存模板 API 返回现有 PageBuilder 编辑锁拒绝错误
- **THEN** 系统 SHALL 复用 Builder 页面现有编辑锁失效处理
- **AND** 系统 SHALL 阻止继续编辑和继续提交另存模板请求

#### Scenario: 不刷新首页模板库
- **WHEN** 另存模板 API 返回成功结果
- **THEN** 系统 SHALL NOT 自动跳转首页或刷新首页模板库
- **AND** 系统 SHALL 仅在当前 Builder 页面给出成功提示
