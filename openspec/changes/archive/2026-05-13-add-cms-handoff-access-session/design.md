## Context

Change 1 已让 PageBuilder Web、renderer、API client 和 preview URL 支持运行时 public base path；Change 2 已建立 CMS integration config、secret 校验、`/ui/login` 校验和 `projectId -> workspaceId/primarySessionId` 持久绑定。当前仍缺少从 CMS 受控打开 builder/preview 的浏览器访问会话：CMS 只能保存 `projectId`，但 PageBuilder 的真实入口仍是内部 `workspaceId/sessionId` 和 workspace preview URL。

本 change 需要在不破坏 standalone 模式的前提下，补齐 CMS server-to-server 创建 handoff、浏览器消费 handoff、签发 PageBuilder 自身访问 cookie、builder context 查询和 workspace preview 最小保护。完整前端入口 gating、全量 sessions/workspaces/page-builder API 保护、workspace-scoped CMS 数据迁移和同步导出分别由后续 change 承担。

## Goals / Non-Goals

**Goals:**

- CMS 可以通过 `projectId` 创建短期一次性 `openUrl`，并支持 `target: "builder" | "preview"`。
- 浏览器访问 `openUrl` 后获得 `ai_page_builder_access` HttpOnly Cookie，并被重定向到真实 builder 或 workspace preview。
- PageBuilder 能通过 Builder Access Session 校验 builder context 和 workspace preview，阻止没有 handoff 的直接访问。
- access session 不保存原始 CMS Cookie，不引入 URL access token、header token 或第二套 preview-only cookie。
- 支持空 base path 和非空 base path；cookie `Path` 使用 `basePath || '/'`。
- 在最终 builder shell 和 preview HTML 上设置同源 iframe 兼容的 CSP 响应头。

**Non-Goals:**

- 不改造 `HomePage` / `BuilderPage` 的完整 CMS 集成前端流程；Change 4 负责前端先请求 builder context 再加载项目 API。
- 不系统性保护所有 session、workspace、page-builder 项目 API；Change 5 负责统一中间件、Origin/Referer 校验和滑动续期。
- 不迁移 CMS 数据浏览和 CMS 资产代理到 workspace-scoped 路由；Change 6 负责。
- 不实现 preview/edit 权限分级；builder handoff 和 preview handoff 签发同一种项目访问会话。
- 不实现跨源 iframe fallback、URL bootstrap token 或签名静态资源 URL。
- 不做 handoff/access token 日志脱敏；沿用现有 access log 行为。

## Decisions

### 1. Handoff 和 Builder Access Session 均使用内存存储

Handoff 默认 2 分钟 TTL、一次性消费；Builder Access Session 默认 72 小时 TTL。两者都不落盘，服务重启后失效，用户需要从 CMS 重新进入。

选择内存存储的原因是第一期部署前提为单 CMS、单 PageBuilder 实例，不需要跨实例共享；这也避免把短期访问状态误做成长期授权数据。后续如果需要多实例，可替换为 Redis/DB，HTTP 契约不变。

### 2. Access cookie 只保存签名 accessId

`ai_page_builder_access` 的值使用 `accessId.signature` 形式，服务端通过 HMAC 校验后用 `accessId` 查内存 session。`projectId/workspaceId/sessionId/用户摘要/expiresAt` 只保存在服务端内存中，cookie 不携带这些明文，也不保存 CMS Cookie。

签名密钥使用进程内 secret。由于 access session 本身是内存态，服务重启后 cookie 即使还在浏览器中也无法命中内存 session，会返回 `builder_access_required`，符合“从 CMS 重新进入”的语义。

### 3. `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 创建 handoff 时必填

`openUrl` 必须由 `AI_PAGE_BUILDER_PUBLIC_ORIGIN + AI_PAGE_BUILDER_BASE_PATH + /api/...` 生成。`AI_PAGE_BUILDER_PUBLIC_ORIGIN` 在 CMS 模式创建 handoff 时必须是合法 origin，不能带 path；缺失或非法时返回结构化 `invalid_request`。

不从 `Host` 或 `X-Forwarded-*` 推断 public origin，避免因为代理链、端口或协议配置不同生成不稳定 URL。`X-Forwarded-Proto` 只作为 cookie `Secure` 判定的补充信号；如果 public origin 是 `https:`，则必须设置 `Secure`。

### 4. Base path 缺省为空

`AI_PAGE_BUILDER_BASE_PATH` 继续沿用 Change 1 的规范化规则：空值或 `/` 代表空 base path。cookie path 使用 `basePath || '/'`。

因此 CMS 可以选择同源根路径集成，也可以选择 `/pagebuilder`、`/ai/pagebuilder` 等多级 base path。Change 3 的测试需要覆盖空 base path 与非空 base path 两种 URL 和 cookie path 行为。

### 5. Change 3 只实现最小 access check，不抢 Change 5 的完整中间件 owner

本 change 新增最小校验 helper，用于：

- `GET /api/integrations/cms/builder-context`：必须匹配 `workspaceId + sessionId`。
- `GET /api/workspaces/:workspaceId/preview*`：必须匹配 `workspaceId`。

该 helper 可以被后续 Change 5 扩展或替换为 `cms-builder-access-middleware.ts`。Change 3 不实现所有浏览器项目 API 的统一 Origin/Referer 校验和滑动续期，避免 scope 膨胀。

### 6. Preview handoff 打开非编辑态 preview

Builder 页面左侧 iframe 通过 `?page-builder-bridge=1` 请求编辑态 preview bridge；CMS preview handoff 302 到 `/api/workspaces/:workspaceId/preview/`，不携带该参数，因此不注入 `page-builder-preview-bridge`、编辑 overlay 或 inline edit 能力。

workspace preview HTML 仍可注入无状态 CMS rendering preview runtime，因为该 runtime 不包含项目凭据或编辑能力；具体 CMS 数据/资产代理的 workspace-scoped 化由 Change 6 完成。

### 7. CSP 设置在最终 HTML 响应上

浏览器 iframe 嵌入策略以最终 HTML 响应为准，不能只设置在 handoff open 的 302 响应上。因此：

- PageBuilder Web 返回 builder SPA shell 时设置 `Content-Security-Policy: frame-ancestors 'self'`。
- workspace preview HTML 响应也设置 `Content-Security-Policy: frame-ancestors 'self'`。
- 不设置 `X-Frame-Options: DENY`；如果已有 SAMEORIGIN 也不应与 CSP 冲突。

## Risks / Trade-offs

- [单实例内存状态] 服务重启会导致已打开页面失效 → 第一期接受；用户从 CMS 重新进入即可。
- [preview handoff 也可获得 builder 级项目访问会话] 用户拿到同项目 builder URL 时不会因 handoff target 是 preview 被单独拒绝 → 第一期接受；CMS 在创建 handoff 前负责业务权限判断，写操作仍由 edit lock 和后续 API 规则约束。
- [Change 3 只保护 preview 和 builder context] 其他项目 API 在 CMS 模式下仍需后续 Change 5 系统性保护 → 在 tasks 和 spec 中明确边界，避免误认为本 change 已完成全量鉴权。
- [根路径集成时 cookie Path=/] Cookie 会随同源根路径请求发送 → 已确认本期不处理该污染风险；access cookie 为 HttpOnly 且仅 PageBuilder 后端识别。
- [access log 记录 handoffId] handoffId 可能出现在现有 access log path 中 → 已确认本期不做脱敏或跳过。

## Migration Plan

1. 添加新模块和配置解析，默认 standalone 模式不启用任何 CMS 访问限制。
2. 在 CMS 模式下启用 handoff/open/builder-context 和 workspace preview 最小校验。
3. 更新 Docker/env 示例，补充 public origin 与 TTL 配置。
4. 用单元测试和 HTTP route 测试验证空 base path、非空 base path、HTTP/HTTPS Secure cookie、builder/preview redirect 和 preview access protection。
5. 如部署后出现问题，可关闭 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 回到 standalone 行为；已签发的内存 access session 在服务重启后自然失效。

## Open Questions

无。已确认：`AI_PAGE_BUILDER_BASE_PATH` 缺省为空，`AI_PAGE_BUILDER_PUBLIC_ORIGIN` 在 CMS 创建 handoff 时必填，access log 不做脱敏。
