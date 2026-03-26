## ADDED Requirements

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
系统 SHALL 为 `page-builder` 提供紧凑型 builder 工作台，左侧为网页预览区域，右侧为项目对话区域，并保持与现有对话框视觉语言一致的紧凑密度。

#### Scenario: 进入 builder 时展示左预览右对话布局
- **WHEN** 用户进入某个项目对应的 builder 页面
- **THEN** 系统 SHALL 展示左侧预览面板和右侧对话面板的双栏布局，而不是展示 `apps/app` 的侧边栏与页签式工作台

#### Scenario: 预览面板保持精简控制项
- **WHEN** builder 页面渲染左侧预览面板
- **THEN** 系统 SHALL 提供 iframe 预览容器，以及“全屏”和“新窗口打开”两个操作入口，且不展示额外的浏览器模拟工具栏或设备切换控件

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

### Requirement: 首页首条需求必须在 builder 中自动且仅自动发送一次
系统 SHALL 将首页提交的网页需求在 builder 页面初始化完成后自动作为首条消息发送到当前会话，并确保同一会话不会因刷新或重复进入而重复发送该初始化需求。

#### Scenario: 首次进入 builder 时自动发送首页需求
- **WHEN** 用户通过首页完成项目创建并首次进入对应 builder 页面，且当前会话尚无任何消息
- **THEN** 系统 SHALL 自动将首页输入的网页需求作为首条消息发送到当前会话

#### Scenario: 刷新 builder 时不重复发送初始化需求
- **WHEN** 用户刷新已完成初始化发送的 builder 页面
- **THEN** 系统 SHALL 不再次发送首页输入的初始化需求

#### Scenario: 已存在消息的会话重新进入 builder 时不重复发送
- **WHEN** 用户重新进入一个已经存在消息记录的 builder 会话
- **THEN** 系统 SHALL 不再次触发首页初始化需求的自动发送
