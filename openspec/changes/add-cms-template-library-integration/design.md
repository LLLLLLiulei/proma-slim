## Context

当前 CMS 集成模式已经提供基于长期 `projectId` 的项目创建、handoff 打开、Builder Access Session 校验和同步导出能力；模板库能力则独立暴露在 `/api/page-builder/templates/*`，支持模板扫描、导入、预览、下载、删除、重命名和普通模板实例化。CMS 现在需要在自己的后台中导入模板、管理模板、展示模板列表并基于模板创建 AI 专题项目，但不能直接调用普通模板 `use` API，因为该 API 只返回内部 `workspace/session`，不会写入 CMS project binding，也无法进入后续 handoff/export 契约。

本变更的主要约束：

- CMS server-to-server API 必须继续通过 integration secret 鉴权。
- 每次 CMS 集成请求必须使用当前 `X-CMS-Cookie` 调用 CMS `/ui/login` 校验登录态，不能持久化原始 Cookie。
- CMS 需要拿到长期稳定 `projectId`，而不是内部 `workspaceId/sessionId`。
- 模板本身是全局静态 HTML 资源包，不按 CMS 用户或站点隔离。
- CMS 模板列表中的 `previewUrl` 必须是绝对 URL，便于 CMS 后台在同源部署下 iframe 预览，或在任意部署方式下通过新窗口打开。

## Goals / Non-Goals

**Goals:**

- 提供 CMS server-to-server 模板列表接口，返回绝对模板预览 URL。
- 提供 CMS server-to-server 模板 zip 导入接口，复用现有模板导入校验、大小限制、安全解压和原子落盘逻辑。
- 提供 CMS server-to-server 模板重命名和批量删除接口；批量删除支持 item 级部分成功/失败。
- 扩展 CMS 创建项目接口，允许传入 `templateId` 并基于模板创建受 CMS project binding 管理的 PageBuilder 项目。
- 在 project binding 中记录项目创建来源模板，支持幂等重试和模板冲突判断。
- 保持现有空项目创建、handoff、Builder Access Session 和同步导出流程兼容。

**Non-Goals:**

- 不新增模板 preview handoff；模板预览继续使用现有只读模板预览 URL。
- 不把模板按 CMS 用户、角色或 `siteId` 做权限隔离。
- 不支持已有 CMS 项目切换模板或重新套模板。
- 不改变模板预览 CSP 的跨源 iframe 策略；跨源 iframe 预览如果需要放开 `frame-ancestors`，应作为后续独立安全设计处理。
- 不让 CMS 浏览器前端直接持有或调用 integration secret；integration API 仍面向 CMS 服务端。
- 不改变普通 PageBuilder 首页模板库和 `/api/page-builder/templates/*` 的既有语义。

## Decisions

### 1. 在 CMS integration 路由中新增模板接口，而不是让 CMS 直接调用普通模板接口

CMS 模板列表、导入、重命名和批量删除新增在 `/api/integrations/cms/templates` 命名空间下。这样可以统一执行 integration secret 与 `X-CMS-Cookie` 登录态校验，并返回 CMS 需要的绝对 URL 格式。

替代方案是让 CMS 直接调用 `/api/page-builder/templates/*`。该方案无法统一校验 CMS 当前用户，也会让 CMS 对接方混用普通用户接口和集成接口，不利于长期维护。

### 2. 扩展现有 `POST /api/integrations/cms/projects` 支持 `templateId`

创建项目仍以 `externalRecordId/projectName/siteId` 为核心契约，新增可选 `templateId`。不传 `templateId` 时保持空项目创建；传入时先校验模板，再用模板内容创建 `page-builder` workspace 和 primary session，然后写入 project binding 并返回稳定 `projectId`。

替代方案是新增 `/api/integrations/cms/templates/:templateId/projects`。该方案路径表达清晰，但会复制已有项目创建的鉴权、幂等、冲突和回滚语义；扩展现有创建接口更符合 CMS “创建 AI 专题项目”这一个业务动作。

### 3. 模板项目必须写入 CMS project binding，而不是返回内部 workspace/session

CMS 后续打开构建页、预览和导出都依赖长期 `projectId`。因此模板实例化不能直接复用普通 `POST /api/page-builder/templates/:templateId/use` 的响应契约，而应复用或抽取其内部“复制模板文件并创建 workspace/session”的能力，再由 CMS binding store 管理对外项目身份。

### 4. 使用 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 构造绝对模板预览 URL

CMS 模板列表返回的 `previewUrl` 使用：

```text
AI_PAGE_BUILDER_PUBLIC_ORIGIN + AI_PAGE_BUILDER_BASE_PATH + /api/page-builder/templates/:templateId/preview/
```

如果 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 缺失或非法，CMS 模板列表和模板导入响应无法可靠返回绝对 URL，应返回 `invalid_request`，并且不从 `Host` 或 `X-Forwarded-Host` 推断。模板导入接口必须在写入模板目录之前完成该校验，避免先导入成功再因为无法生成绝对 `previewUrl` 而留下副作用。该规则与现有 handoff openUrl 的 public origin 设计保持一致。

### 5. project binding 增加 `sourceTemplateId`，并把模板不一致视为冲突

首次基于模板创建项目时，binding 写入 `sourceTemplateId`。后续同一 `externalRecordId` 幂等重试时：

- `siteId` 不一致：`project_conflict`。
- 已有 `sourceTemplateId` 与本次 `templateId` 不一致：`project_conflict`。
- 已有空项目，本次传入 `templateId`：`project_conflict`。
- 已有模板项目，旧客户端不传 `templateId`：兼容返回已有 `projectId`。

这样避免 CMS 误以为“已按模板创建”，实际却复用了另一个模板或空项目。

### 6. 固定 CMS 模板错误码

CMS 对接方需要根据错误码做稳定分支。模板导入相关错误使用固定 CMS integration 错误码：`template_not_found`、`template_import_invalid`、`template_size_limit`、`template_import_forbidden` 和 `template_import_failed`。模板重命名和删除相关错误使用 `template_not_found`、`template_operation_forbidden` 和 `template_operation_failed`；请求体格式错误、缺少 multipart `file` 或 `templateId/templateIds/name` 类型非法仍使用既有 `invalid_request`。

### 7. 批量删除采用部分成功响应

CMS 批量删除模板接口使用 `POST /api/integrations/cms/templates/batch-delete`，请求级鉴权、CMS 登录态和请求体格式错误会整体失败；单个模板不存在、路径非法或删除失败只写入 `failures`，后续模板继续处理。系统会按首次出现顺序对 `templateIds` 去重，避免同一次请求重复删除同一模板导致误报。

## Risks / Trade-offs

- [Risk] CMS 模板列表要求绝对 URL，`AI_PAGE_BUILDER_PUBLIC_ORIGIN` 配置错误会导致列表不可用。→ 复用 handoff 的显式 public origin 约束，启动/部署文档提示必须配置。
- [Risk] 模板实例化与 project binding 写入存在半成功风险。→ 保持和现有创建项目一致的 try/catch 回滚；模板复制、session 创建或 binding 写入失败时清理本次创建的 workspace/session。
- [Risk] 模板预览当前限制 `frame-ancestors 'self'`，跨源 CMS iframe 预览不可用。→ 第一期只承诺同源 iframe；跨源部署使用新窗口预览，或后续单独设计可配置 CSP。
- [Risk] 模板库全局可见，CMS 侧无法按用户或站点隔离模板。→ 第一阶段明确非目标；后续如果需要权限隔离，再扩展模板 manifest 或独立模板 ACL。
- [Risk] 直接复用普通模板 `instantiateTemplateProject` 可能返回内部响应结构并产生额外 preview state。→ 实现时优先抽取模板实例化内部能力，CMS 路由只返回 `projectId/created/templateId` 等集成契约字段。
- [Risk] 模板导入 zip 可能较大。→ 继续使用现有 100MB 原始 zip 和 500MB 解压后大小限制，环境变量沿用现有配置。

## Migration Plan

- 向后兼容：不传 `templateId` 的 CMS 创建项目请求保持现有行为。
- Binding 兼容：读取旧 binding 时 `sourceTemplateId` 缺失表示空项目或历史项目，不影响 handoff/export。
- 回滚策略：如果新模板接口不可用，可回退到现有空项目创建；已创建的带 `sourceTemplateId` binding 仍可按普通 CMS 项目打开和导出。

## Open Questions

无阻塞性开放问题。已确认：模板列表/导入需要校验 CMS Cookie；模板列表返回绝对 URL；`externalRecordId` 已存在但模板不一致时按 `project_conflict` 处理。
