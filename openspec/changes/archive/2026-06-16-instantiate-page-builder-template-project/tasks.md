## 1. 契约与测试准备

- [x] 1.1 在 `page-builder.test.ts` 补充模板 use API 成功用例，验证请求项目名称、返回 `workspace`、`session`、`previewState` 和 public base path。
- [x] 1.2 在 `page-builder.test.ts` 补充模板 use API 空项目名称失败用例，验证返回 400 且不创建项目。
- [x] 1.3 在 `page-builder-template-service.test.ts` 补充服务级实例化成功用例，验证新 workspace 文件与模板 `workspace-files/` 一致。
- [x] 1.4 补充复制范围测试，验证不复制 `template.json`、`reports/`、`source/`，且默认 PageBuilder 骨架文件不混入新 workspace。
- [x] 1.5 补充 CMS 集成来源模板测试，验证新项目不继承 CMS binding、Builder Access Session 或 `.proma/cms-rendering-manifest.json`。
- [x] 1.6 补充失败回滚测试，覆盖 symlink/特殊文件拒绝、复制失败或 session 创建失败后不留下 workspace、session 或磁盘目录。
- [x] 1.7 补充 CMS 集成生产模式阻断与开发 dev bypass 的 route 测试。

## 2. Shared 类型与服务能力

- [x] 2.1 在 `packages/shared/src/types/page-builder-template.ts` 增加模板使用请求/响应类型，请求包含 `projectName`，响应包含 `workspace`、`session` 和 `previewState`。
- [x] 2.2 扩展 `PageBuilderTemplateServiceError` 错误码，覆盖实例化失败、复制失败和不安全模板文件。
- [x] 2.3 在 `PageBuilderTemplateService` 中新增模板实例化方法，解析合法模板并创建 PageBuilder workspace。
- [x] 2.4 实现安全递归复制，只允许普通目录和普通文件，拒绝 symlink 和特殊文件。
- [x] 2.5 在复制前清空新 workspace 的默认 `workspace-files/`，复制后移除 `.proma/cms-rendering-manifest.json`。
- [x] 2.6 创建首个 Agent session，并调用 `getWorkspacePreviewState()` 生成返回值。
- [x] 2.7 实现失败回滚，清理本次请求创建的 workspace、session、workspace 磁盘目录和半成品文件。

## 3. HTTP API 接入

- [x] 3.1 在 `apps/app/src/main/http/routes/page-builder.ts` 新增 `POST /templates/:templateId/use` 路由，并读取/校验请求体 `projectName`。
- [x] 3.2 路由层沿用全局模板库 CMS 集成访问边界，生产 CMS 集成模式阻断，开发 dev bypass 允许。
- [x] 3.3 扩展模板服务错误映射，区分 400、403、404、409/500，避免实例化失败被统一映射为 404。
- [x] 3.4 确认 API 成功响应状态码为 201，并返回 shared 类型定义的使用结果。

## 4. 验证与回归

- [x] 4.1 运行模板服务和 PageBuilder 路由相关测试，确认新增用例通过。
- [x] 4.2 运行 shared、app 后端相关 typecheck，确认类型导出和路由返回类型无误。
- [x] 4.3 回归已有模板 registry、模板预览、删除模板和另存模板测试，确认行为不回退。
- [x] 4.4 运行 `openspec status --change instantiate-page-builder-template-project`，确认 tasks 可跟踪且 change 可进入 apply 阶段。
