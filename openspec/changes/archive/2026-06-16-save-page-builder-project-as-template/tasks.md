## 1. 类型与测试基础

- [x] 1.1 在 shared template types 中补充另存模板请求、响应、来源模式、模板校验报告和校验错误类型，并从 shared index 导出。
- [x] 1.2 补充 workspace route 测试覆盖成功另存 standalone 项目、缺少编辑锁、非法请求体、非 PageBuilder workspace 和缺少入口文件。
- [x] 1.3 补充模板服务测试覆盖模板 ID 生成、临时目录清理、导出报告迁移和 registry 可扫描结果。

## 2. 模板生成服务

- [x] 2.1 扩展 `page-builder-template-service.ts`，新增 `saveWorkspaceAsTemplate()` 服务入口，接收 workspace、输入字段和来源上下文。
- [x] 2.2 实现请求输入归一化和校验：`name` 必填，`description`、`tags` 可选且过滤空值。
- [x] 2.3 实现合法模板 ID 生成、最终模板目录解析、临时目录创建和失败清理。
- [x] 2.4 实现 `template.json` 写入，字段满足 registry v1，记录 `sourceProject.sourceMode` 且不包含缩略图字段。
- [x] 2.5 可选写入 `source/source-project.json`，只保存非敏感来源信息。

## 3. 静态导出整理与质量校验

- [x] 3.1 实现 standalone 源 `workspace-files/index.html` CMS 作者态/runtime 标记预扫描，命中时返回可映射为 409 的服务错误。
- [x] 3.2 调用 `pageBuilderStaticExportService.exportWorkspaceStaticPackage(workspace, { downloadCmsRemoteAssets: true })` 生成静态导出产物。
- [x] 3.3 解压静态导出 zip 到临时模板 `workspace-files/`，并将根部 `export-report.json` 迁移为 `reports/static-export-report.json`。
- [x] 3.4 移除 `workspace-files/.proma/cms-rendering-manifest.json`，并确保根部 `export-report.json` 不进入 `workspace-files/`。
- [x] 3.5 实现模板质量校验：入口存在、无 CMS 标签/属性/runtime、无 CMS manifest、无远程 `script[src]` / `iframe[src]`、导出报告无 failure/unsupported runtime/关键资源 warning。
- [x] 3.6 写入 `reports/template-validation-report.json`，成功和失败路径都能定位校验结果；失败时不得提交最终模板目录。
- [x] 3.7 增加敏感字段防御性校验，阻断明显的 cookie/session/token/access secret 信息写入模板产物。

## 4. HTTP API 与 CMS 集成边界

- [x] 4.1 在 `workspaces.ts` 新增 `POST /:workspaceId/page-builder/templates`，复用 workspace middleware 和 CMS Builder Access middleware。
- [x] 4.2 在 route 中校验 PageBuilder workspace 和编辑锁，缺失或失效时保持现有 409 编辑锁错误语义。
- [x] 4.3 实现来源模式识别：有效 `cmsBuilderAccess` 且 project binding 匹配时为 `cms-integrated`，否则为 `standalone`。
- [x] 4.4 CMS 集成来源失效、access 与 binding 不匹配或站点上下文不一致时，复用现有 CMS 集成结构化错误。
- [x] 4.5 将模板服务错误映射到 HTTP 状态码：非法输入 400、入口缺失 404、编辑锁/校验/导出冲突 409、上游或未知导出失败 500/502。
- [x] 4.6 成功响应返回 `{ template }`，其中 `template` 为 public template summary，`previewUrl` 兼容 public base path。

## 5. 验证与回归

- [x] 5.1 补充测试：standalone 成功另存后模板可通过 `GET /api/page-builder/templates` 看到，并可通过模板预览 API 打开。
- [x] 5.2 补充测试：standalone 源含 CMS 标签、CMS runtime 属性或 CMS preview runtime 时另存失败，且不会创建半成品模板。
- [x] 5.3 补充测试：导出报告存在 unsupported runtime dependency、failure、`attachment-download-failed` 或 `cms-remote-asset-skipped` 时另存失败。
- [x] 5.4 补充测试：CMS 集成来源具备有效 access/binding 时按 `cms-integrated` 写入 `sourceProject.sourceMode`，失效或不匹配时失败。
- [x] 5.5 补充测试：模板产物不包含 CMS manifest、根部导出报告、缩略图字段、CMS cookie/session/token/Builder Access Session。
- [x] 5.6 运行相关 targeted tests、`bun run --cwd apps/app typecheck`、`bun run --cwd packages/shared typecheck` 和 `openspec status --change save-page-builder-project-as-template`。
