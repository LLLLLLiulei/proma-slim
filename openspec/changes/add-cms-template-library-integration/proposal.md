## Why

CMS 系统已经可以通过 PageBuilder 创建空 AI 专题项目、打开构建页并同步导出静态包，但还不能通过受控集成接口复用 PageBuilder 模板库。为了让 CMS 在新建 AI 专题记录时选择已有静态模板并完成后续 handoff、预览和导出闭环，需要把模板列表、模板导入和按模板创建项目纳入 CMS server-to-server 集成契约。

## What Changes

- 新增 CMS server-to-server 模板列表接口，返回可供 CMS 展示和预览的模板摘要，并将模板 `previewUrl` 转换为基于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 的绝对 URL。
- 新增 CMS server-to-server 模板 zip 导入接口，要求 integration secret 和当前 `X-CMS-Cookie` 校验，并复用现有 PageBuilder 模板 zip 导入能力。
- 新增 CMS server-to-server 模板重命名接口和批量删除接口，统一校验 integration secret 与当前 `X-CMS-Cookie`，批量删除支持部分成功/失败。
- 扩展 CMS 创建项目接口 `POST /api/integrations/cms/projects`，支持可选 `templateId`，在传入合法模板时基于模板创建 PageBuilder workspace/session 并写入 CMS project binding。
- 扩展 CMS project binding 记录可选 `sourceTemplateId`，用于标识项目创建时使用的模板。
- 明确 `externalRecordId` 幂等重试与模板冲突规则：已有绑定的 `siteId` 或 `sourceTemplateId` 与本次请求不一致时返回 `project_conflict`；已有模板项目在旧客户端不传 `templateId` 时保持兼容返回已有 `projectId`。
- 保持模板库全局静态资源属性：模板本身不按 CMS 用户或站点隔离，模板预览继续使用现有只读 preview URL，不新增模板 preview handoff。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `page-builder-cms-integration`: 增加 CMS 对模板列表、模板导入、模板重命名、模板批量删除、按模板创建项目、绝对模板预览 URL、模板来源绑定和模板冲突语义的集成要求。

## Impact

- 影响后端 CMS 集成路由：`apps/app/src/main/http/routes/cms-integration.ts`。
- 影响 CMS project binding 存储结构：`apps/app/src/main/lib/cms-integration/cms-project-binding-store.ts`。
- 复用并可能扩展模板服务能力：`apps/app/src/main/lib/page-builder-template-service.ts`。
- 影响共享类型或测试 fixtures：`packages/shared/src/types/page-builder-template.ts`、CMS integration 相关测试。
- 新增/更新 OpenSpec：`openspec/specs/page-builder-cms-integration/spec.md` 的 delta。
