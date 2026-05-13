## ADDED Requirements

### Requirement: CMS 集成前端必须使用状态探测和 builder context
PageBuilder renderer 在 CMS 集成模式下 SHALL 使用 CMS integration status 判断运行模式，并 SHALL 使用 builder context 作为进入具体项目的受控前端上下文来源。

#### Scenario: 前端通过 integration status 判断 CMS 模式
- **WHEN** PageBuilder renderer 初始化首页或 builder 页面
- **THEN** 系统 SHALL 请求 `GET /api/integrations/cms/status`
- **AND** 当响应包含 `integrationMode: "cms"` 且 `enabled: true` 时，前端 SHALL 进入 CMS 集成门控流程

#### Scenario: status 未完成前不得加载 standalone 项目入口
- **WHEN** PageBuilder renderer 已开始读取 `GET /api/integrations/cms/status` 但尚未确认当前模式
- **THEN** 系统 SHALL NOT 挂载 standalone 首页创建区、历史项目区或 Builder 项目工作台
- **AND** 系统 SHALL NOT 请求 `/api/page-builder/projects`、`/api/sessions`、`/api/workspaces`、session messages、preview-state、workspace preview、CMS browser、edit lock 或项目编辑 API

#### Scenario: status 请求失败时不回退 standalone
- **WHEN** PageBuilder renderer 无法成功读取 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 展示服务暂不可用或可重试状态
- **AND** 系统 SHALL NOT 回退到 standalone 首页创建、历史列表或全量 workspace/session 初始化流程

#### Scenario: CMS 模式 builder 使用 builder context 获取项目上下文
- **WHEN** PageBuilder renderer 处于 CMS 集成模式并加载 `/builder/:workspaceId/:sessionId`
- **THEN** 系统 SHALL 请求 `GET /api/integrations/cms/builder-context?workspaceId=<workspaceId>&sessionId=<sessionId>`
- **AND** 系统 SHALL 依赖同源 `ai_page_builder_access` Cookie 完成访问校验
- **AND** 系统 SHALL NOT 在前端读取、传递或持久化 access token

#### Scenario: builder context 失败时提示从 CMS 重新进入
- **WHEN** CMS 集成模式下 builder context 返回 `401`、`403`、`404` 或其他失败响应
- **THEN** 系统 SHALL 展示“访问已失效，请从 CMS 系统重新进入 PageBuilder”
- **AND** 系统 SHALL 阻止继续加载当前项目的消息、预览、CMS browser、edit lock 或项目编辑 API

#### Scenario: CMS 模式 API 请求继续使用 public base path 解析
- **WHEN** PageBuilder renderer 在 public base path 下请求 integration status 或 builder context
- **THEN** 前端调用方 SHALL 继续使用逻辑 `/api/...` 路径
- **AND** 共享 API client SHALL 将浏览器实际请求解析到 `${AI_PAGE_BUILDER_BASE_PATH}/api/...`
