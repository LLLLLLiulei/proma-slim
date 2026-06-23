## 1. CMS 集成数据模型与服务抽取

- [x] 1.1 扩展 `CmsIntegratedProjectBinding`，增加可选 `sourceTemplateId`，并更新 binding 读取、写入、normalize、测试 fixture 的兼容处理
- [x] 1.2 扩展 CMS 创建项目请求解析，支持可选非空字符串 `templateId`，保持 `prompt` 字段拒绝和旧请求兼容
- [x] 1.3 抽取或补充模板实例化内部服务能力，使 CMS 创建项目可以基于模板复制 `workspace-files/`、创建 workspace/session，但不直接复用普通模板 use API 的响应契约
- [x] 1.4 实现 CMS project binding 的模板幂等与冲突判断：同模板复用、模板不一致冲突、已有空项目收到模板创建冲突、旧客户端不传 `templateId` 可复用已有模板项目

## 2. CMS 模板库 Server-to-Server API

- [x] 2.1 新增 `GET /api/integrations/cms/templates`，统一校验 integration secret、CMS 集成模式和当前 `X-CMS-Cookie` 登录态
- [x] 2.2 为 CMS 模板列表生成基于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 和 `AI_PAGE_BUILDER_BASE_PATH` 的绝对 `previewUrl`，并在 public origin 缺失或非法时返回 `invalid_request`
- [x] 2.3 新增 `POST /api/integrations/cms/templates/import`，统一校验 integration secret 和当前 `X-CMS-Cookie` 登录态后复用现有模板 zip 导入服务
- [x] 2.4 将模板列表、模板导入、带 `templateId` 创建项目中的模板服务错误映射为 CMS integration 结构化错误响应，避免回退为普通 `HttpError`

## 3. CMS 按模板创建项目流程

- [x] 3.1 扩展 `POST /api/integrations/cms/projects`：未传 `templateId` 时保持现有空项目创建行为
- [x] 3.2 实现传入合法 `templateId` 时的模板项目创建：校验模板存在、创建 page-builder workspace、复制模板文件、创建 primary session、写入带 `sourceTemplateId` 的 binding
- [x] 3.3 确保模板项目创建失败时回滚本次创建的 workspace、session 和 workspace 文件，且不返回可用 `projectId`
- [x] 3.4 确保 CMS 创建项目响应只返回集成契约字段，避免暴露内部 `workspaceId`、`sessionId`、原始 CMS Cookie、integration secret 或 access session

## 4. 测试与验证

- [x] 4.1 增加 CMS 模板列表路由测试：鉴权失败、CMS Cookie 缺失、public origin 缺失、base path 下绝对 `previewUrl`、成功返回模板列表
- [x] 4.2 增加 CMS 模板导入路由测试：鉴权/登录态校验、public origin 缺失时写入前拒绝、缺少 file、非法 zip、大小限制映射、成功导入并返回绝对 `previewUrl`
- [x] 4.3 增加 CMS 创建模板项目测试：首次创建、幂等重试、模板不一致冲突、已有空项目收到模板请求冲突、旧客户端不传 `templateId` 复用已有模板项目
- [x] 4.4 增加 binding store 测试，覆盖旧 binding 兼容、`sourceTemplateId` 落盘、读取和冲突判断
- [x] 4.5 增加模板项目闭环测试，覆盖基于模板创建 CMS 项目后继续通过 `projectId` 创建 builder/preview handoff 和触发同步导出
- [x] 4.6 运行相关测试与类型检查：CMS integration routes、template service、binding store、`bun run --cwd apps/app typecheck`
- [x] 4.7 运行 `openspec validate add-cms-template-library-integration --strict` 并修正规格问题

## 5. CMS 模板管理接口追加

- [x] 5.1 新增 `PATCH /api/integrations/cms/templates/:templateId`，统一校验 integration secret、CMS 集成模式、当前 `X-CMS-Cookie` 登录态和合法 `name`
- [x] 5.2 新增 `POST /api/integrations/cms/templates/batch-delete`，统一校验 integration secret、CMS 集成模式、当前 `X-CMS-Cookie` 登录态和非空 `templateIds` 数组
- [x] 5.3 批量删除按首次出现顺序去重，item 级删除失败写入 `failures` 并继续处理后续模板
- [x] 5.4 将模板重命名和删除错误映射为 CMS integration 结构化错误响应：`template_not_found`、`template_operation_forbidden`、`template_operation_failed` 或 `invalid_request`
- [x] 5.5 增加 CMS 模板重命名和批量删除路由测试，覆盖名称校验、绝对 `previewUrl`、不存在模板、部分成功和去重
- [x] 5.6 更新 CMS 对接文档和 OpenSpec delta，说明模板重命名、批量删除、部分成功响应和错误码

## 6. 模板列表名称搜索追加

- [x] 6.1 扩展模板服务 `listTemplates({ name })`，按模板名称做去空白、大小写不敏感的包含匹配
- [x] 6.2 普通 `GET /api/page-builder/templates` 和 CMS `GET /api/integrations/cms/templates` 均接入 `name` 查询参数
- [x] 6.3 增加 service、普通模板列表路由和 CMS 模板列表路由测试，覆盖 `name` 搜索过滤
- [x] 6.4 更新 CMS 对接文档和 OpenSpec delta，说明 `name` 查询参数语义
