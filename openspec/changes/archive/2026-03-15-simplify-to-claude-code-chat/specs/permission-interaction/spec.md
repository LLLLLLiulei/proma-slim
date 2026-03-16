## ADDED Requirements

### Requirement: 权限请求处理
系统 SHALL 在 Claude Code 请求执行敏感操作时，向用户展示权限请求并等待响应。

#### Scenario: 展示权限请求
- **WHEN** SDK 的 canUseTool 回调触发
- **THEN** 系统 SHALL 在对话区域顶部展示权限请求横幅，包含工具名称、操作描述，提供"允许"和"拒绝"按钮

#### Scenario: 用户允许
- **WHEN** 用户点击"允许"按钮
- **THEN** 系统 SHALL 通过 REST API 通知后端 resolve 权限 Promise，SDK 继续执行该工具

#### Scenario: 用户拒绝
- **WHEN** 用户点击"拒绝"按钮
- **THEN** 系统 SHALL 通知后端 reject 权限请求，SDK 跳过该工具并继续对话

#### Scenario: 权限请求排队
- **WHEN** 多个权限请求同时到达
- **THEN** 系统 SHALL 按顺序排队展示，处理完一个后展示下一个

### Requirement: AskUser 交互
系统 SHALL 在 Claude Code 需要用户输入时，展示问答界面并等待用户回复。

#### Scenario: 展示 AskUser 请求
- **WHEN** SDK 发出 ask_user_request 事件
- **THEN** 系统 SHALL 在对话区域展示问题内容和文本输入框

#### Scenario: 用户回复
- **WHEN** 用户在 AskUser 输入框中提交回复
- **THEN** 系统 SHALL 通过 REST API 将回复发送到后端，resolve AskUser Promise，SDK 继续执行

### Requirement: 权限请求异步等待
后端 SHALL 在权限/AskUser 请求期间 hold 住 SDK 的 Promise，直到前端响应。

#### Scenario: SSE + REST 双向通信
- **WHEN** SDK 触发权限请求
- **THEN** 后端 SHALL 创建 Promise 并通过 SSE 推送请求到前端，同时暴露 REST 端点接收前端响应，收到响应后 resolve Promise

#### Scenario: 权限请求超时
- **WHEN** 权限请求推送到前端后超过 5 分钟未收到响应
- **THEN** 后端 SHALL 自动拒绝该权限请求，resolve Promise 为 deny，前端移除对应横幅
