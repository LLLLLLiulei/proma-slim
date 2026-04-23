## Why

当前 page-builder 静态导出默认会尝试下载所有 CMS 远程资源，这会让导出耗时、失败面和包体大小都受 CMS 资源质量影响。部分用户只需要可部署的静态页面，并希望 CMS 图片等资源继续使用源站 URL，因此需要在导出时显式控制是否下载 CMS 远程资源。

## What Changes

- 在 Builder 的“导出静态包”入口增加确认弹框，允许用户勾选是否“导出 CMS 远程资源”。
- 默认勾选该选项，以保持现有导出行为不变；每次导出都使用当次选择，不记忆上次状态。
- 当用户未勾选时，静态导出 SHALL 跳过 CMS 远程资源下载，并在导出后的页面中直接保留或恢复为 CMS 源站资源访问地址。
- 未勾选时仅影响 CMS 远程资源下载；非 CMS 远程图片、远程 CSS、字体、附件和工作区本地资源仍按现有规则导出。
- 导出报告 SHALL 记录被跳过的 CMS 远程资源，并让 Builder 将该结果提示为成功但存在离线完整性告警。
- 保持同一工作区已有活动导出任务的复用/防并发行为；如果用户在任务进行中再次选择不同选项，系统不新建第二个并发任务。

## Capabilities

### New Capabilities

### Modified Capabilities
- `page-builder-app`: 修改 Builder 导出入口交互，点击“导出静态包”后先展示 CMS 远程资源导出选项，再创建导出任务。
- `page-builder-offline-static-export`: 修改离线静态导出资源本地化要求，支持按任务选项跳过 CMS 远程资源下载并在报告中记录离线完整性告警。

## Impact

- Affected code:
  - `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`
  - `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
  - `apps/app/src/renderer/lib/api.ts`
  - `apps/app/src/main/http/routes/workspaces.ts`
  - `apps/app/src/main/lib/page-builder-static-export-service.ts`
  - `packages/shared/src/types/page-builder-static-export.ts`
  - related frontend, route, API and static export tests
- Affected systems:
  - page-builder Builder export UX
  - static export job creation API contract
  - CMS remote resource localization and reporting
- APIs / contracts:
  - static export job creation accepts an export option for CMS remote resource downloading
  - static export report distinguishes skipped CMS remote resources from download failures
