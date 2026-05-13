## 1. 配置与错误码

- [x] 1.1 扩展 CMS integration config，解析 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`、`AI_PAGE_BUILDER_HANDOFF_TTL_MS`、`AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS`，并保持 `AI_PAGE_BUILDER_BASE_PATH` 缺省为空。
- [x] 1.2 为 public origin 增加 origin-only 校验，创建 handoff 时缺失、非法或带 path/query/hash 返回 `invalid_request`。
- [x] 1.3 扩展 CMS integration 错误码和 helper，新增 `project_not_found` factory、`handoff_expired`、`preview_not_ready`、`builder_access_required`、`builder_access_mismatch`。
- [x] 1.4 更新 `build/.env.example` 和 Docker compose 示例，补充 public origin、handoff TTL、access session TTL 配置且不写入真实 secret。
- [x] 1.5 补充 config/error 单元测试，覆盖 public origin、TTL 默认值、空 base path、非空 base path 和非法配置。

## 2. Handoff Service

- [x] 2.1 新增 `cms-handoff-service.ts`，实现 handoff 创建、内存存储、2 分钟默认 TTL、过期清理和 `target/openMode` 归一化。
- [x] 2.2 实现 handoff 一次性消费语义：不存在返回 404 `handoff_expired`，过期或已消费返回 410 `handoff_expired`。
- [x] 2.3 handoff 记录保存 `projectId`、`workspaceId`、`sessionId`、`target`、`openMode`、用户摘要和时间字段，不保存原始 CMS Cookie。
- [x] 2.4 补充 handoff service 单元测试，覆盖默认 target/openMode、非法 target/openMode、过期、重复消费和不保存 Cookie。

## 3. Builder Access Session Service

- [x] 3.1 新增 `builder-access-session-service.ts`，实现内存 access session 创建、过期清理、workspace/session 索引和 72 小时默认 TTL。
- [x] 3.2 实现 `ai_page_builder_access` cookie 值签名与校验，cookie 只携带签名 accessId，不携带 project/workspace/session 明文或 CMS Cookie。
- [x] 3.3 实现 `Set-Cookie` 构建逻辑，覆盖 `HttpOnly`、`SameSite=Lax`、`Path=basePath || '/'`、`Max-Age`、无 `Domain`、HTTP/HTTPS `Secure` 判定。
- [x] 3.4 新增最小 access session check helper，支持 workspace+session 匹配和 workspace-only 匹配，并映射 `builder_access_required` / `builder_access_mismatch`。
- [x] 3.5 补充 access session 单元测试，覆盖签发、签名篡改、过期、不匹配、空/非空 base path cookie path、HTTP/HTTPS Secure、preview handoff 不降级权限。

## 4. CMS Integration Routes

- [x] 4.1 扩展 `cms-integration.ts`，实现 `POST /api/integrations/cms/projects/:projectId/handoffs` 的鉴权、请求体解析和 CMS `/ui/login` 重新校验。
- [x] 4.2 创建 handoff 时通过 project binding 查找 workspace/session，并验证内部资源存在；不存在返回 `project_not_found`。
- [x] 4.3 创建 `target: "preview"` handoff 前检查 workspace preview 已就绪；未就绪返回 `preview_not_ready`。
- [x] 4.4 生成 `openUrl` 时使用 `AI_PAGE_BUILDER_PUBLIC_ORIGIN + AI_PAGE_BUILDER_BASE_PATH`，覆盖空 base path 和非空 base path。
- [x] 4.5 实现 `GET /api/integrations/cms/handoffs/:handoffId/open`，消费 handoff、签发 access cookie，并根据 target 302 到 builder 或 preview。
- [x] 4.6 实现 `GET /api/integrations/cms/builder-context`，校验 access cookie 与 workspace/session，返回最小 `projectId/workspace/session/access.expiresAt` 上下文。
- [x] 4.7 补充 HTTP route 测试，覆盖 handoff 创建成功/失败、CMS Cookie 失败、project 不存在、preview 未就绪、open 一次性消费、builder/preview redirect、builder-context 成功/401/403/404。

## 5. Preview 与 Web 响应头

- [x] 5.1 在 `workspaces.ts` 的 preview 路由接入 CMS 模式最小 access session 校验，standalone 模式保持现有行为。
- [x] 5.2 修改 `workspace-preview-service.ts`，让 preview HTML 响应包含 `Content-Security-Policy: frame-ancestors 'self'` 且不设置 `X-Frame-Options: DENY`。
- [x] 5.3 确保 CMS preview handoff 跳转不携带 `page-builder-bridge=1`，因此返回非编辑态 preview；Builder 编辑态显式参数仍按现有规则注入 bridge。
- [x] 5.4 修改 `prod-server.ts`，PageBuilder Web 代理 API 时传递 `X-Forwarded-Host` 和 `X-Forwarded-Proto`，并在 builder SPA shell HTML 响应上设置 `frame-ancestors 'self'`。
- [x] 5.5 补充 preview 和 prod-server 测试，覆盖无 access 拒绝、workspace 不匹配拒绝、匹配 access 允许 HTML/static、CMS preview 不注入 bridge、forwarded headers 和 builder shell CSP。

## 6. 验证

- [x] 6.1 运行新增 CMS handoff/access session 相关单元测试和 HTTP route 测试。
- [x] 6.2 运行受影响的 `workspace-preview-service`、`workspaces` route、`prod-server` 测试。
- [x] 6.3 运行 `bun run --filter='@ai-page-builder/app' typecheck` 和 `bun run --filter='@ai-page-builder/page-builder' typecheck`。
- [x] 6.4 运行 `openspec validate add-cms-handoff-access-session --strict`。
- [x] 6.5 运行 `git diff --check`，确认无格式或空白错误。
