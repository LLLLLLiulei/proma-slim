## MODIFIED Requirements

### Requirement: Builder 页面必须提供紧凑双栏工作台
系统 SHALL 为 `page-builder` 提供紧凑型 builder 工作台，左侧为网页预览区域，右侧为项目对话区域，并保持与现有对话框视觉语言一致的紧凑密度；其中左侧预览面板除了现有预览控制项外，还必须承载项目级设备模式切换入口、离线静态包导出入口、CMS 远程资源导出选项与相应状态反馈。

#### Scenario: 进入 builder 时展示左预览右对话布局
- **WHEN** 用户进入某个项目对应的 builder 页面
- **THEN** 系统 SHALL 展示左侧预览面板和右侧对话面板的双栏布局，而不是展示 `apps/app` 的侧边栏与页签式工作台

#### Scenario: Builder 页面进入时处理编辑锁上下文
- **WHEN** 用户进入某个项目对应的 builder 页面，且该页面不属于可恢复的 active Agent session
- **THEN** 系统 SHALL 优先复用已有锁上下文或直接获取新的编辑锁
- **AND** 系统 SHALL 在恢复 stored lock 时使用原有 `lockId` 与 `holderId` 续约
- **AND** 系统 SHALL 在锁失效或被真正的其他编辑者拒绝时禁用编辑能力并提示用户重新进入

#### Scenario: Builder 页面重新进入同一 active session 时恢复执行态
- **WHEN** 用户进入某个 builder URL，且该 URL 的 workspaceId 与 sessionId 对应仍在执行的 active Agent session，并且没有其他 session 持有该 workspace 的有效编辑锁
- **THEN** 系统 SHALL 恢复该 active Agent session 的 builder 页面
- **AND** 系统 SHALL 继续展示消息历史、流式状态和现有停止 Agent 操作
- **AND** 系统 SHALL NOT 将该场景渲染为普通锁冲突或“正在构建中”的硬失败

#### Scenario: Builder 页面命中非 active session 时切换到 active session
- **WHEN** 用户进入某个 builder URL，但该 URL 的 sessionId 不是当前 workspace 下正在执行的 active Agent session，且该 workspace 存在另一个 active Agent session
- **THEN** 系统 SHALL 自动切换到该 active Agent session 对应的 builder URL
- **AND** 系统 SHALL 恢复该 active Agent session 的执行态

#### Scenario: 关闭 Builder 页面不停止后台 Agent
- **WHEN** 用户关闭或刷新 Builder 页面，且该页面的 Agent 会话仍在执行
- **THEN** 系统 SHALL NOT 因页面关闭自动停止该 Agent 会话
- **AND** 后续重新进入 SHALL 按 active session 恢复规则处理

#### Scenario: 预览面板保持精简项目控制项
- **WHEN** builder 页面渲染左侧预览面板
- **THEN** 系统 SHALL 提供 iframe 预览容器，以及 `PC / Mobile` 设备切换入口、“刷新预览”“全屏预览”“新窗口打开预览”“导出静态包”五类项目级操作入口
- **AND** 系统 SHALL 将设备切换入口放置在预览头部中，不继续展示独立的“实时预览”文字标题

#### Scenario: 点击导出静态包时展示 CMS 远程资源选项
- **WHEN** 用户在 Builder 左侧预览面板点击“导出静态包”
- **THEN** 系统 SHALL 在创建导出任务前展示确认弹框
- **AND** 弹框 SHALL 提供“导出 CMS 远程资源”勾选项
- **AND** 该选项 SHALL 默认勾选
- **AND** 系统 SHALL 仅在用户确认导出后创建静态导出任务

#### Scenario: 未勾选 CMS 远程资源导出时按当次选择创建任务
- **WHEN** 用户在导出确认弹框中取消勾选“导出 CMS 远程资源”并确认导出
- **THEN** 系统 SHALL 创建一个携带“不下载 CMS 远程资源”选项的静态导出任务
- **AND** 系统 SHALL 不把该选择持久化为后续导出的默认值

#### Scenario: 导出任务进行中时预览面板反馈状态
- **WHEN** 用户已经在当前 Builder 页面触发 `导出静态包`，且该项目的导出任务仍在进行中
- **THEN** 系统 SHALL 在左侧预览面板中反馈当前导出中的状态
- **AND** 系统 SHALL 防止用户在同一项目上重复触发并发导出

#### Scenario: 导出完成后在 Builder 内反馈下载结果与告警
- **WHEN** 当前项目的导出任务完成
- **THEN** 系统 SHALL 在当前 Builder 工作台中反馈导出结果并允许用户下载静态包
- **AND** 系统 SHALL 在存在离线完整性告警时明确提示该导出包附带导出报告

#### Scenario: 右侧对话区承载项目迭代
- **WHEN** builder 页面渲染右侧对话区
- **THEN** 系统 SHALL 提供与现有 Agent 对话能力一致的消息列表、输入框和流式会话交互，以支持用户继续描述和修改网页需求

#### Scenario: 右侧对话区直接复用现有聊天样式
- **WHEN** builder 页面渲染右侧对话区
- **THEN** 系统 SHALL 直接延续现有 Agent 对话框、消息列表和输入区的样式与交互语言，并保持比首页更紧凑的工作台密度

#### Scenario: 锁失效时 CMS 入口不再打开
- **WHEN** builder 页面已经失去 page-builder 编辑锁
- **THEN** 系统 SHALL 禁用会修改项目的 builder 交互
- **AND** 系统 SHALL 在用户尝试打开 CMS 浏览器时提示编辑锁已失效
