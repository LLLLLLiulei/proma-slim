## Why

PageBuilder 模板库一期已经具备用户模板 registry、详情、预览和删除能力，但还缺少从当前项目生成真实用户模板的入口。为了让后续“使用模板创建项目”和首页模板库 UI 有可消费的真实模板来源，需要先实现当前 PageBuilder 项目另存为模板的后端能力。

## What Changes

- 新增 workspace 维度的“当前项目另存为模板”API：`POST /api/workspaces/:workspaceId/page-builder/templates`。
- API 要求当前 workspace 是 PageBuilder workspace，并且请求携带有效编辑锁凭证。
- 支持 standalone PageBuilder 项目另存为用户模板。
- 支持 CMS 集成 Builder 项目另存为静态快照模板；CMS 动态数据固化方式与当前静态资源包导出保持一致，本 change 不改变 CMS gateway/UI API 鉴权链路。
- standalone 来源在导出前预扫描 CMS 作者态标记，发现 `<cms-content>`、`<cms-catalog>`、CMS runtime 属性或 CMS preview/runtime loader 时直接失败，避免静默生成缺块模板。
- 复用现有静态导出产物，整理为用户模板目录结构：`template.json`、`workspace-files/`、`reports/static-export-report.json`、`reports/template-validation-report.json`，可选写入非敏感 `source/source-project.json`。
- 另存结果必须通过模板质量校验：无 CMS 作者态标签、无 CMS runtime/manifest、无远程 `script[src]` / `iframe[src]`、无关键资源下载失败、无 CMS cookie/session/token/access session。
- 成功后返回 public template summary，使后续模板库列表、预览和使用模板能力可以消费该模板。

## Capabilities

### New Capabilities

- `page-builder-template-save`: 定义 PageBuilder 当前项目另存为用户模板的 API、编辑锁要求、standalone 与 CMS 集成来源处理、静态导出复用、模板目录生成、模板质量校验和错误边界。

### Modified Capabilities

- 无。

## Impact

- 后端 API：新增 `POST /api/workspaces/:workspaceId/page-builder/templates`。
- 后端服务：扩展 PageBuilder 模板服务，新增从 workspace 生成用户模板的能力。
- 静态导出：复用现有 `pageBuilderStaticExportService.exportWorkspaceStaticPackage()` 产物，不改变静态资源包导出语义。
- CMS 集成：复用现有 Builder Access Session / CMS project binding 校验作为 CMS 集成 Builder 当前访问有效性判断，不在本 change 中迁移到 CMS UI Cookie 数据链路。
- 文件系统：写入 `getConfigDir()/page-builder-templates/<template-id>/`，采用临时目录到最终目录的原子 rename。
- Shared 类型：补充另存模板请求、响应和模板校验报告相关类型。
- 测试：补充 workspace route、模板服务、静态导出产物整理和错误边界测试。
