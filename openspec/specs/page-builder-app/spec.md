## Purpose
定义 `page-builder` 的首页启动流程、builder 双栏工作台，以及项目初始化如何与现有 Agent 会话能力衔接。

## Requirements

### Requirement: 首页必须提供极简项目启动入口
系统 SHALL 在 `page-builder` 首页提供面向 AI 建网页场景的极简启动入口：轻量标题加单一需求输入框，而不是复用通用 Agent 工作台或展示多个预设启动按钮。

#### Scenario: 访问首页时展示极简输入入口
- **WHEN** 用户访问 `page-builder` 首页
- **THEN** 系统 SHALL 展示轻量标题和单一需求输入框，且不展示“从零开始”“从网站链接开始”“从名片开始”等预设启动按钮

#### Scenario: 首页视觉细化保持现有产品语言
- **WHEN** 系统对首页进行视觉细化或应用额外的前端设计指导
- **THEN** 首页 SHALL 继续围绕现有输入框语言和 Proma 对话体验展开，而不是引入与 builder 页割裂的新视觉体系

#### Scenario: 提交需求时真实创建项目上下文
- **WHEN** 用户在首页输入网页需求并提交
- **THEN** 系统 SHALL 依次创建一个名为“未命名项目”的工作区和该工作区下的首个会话，并跳转到对应的 builder 页面

#### Scenario: 创建会话失败时不重复创建工作区
- **WHEN** 首页启动流中工作区创建成功但首个会话创建失败
- **THEN** 系统 SHALL 保留已创建的工作区，并允许后续仅重试会话创建，而不是再次新建另一个“未命名项目”工作区

### Requirement: Builder 页面必须提供紧凑双栏工作台
系统 SHALL 为 `page-builder` 提供紧凑型 builder 工作台，左侧为网页预览区域，右侧为项目对话区域，并保持与现有对话框视觉语言一致的紧凑密度；其中左侧预览面板除了现有预览控制项外，还必须承载项目级设备模式切换入口、离线静态包导出入口、CMS 远程资源导出选项与相应状态反馈。

#### Scenario: 进入 builder 时展示左预览右对话布局
- **WHEN** 用户进入某个项目对应的 builder 页面
- **THEN** 系统 SHALL 展示左侧预览面板和右侧对话面板的双栏布局，而不是展示 `apps/app` 的侧边栏与页签式工作台

#### Scenario: Builder 页面进入时处理编辑锁上下文
- **WHEN** 用户进入某个项目对应的 builder 页面
- **THEN** 系统 SHALL 优先复用已有锁上下文或直接获取新的编辑锁
- **AND** 系统 SHALL 在恢复 stored lock 时使用原有 `lockId` 与 `holderId` 续约
- **AND** 系统 SHALL 在锁失效或被拒绝时禁用编辑能力并提示用户重新进入

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

### Requirement: Builder 顶部必须以工作区名称表达项目语义
系统 SHALL 在 builder 顶部展示并编辑工作区名称作为项目名，而不是使用当前会话标题来表示项目。

#### Scenario: 初次进入 builder 时显示默认项目名
- **WHEN** 用户通过首页首次创建项目并进入 builder
- **THEN** builder 顶部 SHALL 展示工作区名称“未命名项目”作为当前项目名

#### Scenario: 编辑项目名时更新工作区而非会话
- **WHEN** 用户在 builder 顶部修改项目名
- **THEN** 系统 SHALL 更新当前工作区名称，并保持当前会话标题语义独立，不将该操作视为会话标题编辑

### Requirement: Page-builder 项目工作区必须自动准备默认 MCP 服务
系统 SHALL 在新建 `page-builder` 项目工作区时，为该工作区持久化网页构建所需的默认 MCP 服务，使后续 builder 会话无需手动配置即可使用浏览器预览与辅助推理能力。

#### Scenario: 新建 page-builder 项目时写入默认 MCP 配置
- **WHEN** 用户通过 `page-builder` 首页提交需求并创建新的项目工作区
- **THEN** 系统 SHALL 在该工作区的持久化 MCP 配置中写入启用状态的 `playwright` 与 `server-sequential-thinking` 两个 stdio 服务

#### Scenario: 同一工作区下的后续会话复用默认 MCP
- **WHEN** 用户在同一个 `page-builder` 工作区下继续当前会话或新建后续会话
- **THEN** 系统 SHALL 继续复用该工作区已持久化的默认 MCP 配置，而不是要求用户再次配置或在消息中重复注入提示词

#### Scenario: 重复初始化时不覆盖已有同名 MCP 配置
- **WHEN** 某个 `page-builder` 工作区已经存在 `playwright` 或 `server-sequential-thinking` 的同名 MCP 配置，且模板初始化流程再次执行
- **THEN** 系统 SHALL 保留已有同名配置，并仅补齐缺失的默认 MCP 条目，而不是覆盖用户已经调整过的设置

### Requirement: 首页首条需求必须在 builder 中自动且仅自动发送一次
系统 SHALL 将首页提交的网页需求在 builder 页面初始化完成后自动作为首条消息发送到当前会话，并 SHALL 在该次自动发送中显式装载 workspace-local `page-builder-guided-generation` 主控 skill，以保证首轮流程直接进入引导式专题页生成模式，同时确保同一会话不会因刷新或重复进入而重复发送该初始化需求。

#### Scenario: 首次进入 builder 时自动发送首页需求并注入主控 skill
- **WHEN** 用户通过首页完成项目创建并首次进入对应 builder 页面，且当前会话尚无任何消息
- **THEN** 系统 SHALL 自动将首页输入的网页需求作为首条消息发送到当前会话
- **AND** 系统 SHALL 在该次发送中显式装载 `page-builder-guided-generation`

#### Scenario: 刷新 builder 时不重复发送初始化需求
- **WHEN** 用户刷新已完成初始化发送的 builder 页面
- **THEN** 系统 SHALL 不再次发送首页输入的初始化需求

#### Scenario: 已存在消息的会话重新进入 builder 时不重复发送
- **WHEN** 用户重新进入一个已经存在消息记录的 builder 会话
- **THEN** 系统 SHALL 不再次触发首页初始化需求的自动发送

### Requirement: Builder 普通对话发送必须由宿主先完成 scene 分类与 owner 映射
系统 SHALL 在 `page-builder` 的 Builder 发送准备阶段先结合宿主拥有的结构化目标上下文与 workflow 状态，把本轮请求分类为 `ordinary-page-flow`、`existing-cms-region-ordinary-edit` 或 `confirmed-cms-apply` 三种 scene，并 SHALL 只为该次发送显式装载与 scene 对应的唯一 owner skill；其中 `ordinary-page-flow` 与 `existing-cms-region-ordinary-edit` 的唯一 owner 都为 `page-builder-guided-generation`，`confirmed-cms-apply` 的唯一 owner 为 `cms-binding-apply`。当 scene 为 `existing-cms-region-ordinary-edit` 时，系统 MAY 额外注入 target-scoped 的 `page-builder-cms-region-authoring-guidance` 作为 consult-only guidance，但 SHALL NOT 把它提升为并列 owner 或替代 owner。系统 SHALL NOT 要求用户手动输入 skill 调用指令，也 SHALL NOT 在同一轮中并列追加多个 controller skill。自由文本内容 MAY 作为 owner skill 的语义输入，但宿主 SHALL NOT 仅凭关键词、动词模式、正则匹配或 continuation 文本去恢复、延续、清空或改写 `targetSelection`。

#### Scenario: 普通消息进入单一 ordinary owner
- **WHEN** 用户在 `page-builder` 的 Builder 对话区提交一条普通页面创建、普通迭代、普通修复或当前已选 block 的 follow-up 消息，且当前发送未显式命中已有 CMS target，也未进入 confirmed CMS apply
- **THEN** 系统 SHALL 在该次发送中显式装载且只装载 `page-builder-guided-generation`
- **AND** 系统 SHALL NOT 额外追加 `cms-binding-apply` 作为并列 owner

#### Scenario: 显式命中已有 CMS target 时保持 ordinary owner 并注入 consult guidance
- **WHEN** 当前 Builder 发送已经带有明确的 existing `cms-island` 或 source CMS tag target，且该任务仍属于已有 CMS 区域 ordinary authoring，而不是 confirmed apply
- **THEN** 系统 SHALL 在该次发送中显式装载且只装载 `page-builder-guided-generation` 作为 owner
- **AND** 系统 MAY 额外提供 `page-builder-cms-region-authoring-guidance` 与当前目标 digest 作为 consult-only guidance
- **AND** 系统 SHALL NOT 将 `page-builder-cms-region-authoring-guidance` 作为新的 owner 或并列 owner 注入

#### Scenario: 没有显式 target 的后续消息不会被宿主自动恢复旧 target
- **WHEN** 用户此前已经发送过一条带 `targetSelection` 的消息，但当前这一轮发送没有新的显式 target，也没有 confirmed CMS workflow state
- **THEN** 系统 SHALL 不再自动恢复上一轮的旧 `targetSelection`
- **AND** 系统 SHALL 将该次发送视为无显式 target 的 ordinary flow

#### Scenario: confirmed CMS apply 使用专用 owner
- **WHEN** 当前 Builder workflow 已经拥有确认完成的 CMS 选择结果并进入 decision-backed confirmed CMS apply
- **THEN** 系统 SHALL 在该次发送中显式装载且只装载 `cms-binding-apply`
- **AND** 系统 SHALL NOT 再额外追加 `page-builder-guided-generation` 或 `page-builder-cms-region-authoring-guidance`

#### Scenario: 已由宿主写入唯一 owner 的程序化发送不再被默认 ordinary owner 覆盖
- **WHEN** 某次 Builder 发送已经由宿主场景分类或专用工作流写入与当前 scene 对应的唯一 owner skill
- **THEN** 系统 SHALL 保留该唯一 owner
- **AND** 系统 SHALL NOT 再额外追加默认 `page-builder-guided-generation`

### Requirement: Builder 交互锁定 MUST 在陈旧 busy 状态下自动恢复
系统 SHALL 让 builder 对 Agent busy 状态的页面级锁定基于真实会话活跃性，而不是仅依赖可能残留的本地流式标记。

#### Scenario: 陈旧本地 busy 状态不会长期锁住 builder
- **WHEN** builder 当前会话的本地 streaming 标记仍为真，但后端会话已经空闲
- **THEN** 系统 SHALL 自动校准该会话状态
- **AND** 系统 SHALL 重新启用被 busy 状态锁定的 builder 交互
- **AND** 系统 SHALL NOT 要求用户必须先手动发送一条消息才能恢复

#### Scenario: 后端仍活跃时继续锁定 builder
- **WHEN** builder 触发一次会话忙碌状态校准，且后端返回该会话仍在处理
- **THEN** 系统 SHALL 继续保持 builder 的 busy 锁定
- **AND** 系统 SHALL 防止用户并发触发新的编辑或发送动作

#### Scenario: 刷新 builder 后仍能恢复真实 busy 锁定
- **WHEN** 用户在 builder 会话仍由 Agent 处理期间刷新页面，导致本地 `running` 状态被重置
- **THEN** 系统 SHALL 依据消息历史与后端活跃状态重新识别该会话仍在处理中
- **AND** 系统 SHALL 恢复页面级 busy 锁定，而不是允许用户立即再次发送并撞到后端 409

### Requirement: PageBuilder renderer 必须支持 public base path 路由和导航
系统 SHALL 让 PageBuilder 前端在浏览器地址包含 public base path 时正确解析首页、builder 路由和内部导航，同时在未配置 base path 时保持现有根路径行为。

#### Scenario: base path 下解析首页和 builder 路由
- **WHEN** 浏览器地址为 `/pagebuilder/` 或 `/pagebuilder/builder/<workspaceId>/<sessionId>`，且 public base path 为 `/pagebuilder`
- **THEN** PageBuilder renderer SHALL 分别解析为首页或对应 builder 路由
- **AND** 系统 SHALL NOT 将这些地址识别为 not-found

#### Scenario: base path 下构建内部导航地址
- **WHEN** PageBuilder 首页创建项目后跳转 builder，或历史记录打开已有项目
- **THEN** renderer SHALL 生成 `/pagebuilder/builder/<workspaceId>/<sessionId>` 形式的浏览器地址
- **AND** 未配置 public base path 时 SHALL 继续生成 `/builder/<workspaceId>/<sessionId>`

#### Scenario: 返回首页时保留 public base path
- **WHEN** PageBuilder 在 base path 模式下从 builder 或 not-found 页面导航回首页
- **THEN** renderer SHALL 导航到 `/pagebuilder/`
- **AND** 未配置 public base path 时 SHALL 继续导航到 `/`

### Requirement: 共享 API client 必须仅在 PageBuilder runtime 下应用 public base path
系统 SHALL 让共享 API client 保持调用方使用逻辑 `/api/*` 路径，同时在 PageBuilder public base path runtime 下把浏览器请求解析到 `${basePath}/api/*`。

#### Scenario: PageBuilder base path 下 API 请求带公开前缀
- **WHEN** PageBuilder renderer 在 public base path `/pagebuilder` 下调用逻辑 API 路径 `/api/status`
- **THEN** 浏览器请求 SHALL 发送到 `/pagebuilder/api/status`
- **AND** 调用方 SHALL NOT 需要手动拼接 `/pagebuilder`

#### Scenario: 主应用和 standalone 模式不受影响
- **WHEN** 主应用或未配置 public base path 的 PageBuilder 调用逻辑 API 路径 `/api/status`
- **THEN** 浏览器请求 SHALL 继续发送到 `/api/status`
- **AND** 系统 SHALL NOT 将主应用请求改写到 `/pagebuilder/api/status`
#### Scenario: PageBuilder runtime config 优先于 Vite 相对资源 base
- **WHEN** PageBuilder renderer 收到运行时注入的 public base path `/pagebuilder`，且 Vite 构建 base 为相对资源路径
- **THEN** renderer SHALL 使用运行时注入的 `/pagebuilder` 解析路由和 API 请求
- **AND** 未收到运行时注入配置且 Vite base 为相对资源路径时 SHALL 视为 root mode

#### Scenario: PageBuilder base path 下直接下载 URL 带公开前缀
- **WHEN** PageBuilder renderer 在 public base path `/pagebuilder` 下生成离线静态导出下载 URL
- **THEN** 生成的浏览器 URL SHALL 位于 `/pagebuilder/api/workspaces/<workspaceId>/page-builder/export-static-jobs/<jobId>/download`
- **AND** 调用方 SHALL NOT 需要手动拼接 `/pagebuilder`

### Requirement: CMS 集成模式首页必须展示受限入口
PageBuilder HomePage 在 CMS 集成模式下 SHALL 停止提供 standalone 本地项目创建入口，并 SHALL 引导用户从 CMS 系统进入 PageBuilder。

#### Scenario: CMS 模式首页显示 CMS 入口提示
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **THEN** 系统 SHALL 展示“请从 CMS 系统进入 PageBuilder”
- **AND** 系统 SHALL NOT 展示本地 prompt 输入框或创建按钮

#### Scenario: CMS 模式首页不允许本地创建项目
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **THEN** 系统 SHALL NOT 调用 standalone 的 workspace 创建或 session 创建流程
- **AND** 系统 SHALL NOT 写入 bootstrap cache

#### Scenario: standalone 首页保持现有启动流程
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 standalone 模式
- **THEN** 系统 SHALL 继续展示本地 prompt 创建入口
- **AND** 用户提交需求后 SHALL 继续创建 page-builder workspace、创建 session、写入 bootstrap cache 并跳转到 builder 页面

### Requirement: CMS 集成模式 BuilderPage 必须先通过 builder context 加载
PageBuilder BuilderPage 在 CMS 集成模式下 SHALL 先完成 builder context 校验和上下文初始化，再挂载项目工作台。

#### Scenario: CMS 模式 builder 的首个项目上下文请求是 builder context
- **WHEN** 用户访问 `/builder/:workspaceId/:sessionId` 且 integration status 表示 CMS 集成模式已启用
- **THEN** BuilderPage SHALL 首先请求 builder context
- **AND** BuilderPage SHALL NOT 先请求 `/api/sessions` 或 `/api/workspaces` 来解析当前项目

#### Scenario: builder context 成功后初始化当前项目状态
- **WHEN** CMS 集成模式下 builder context 成功返回当前 workspace 和 session
- **THEN** BuilderPage SHALL 使用返回的 workspace 和 session 初始化当前 Jotai workspace/session 状态
- **AND** BuilderPage SHALL 允许挂载 AgentView、PreviewPane、CMS browser 和项目工作台交互

#### Scenario: CMS 模式不读取 standalone bootstrap cache
- **WHEN** CMS 集成模式下 builder context 成功
- **THEN** BuilderPage SHALL NOT 从 standalone bootstrap cache 读取初始 prompt
- **AND** BuilderPage SHALL NOT 因进入 CMS 项目而自动发送首页初始化需求

#### Scenario: builder context 失败时项目工作台不挂载
- **WHEN** CMS 集成模式下 builder context 失败
- **THEN** BuilderPage SHALL 展示统一访问失效页
- **AND** BuilderPage SHALL NOT 挂载 AgentView、PreviewPane 或 CMS browser
- **AND** BuilderPage SHALL NOT 请求 messages、preview-state、workspace preview、workspace directory context 或项目编辑 API

#### Scenario: builder context 失败页以 CMS 重新进入为主
- **WHEN** CMS 集成模式下 BuilderPage 展示 builder context 失败页
- **THEN** 系统 SHALL 以“访问已失效，请从 CMS 系统重新进入 PageBuilder”作为主要恢复提示
- **AND** 系统 MAY 提供重试入口
- **AND** 系统 SHALL NOT 把返回 PageBuilder 首页作为主要恢复路径

#### Scenario: standalone builder 保持现有直接 URL 行为
- **WHEN** 用户访问 `/builder/:workspaceId/:sessionId` 且 integration status 表示 standalone 模式
- **THEN** BuilderPage SHALL 继续通过现有 sessions/workspaces 列表解析当前项目
- **AND** BuilderPage SHALL 继续支持 standalone bootstrap 首条消息和直接 builder URL
