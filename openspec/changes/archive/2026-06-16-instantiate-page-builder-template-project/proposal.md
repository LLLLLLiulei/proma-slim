## Why

PageBuilder 模板库已经具备用户模板 registry 和当前项目另存模板能力，但还缺少把用户模板真正复用为新 PageBuilder 项目的后端闭环。为了让后续首页模板库 UI 能接入“使用模板”并直接进入可预览、可继续编辑的新项目，需要先实现模板实例化能力。

## What Changes

- 新增全局模板使用 API：`POST /api/page-builder/templates/:templateId/use`。
- API 基于合法用户模板创建新的 PageBuilder workspace，并使用请求体中的项目名称作为新项目名称。
- 实例化流程只复制模板 `workspace-files/*` 到新 workspace，不复制 `template.json`、`reports/`、`source/` 等模板元数据目录。
- 新项目只继承模板中已固化的静态页面和本地资源，不继承 CMS 动态绑定、CMS rendering manifest、CMS 鉴权信息或 Builder Access Session。
- 创建首个 Agent session，并返回 `workspace`、`session` 和当前 `previewState`。
- 对实例化过程提供失败回滚：创建 workspace、复制文件、创建 session 或计算预览状态失败时，清理新建 workspace、session 元数据、磁盘目录和临时产物。
- CMS 集成生产模式下阻断全局模板使用 API；开发 CMS 集成模式沿用现有 dev bypass 调试 standalone 模板库能力。

## Capabilities

### New Capabilities

- `page-builder-template-instantiation`: 定义 PageBuilder 用户模板实例化为新项目的 API、复制范围、CMS 边界、首个 session 创建、preview state 返回和失败回滚语义。

### Modified Capabilities

- 无。

## Impact

- 后端 API：新增 `POST /api/page-builder/templates/:templateId/use`。
- 后端服务：扩展 PageBuilder 模板服务，新增从合法用户模板创建 PageBuilder workspace 的能力。
- Workspace/session：调用现有 workspace 和 Agent session 管理能力创建新项目和首个会话，并在失败时清理。
- Preview：调用现有 workspace preview state 能力返回可供前端缓存和跳转使用的 `previewState`。
- CMS 集成：沿用模板 registry 的全局 API 访问边界，生产 CMS 集成模式不开放本地模板实例化。
- Shared 类型：补充模板使用响应类型，供后续首页模板库 UI API client 使用。
- 测试：补充模板服务和 PageBuilder 路由测试，覆盖成功实例化、复制范围、CMS 边界、public base path、symlink 安全和失败回滚。
