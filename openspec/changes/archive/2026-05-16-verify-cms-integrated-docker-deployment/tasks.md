## 1. Docker 配置与现有资产对齐

- [x] 1.1 检查 `build/docker-compose.yml`、`build/.env.example`、`build/start-page-builder.sh` 和 Dockerfile 中 CMS 集成变量是否完整，补齐缺失的 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 等运行时输入。
- [x] 1.2 确认 Docker 对外只要求配置 `AI_PAGE_BUILDER_*`，并在 app 容器启动边界把 `AI_PAGE_BUILDER_CONFIG_DIR`、`AI_PAGE_BUILDER_SDK_HOME`、`AI_PAGE_BUILDER_CMS_BASE_URL` 等必要变量映射到内部 `PROMA_*`。
- [x] 1.3 修正默认 Playwright sidecar 相关测试和文档描述，确保 spec、compose、start script 都表达“默认启动 sidecar”。
- [x] 1.4 调整 `start-page-builder.sh` 或文档中的启动提示，在配置 base path 时输出正确的浏览器访问地址。

## 2. 本地 CMS Mock 与 Nginx 验证拓扑

- [x] 2.1 新增独立 CMS 集成验证 compose 或 overlay，保留默认 standalone compose 不被 `cms-mock` / `nginx` 污染。
- [x] 2.2 新增最小 `cms-mock` 服务，支持 `/ui/login`、builder/preview 打开测试入口；preview/export fixture 写入由测试 harness 通过宿主挂载、共享验证卷或 `docker exec` 完成，不新增生产 PageBuilder debug API。
- [x] 2.3 新增本地 Nginx 配置，暴露同源 `/pagebuilder` 入口并代理到 PageBuilder Web，同时保证 `Authorization`、`X-CMS-Cookie`、`Host` 或等效 forwarded host、可信 `X-Forwarded-Proto` 等 header 不丢失。
- [x] 2.4 在验证拓扑中固定并记录 public base path 只剥离一次的规则，覆盖 `/pagebuilder/api/...` 到 Server `/api/...` 的链路。

## 3. Docker/E2E 验证脚本

- [x] 3.1 增加可重复执行的 CMS 集成 Docker 验证脚本或 Playwright harness，用于启动/复用验证拓扑并执行 smoke 流程。
- [x] 3.2 验证 CMS mock 或测试 harness 经 Nginx 公开 `/pagebuilder/api/integrations/cms/projects` 创建项目后，project binding、workspace 和 session 落在容器持久化目录。
- [x] 3.3 验证 `target: "builder"` handoff 在 iframe 和新窗口两种方式下都能进入 `/pagebuilder/builder/:workspaceId/:sessionId` 并加载 builder context。
- [x] 3.4 通过 fixture 准备 `workspace-files/index.html` 和必要静态子资源，验证 `target: "preview"` handoff 在 iframe 和新窗口两种方式下都能打开 workspace preview。
- [x] 3.5 验证无 access cookie 直接访问 builder URL、builder context、session API 和 workspace preview URL 时被拒绝。
- [x] 3.6 验证 HTTP E2E 下 access cookie 不带 `Secure`、Path 匹配 base path；通过 route/prod-server 测试或可选 Nginx HTTPS/forwarded-proto overlay 验证 HTTPS public origin 或可信 forwarded proto 下 access cookie 带 `Secure`。
- [x] 3.7 验证 builder HTML 和 workspace preview HTML 包含 `frame-ancestors 'self'` 且不设置 `X-Frame-Options: DENY`。
- [x] 3.8 验证前端网络请求、preview iframe、workspace-scoped CMS 资产代理和静态资源均使用 `/pagebuilder/api/...` 或 `/pagebuilder/assets/...`，并通过 fixture 或独立 HTTP/E2E 步骤覆盖 `/pagebuilder/api/workspaces/:workspaceId/page-builder/cms/assets?url=...`，不回退到 CMS 根路径 `/api/...` 或旧全局 CMS asset proxy。
- [x] 3.9 验证 CMS 同步导出接口在容器内返回 `application/zip`，且 ZIP 包包含 `index.html`。
- [x] 3.10 验证同一浏览器内多个 CMS handoff 使用不同 workspace-scoped access cookie，可同时访问各自 builder context，不会互相覆盖。

## 4. 文档与生产前检查清单

- [x] 4.1 更新 `docs/page-builder-docker-compose-deployment.md`，删除 root-only/subpath 不支持的过期描述。
- [x] 4.2 补充 standalone Docker、CMS 集成 Docker、本地 cms-mock/nginx 验证的启动命令、环境变量示例和访问 URL。
- [x] 4.3 文档明确生产环境可由 CMS/Nginx 挂载 `/pagebuilder`，但 public base path 只能由一层剥离一次。
- [x] 4.4 文档明确 `AI_PAGE_BUILDER_CMS_BASE_URL` 是 CMS 管理端 API base URL，用于 `/ui/login`，不是 CMS Site URL。
- [x] 4.5 文档补充反向代理必须保留 `Authorization`、`X-CMS-Cookie`、Host/forwarded proto 的要求。
- [x] 4.6 文档补充 Cookie Path/Secure、CSP `frame-ancestors 'self'`、不得设置 `X-Frame-Options: DENY` 的检查项。
- [x] 4.7 文档补充 handoffId 可能进入 access log、同源脚本信任、公共前端资产与 workspace preview 资产边界等生产前风险。

## 5. 回归测试与验证

- [x] 5.1 更新 Docker asset 单测，覆盖默认 Playwright sidecar、CMS 集成变量、base path runtime 配置和 sync export timeout 传递。
- [x] 5.2 更新 PageBuilder Web prod-server 测试，覆盖 CMS 验证拓扑所需 header 透传、forwarded proto 和 base path 剥离行为。
- [x] 5.3 运行 CMS integration route、static export、edit lock 相关回归测试，确认 Change 8 没有重新破坏前 7 个 change 的业务行为。
- [x] 5.4 运行 PageBuilder app 和 page-builder 前端 typecheck。
- [x] 5.5 运行新增 Docker/CMS/Nginx E2E 验证，并记录关键命令和结果。
- [x] 5.6 运行 `openspec validate verify-cms-integrated-docker-deployment --strict`，确保 proposal/design/specs/tasks 可归档。
