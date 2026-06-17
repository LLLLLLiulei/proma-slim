## 1. 类型与路径基础

- [x] 1.1 在 `config-paths.ts` 中增加 `getUserPageBuilderTemplatesDir()`，路径为 `getConfigDir()/page-builder-templates/` 并确保目录存在。
- [x] 1.2 新增 PageBuilder template public/shared 类型，覆盖 summary、detail、manifest v1 和列表响应，并从 shared types index 导出。
- [x] 1.3 定义模板 ID、manifest、entry、sourceKind 和 public response 的校验/归一化规则，不包含缩略图字段。

## 2. 模板 Registry 服务

- [x] 2.1 新增 `page-builder-template-service.ts`，实现用户模板目录一级扫描，只接受普通目录且不跟随 symlink。
- [x] 2.2 实现 `template.json` 读取和校验：`version === 1`、`id` 与目录名一致、ID 白名单、`sourceKind: saved-project`、`entry: workspace-files/index.html`、入口文件存在。
- [x] 2.3 实现列表与详情查询，非法模板跳过并记录 warning，返回结果不包含 `thumbnail` / `thumbnailUrl`。
- [x] 2.4 生成模板 `previewUrl` 时使用 `buildPageBuilderPublicUrl()`，兼容 root mode 和 `AI_PAGE_BUILDER_BASE_PATH`。

## 3. 模板只读预览

- [x] 3.1 在模板服务中实现预览路径解析，将 `/preview/` 映射到 `workspace-files/index.html`，其他路径映射到 `workspace-files/*`。
- [x] 3.2 增加路径穿越与 symlink 逃逸防护，确保响应文件真实路径仍位于模板 `workspace-files/` 内。
- [x] 3.3 实现预览响应：HTML 设置 `content-type: text/html; charset=utf-8` 和 `cache-control: no-store`，其他资源至少设置 `cache-control: no-store`。
- [x] 3.4 确认模板预览不调用 workspace preview 服务，不注入 PageBuilder preview bridge 或 CMS rendering preview runtime。

## 4. HTTP API 与访问边界

- [x] 4.1 在 `page-builder.ts` 增加 `GET /templates`、`GET /templates/:templateId`、`GET /templates/:templateId/preview/`、`GET /templates/:templateId/preview/*`。
- [x] 4.2 增加 `DELETE /templates/:templateId`，删除前必须通过 registry 定位合法用户模板目录。
- [x] 4.3 API 统一将模板不存在或非法 `templateId` 映射为 404，将预览路径穿越映射为 403。
- [x] 4.4 全局模板库 API 在 CMS 集成模式下调用 `assertCmsBuilderApiAvailableInCmsMode(..., { allowDevStandaloneEntry: true })`。

## 5. 测试与验证

- [x] 5.1 补充模板列表/详情测试：空目录、合法模板、非法模板跳过、未知字段兼容和无缩略图返回。
- [x] 5.2 补充模板预览测试：入口 HTML、相对资源、缺失文件、路径穿越、HTML 不注入 preview bridge/CMS runtime、`cache-control: no-store`。
- [x] 5.3 补充删除模板测试：合法删除、删除不存在模板、删除后列表更新、不影响 workspace 数据。
- [x] 5.4 补充 CMS 模式访问边界测试：生产 CMS 模式阻断，开发 CMS 模式 dev bypass 放行。
- [x] 5.5 运行相关 targeted tests 和 `openspec status --change add-page-builder-template-registry`，记录验证结果。

验证记录：

- 已执行 `bun test apps/app/src/main/http/routes/page-builder.test.ts --timeout 30000`，通过 22 个测试。
- 已执行 `bun run --cwd apps/app typecheck`，通过。
- 已执行 `bun run --cwd packages/shared typecheck`，通过。
- 已执行 `openspec status --change add-page-builder-template-registry`，显示 artifacts 和 tasks 全部完成。
