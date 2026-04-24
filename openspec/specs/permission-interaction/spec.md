## Purpose
定义 Claude Code 触发权限确认与 AskUser 交互时，前后端如何协同等待并恢复执行。

## Requirements

### Requirement: 权限请求处理
系统 SHALL 在 Claude Code 请求执行敏感操作时，按会话所属工作区类型决定是否展示权限请求：普通工作区会话继续向用户展示权限请求并等待响应；带有 `page-builder` 标记的工作区会话对于除 `AskUserQuestion` 外的工具调用 SHALL 自动放行，不展示权限横幅。

#### Scenario: 普通工作区展示权限请求
- **WHEN** SDK 的 `canUseTool` 回调在普通工作区会话中触发
- **THEN** 系统 SHALL 在对话区域顶部展示权限请求横幅，包含工具名称、操作描述，提供"允许"和"拒绝"按钮

#### Scenario: Page-builder 工作区自动放行非 AskUser 工具
- **WHEN** SDK 的 `canUseTool` 回调在带有 `page-builder` 标记的工作区会话中触发，且工具名称不是 `AskUserQuestion`
- **THEN** 系统 SHALL 直接允许该工具继续执行，而不展示权限请求横幅

#### Scenario: 用户允许普通工作区权限请求
- **WHEN** 用户点击普通工作区权限横幅中的"允许"按钮
- **THEN** 系统 SHALL 通过 REST API 通知后端 resolve 权限 Promise，SDK 继续执行该工具

#### Scenario: 用户拒绝普通工作区权限请求
- **WHEN** 用户点击普通工作区权限横幅中的"拒绝"按钮
- **THEN** 系统 SHALL 通知后端 reject 权限请求，SDK 跳过该工具并继续对话

#### Scenario: 普通工作区权限请求排队
- **WHEN** 多个普通工作区权限请求同时到达
- **THEN** 系统 SHALL 按顺序排队展示，处理完一个后展示下一个

### Requirement: AskUser 交互
系统 SHALL 在 Claude Code 需要用户输入时，展示问答界面并等待用户回复；该行为 MUST 在 `page-builder` 工作区会话中继续保留，不能因为自动放行其他工具而被绕过。

#### Scenario: 展示 AskUser 请求
- **WHEN** SDK 发出 ask_user_request 事件
- **THEN** 系统 SHALL 在对话区域展示问题内容和文本输入框

#### Scenario: 用户回复
- **WHEN** 用户在 AskUser 输入框中提交回复
- **THEN** 系统 SHALL 通过 REST API 将回复发送到后端，resolve AskUser Promise，SDK 继续执行

#### Scenario: Page-builder 工作区仍触发 AskUser 交互
- **WHEN** Claude Code 在带有 `page-builder` 标记的工作区会话中调用 `AskUserQuestion`
- **THEN** 系统 SHALL 继续发送 `ask_user_request` 到前端并等待用户回复，而不是自动放行或跳过该提问

### Requirement: 权限请求异步等待
后端 SHALL 在权限/AskUser 请求期间 hold 住 SDK 的 Promise，直到前端响应。

#### Scenario: SSE + REST 双向通信
- **WHEN** SDK 触发权限请求
- **THEN** 后端 SHALL 创建 Promise 并通过 SSE 推送请求到前端，同时暴露 REST 端点接收前端响应，收到响应后 resolve Promise

#### Scenario: 权限请求超时
- **WHEN** 权限请求推送到前端后超过 5 分钟未收到响应
- **THEN** 后端 SHALL 自动拒绝该权限请求，resolve Promise 为 deny，前端移除对应横幅

### Requirement: 权限横幅工具名称必须与工具活动列表共用前端本地化映射
系统 SHALL 在普通工作区的权限请求横幅中，使用与对话页工具活动列表一致的前端工具名称映射来展示工具名称；对于已知常见工具和第一方 MCP 工具 SHALL 显示中文名称，未命中映射时 SHALL 直接显示原名称。

#### Scenario: 已知工具在权限横幅中显示中文
- **WHEN** 普通工作区会话收到一个命中前端工具名称映射的权限请求
- **THEN** 系统 SHALL 在权限横幅中显示该工具的中文名称
- **AND** 该名称 SHALL 与同一工具在对话页工具活动列表中的显示名称保持一致

#### Scenario: 第一方 MCP 工具在权限横幅中显示中文
- **WHEN** 普通工作区会话收到一个命中第一方 MCP 工具名称映射的权限请求
- **THEN** 系统 SHALL 在权限横幅中显示该 MCP 工具的中文名称
- **AND** 该名称 SHALL 与同一 MCP 工具在对话页工具活动列表中的显示名称保持一致

#### Scenario: 未命中映射的权限工具名保持原样
- **WHEN** 普通工作区会话收到一个未命中中文映射的权限请求工具名或 MCP 工具名
- **THEN** 系统 SHALL 在权限横幅中直接显示原工具名称
- **AND** 系统 SHALL NOT 生成“未知工具”或其他兜底文案

#### Scenario: Page-builder 自动放行行为不因本地化改变
- **WHEN** 带有 `page-builder` 标记的工作区会话触发一个非 `AskUserQuestion` 工具请求
- **THEN** 系统 SHALL 继续直接允许该工具执行而不展示权限横幅
- **AND** 工具名称本地化规则 SHALL NOT 改变该自动放行行为
