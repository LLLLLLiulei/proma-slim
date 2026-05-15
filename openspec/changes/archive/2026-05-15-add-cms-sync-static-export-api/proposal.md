## Why

CMS 集成第一期需要在发布流程中由 CMS Server 直接获取 PageBuilder 当前项目的静态 ZIP 包，但现有导出能力只面向浏览器异步 job，无法满足 server-to-server 同步返回 ZIP、结构化错误和发布前一致性检查的要求。

本变更补齐 CMS 发布闭环，并将现有静态导出核心抽为浏览器异步 job 与 CMS 同步导出共用能力，避免维护两套导出逻辑。

## What Changes

- 新增 CMS server-to-server 同步导出 API：`POST /api/integrations/cms/projects/:projectId/export`。
- 同步导出 API 使用 integration secret 与 `X-CMS-Cookie` 调 CMS `/ui/login` 校验当前 CMS 用户登录态。
- 同步导出根据长期稳定 `projectId` 定位内部 page-builder workspace，并在导出前检查项目是否可安全发布。
- 同步导出成功时直接返回 `application/zip` 与 `Content-Disposition`，不创建浏览器异步 job，也不要求 Builder Access Session。
- 同步导出支持请求体可选 `downloadCmsRemoteAssets`，默认值和现有浏览器异步静态导出保持一致。
- 从现有 `page-builder-static-export-service.ts` 抽出可复用导出核心，使浏览器异步 job 和 CMS 同步导出共用打包、CMS islands SSR、远程资源处理和报告生成逻辑。
- 同 workspace 的浏览器异步导出与 CMS 同步导出必须互斥；CMS 同步导出遇到项目忙、无可导出产物或已有导出时返回结构化 `project_busy`。
- CMS 同步导出期间项目应被视为 busy，新的编辑锁获取请求应被拒绝，避免导出过程中页面继续被修改。
- 新增可选服务端同步导出超时配置 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS`；默认不启用，由 CMS HTTP 客户端控制等待时间。
- 导出期间 CMS 数据、CMS 资源或外部资源读取失败时返回 `export_upstream_failed`，不得返回半成品 ZIP。
- 保持现有浏览器异步导出 job API、导出 UI、下载 URL、报告语义和 standalone 模式兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-cms-integration`: 增加 CMS server-to-server 同步静态 ZIP 导出 API、导出错误码、登录态校验和超时配置要求。
- `page-builder-offline-static-export`: 要求静态导出核心可被浏览器异步 job 与 CMS 同步导出共用，并定义同 workspace 导出互斥与同步导出失败语义。
- `page-builder-cms-rendering-static-export`: 要求 CMS 同步导出沿用现有 CMS islands 静态化、任务级查询缓存和结构化失败上浮语义。
- `page-builder-edit-lock`: 要求 CMS 同步导出活动期间项目被视为 busy，并拒绝新的编辑锁获取。

## Impact

- API：新增 `POST /api/integrations/cms/projects/:projectId/export`。
- 配置：新增 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS`，默认 `0` 表示不启用 PageBuilder 服务端超时。
- 后端路由：`apps/app/src/main/http/routes/cms-integration.ts`。
- CMS integration 模块：新增或扩展 `cms-sync-export-service.ts`、`cms-integration-config.ts`、`cms-integration-errors.ts`。
- 静态导出核心：`apps/app/src/main/lib/page-builder-static-export-service.ts`、`page-builder-static-export-paths.ts`。
- 项目 busy 检查：`page-builder-edit-lock-service.ts`、Agent 活跃状态和现有导出活动状态。
- 共享类型与前端展示：`packages/shared/src/types/agent.ts` 和 page-builder 前端项目 busy 展示 fallback 需要识别导出 busy 状态。
- 测试：新增 CMS integration route 测试、静态导出核心复用测试、edit lock/export busy 测试，并保持现有浏览器异步导出测试通过。
- 文档与部署示例：补充 `.env.example` 中同步导出超时配置；完整 Docker 联调仍由后续部署验证 change 收口。
