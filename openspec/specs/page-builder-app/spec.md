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

### Requirement: Builder 普通对话发送必须默认延续引导式专题页生成流程
系统 SHALL 在 `page-builder` 的普通用户发送路径中默认显式装载 workspace-local `page-builder-guided-generation`，以保证首轮生成与后续页面迭代持续处于同一引导式流程中。

#### Scenario: 用户在 builder 中发送普通消息时默认注入主控 skill
- **WHEN** 用户在 `page-builder` 的 Builder 对话区提交一条普通消息
- **THEN** 系统 SHALL 在该次发送中显式装载 `page-builder-guided-generation`
- **AND** 系统 SHALL 不要求用户手动输入 skill 调用指令

#### Scenario: 页面生成后的普通修改请求仍沿用主控 skill
- **WHEN** 当前 Builder 会话已经生成过页面，且用户继续在对话区提交后续修改请求
- **THEN** 系统 SHALL 继续在该次发送中显式装载 `page-builder-guided-generation`
- **AND** 系统 SHALL 使后续修改继续沿用引导式专题页生成的轻量迭代模式

#### Scenario: 已有专用显式 skill 的程序化发送不被默认主控 skill 覆盖
- **WHEN** 某次 Builder 发送已经由专用工作流提供了显式 `mentionedSkills`
- **THEN** 系统 SHALL 保留该次发送原有的显式 skill 集合
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
