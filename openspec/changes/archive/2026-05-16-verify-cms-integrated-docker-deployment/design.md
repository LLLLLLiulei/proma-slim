## Context

CMS 集成第一期已经被拆成 7 个业务 change 并逐步落地：base path、CMS project binding、handoff/access session、集成模式前端入口、项目 API 保护、workspace-scoped CMS 数据以及 CMS 同步导出。当前剩余风险不在单个业务模块，而在 Docker 运行时和同源反代后的组合行为：环境变量是否传入容器、Nginx 是否保留关键 header、`/pagebuilder` base path 是否只剥离一次、`ai_page_builder_access_*` workspace-scoped Cookie 是否按 Path/Secure 生效并支持同一浏览器多项目并行编辑，以及 preview/export 是否能在容器持久化目录中正确读取产物。

现有 `build/` 资产已经有 `server`、`web`、`playwright` 三个服务和 `~/.ai-page-builder` 持久化目录；当前实现也已经让 Playwright sidecar 默认启动。因此本 change 应把文档/spec 与当前默认 sidecar 语义统一，并新增一个独立的 CMS 集成验证拓扑，而不是改变默认 standalone 部署的主路径。

## Goals / Non-Goals

**Goals:**

- 让默认 Docker standalone 部署继续可启动、可访问、可持久化。
- 让 Docker CMS 集成模式能显式配置并验证 `/pagebuilder` 同源 base path。
- 补齐 `AI_PAGE_BUILDER_*` 运行时变量到容器和必要 `PROMA_*` 内部变量的映射。
- 提供本地 `cms-mock` / `nginx` 验证拓扑，复现 CMS 同源反代、`/ui/login`、handoff iframe/window、preview 和同步导出。
- 提供可重复执行的 E2E 或验证脚本，不依赖真实 CMS，也不依赖真实大模型生成页面。
- 更新 Docker 部署文档，明确生产部署时 prefix 剥离、header 透传、Cookie、CSP/XFO 和日志风险。
- 验证同一浏览器连续打开多个 CMS 专题项目时，不会因为后打开项目覆盖前一个项目的 Builder Access Session 而导致旧页面误报 `builder_access_mismatch`。

**Non-Goals:**

- 不修改真实 CMS 系统、真实 CMS 网关或生产 Nginx 配置。
- 不重新实现 project binding、handoff/access session、API 保护、workspace-scoped CMS 数据或同步导出业务逻辑。
- 不新增跨源 iframe token fallback、preview-only cookie 或 edit/preview 权限分级。
- 不引入多 CMS、多租户、多实例分布式 session/edit lock/export lock。
- 不把 E2E 验证建立在真实大模型响应上。

## Decisions

### Decision 1: CMS 验证拓扑使用独立 compose overlay，不污染默认部署

新增本地验证资产时，默认 `build/docker-compose.yml` 仍负责常规 `server`、`playwright`、`web` 部署；CMS 集成验证通过单独 overlay 或专用验证 compose 增加 `cms-mock` 和 `nginx`，并覆盖必要环境变量。

推荐形态：

```text
build/docker-compose.yml              # 默认 standalone 基础服务
build/docker-compose.cms-verify.yml   # 增加 cms-mock/nginx 并设置 CMS 集成 env
build/nginx/cms-verify.conf           # 本地同源 /pagebuilder 反代规则
build/cms-mock/*                      # 最小 CMS mock 服务
```

Rationale: 默认用户只需要启动 PageBuilder，不应被 CMS mock 或 Nginx 复杂度影响；而 CMS 集成验证需要固定 base path、public origin、mock `/ui/login` 和 header 透传，适合独立 overlay。

Alternative considered: 直接把 `cms-mock` 和 `nginx` 放进默认 compose。该方案会让 standalone 启动路径变重，并混淆默认入口是 `web` 还是 `nginx`，因此不采用。

### Decision 2: Playwright sidecar 继续默认启动，并修正旧 spec 口径

当前 compose 和 start script 已经默认启动 `playwright` sidecar，且用户已确认保持该语义。本 change 不回退到 profile 可选模式，而是把 `page-builder-docker-deployment` 中“profile 可选”的旧要求移除，改为默认 sidecar。

默认语义：

- `server`、`playwright`、`web` 默认一起启动。
- `playwright` 不暴露宿主端口，只在 compose 内部网络提供 MCP HTTP 端点。
- `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL` 和 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 默认指向 compose 内部地址，但仍允许覆盖为空或其他地址。

Rationale: 当前 PageBuilder Agent 在 Docker 内需要稳定的浏览器自动化运行面；默认 sidecar 能减少“容器内无浏览器/无法访问本机 Playwright”的不确定性。

Alternative considered: 恢复 profile 可选。该方案会与现有实现和用户确认冲突，并降低 Docker 内 Agent 预览验证的默认可用性。

### Decision 3: 本地 Nginx 验证固定为“只剥离一次”的可观察路径

本地验证必须检查浏览器实际看到的是 `/pagebuilder/...`，而 PageBuilder Server 内部收到的仍是 `/api/...`。为了避免实现和文档混淆，验证拓扑应明确 prefix 处理责任：本地验证可以选择 Nginx 保留 `/pagebuilder` 前缀转发给 PageBuilder Web，由 PageBuilder Web 剥离一次；也可以选择 Nginx 剥离后转发根相对路径，但必须在文档中说明只允许一层剥离。

本 change 推荐本地 E2E 采用“保留前缀到 Web”的模式：

```text
Browser: /pagebuilder/api/status
Nginx:   proxy to web with /pagebuilder/api/status
Web:     strip /pagebuilder once -> /api/status
Server:  receives /api/status
```

同时部署文档保留生产可选说明：如果生产 Nginx 已剥离 `/pagebuilder`，PageBuilder Web 将收到 `/api/...` 并按 root upstream 处理；不要再在另一层二次重写成 `/pagebuilder/pagebuilder/...` 或错误剥离。

本地验证中的 CMS mock 或测试 harness 应优先通过 Nginx 暴露的公开 `/pagebuilder` 入口调用 PageBuilder 集成接口，而不是直接绕过 Nginx 调用 compose 内部 `server` 服务。这样才能同时验证 public base path、header 透传、forwarded proto/host 和 Web 代理剥离规则。

Rationale: 本地保留前缀能同时验证 Nginx 同源入口和 PageBuilder Web 的 runtime base path 处理；“只剥离一次”才是生产可迁移约束。

### Decision 4: CMS mock 只实现验证所需最小契约

`cms-mock` 不模拟完整 CMS 业务系统，只提供验证 PageBuilder 需要的最小能力：

- `GET /ui/login`：按 `Cookie` header 返回已登录或未登录结构。
- 一个或多个测试页面：触发 CMS server-to-server 创建项目、创建 handoff，并以 iframe 或 window 打开返回的 `openUrl`。
- 必要的测试辅助能力：由测试 harness 通过宿主挂载、共享验证卷或 `docker exec` 读取 project binding 并写入最小 `workspace-files/index.html` fixture，使 preview/export 可测。

Rationale: Change 8 目标是验证 PageBuilder 部署闭环，不应把真实 CMS 记录、权限、发布流程复制进仓库。fixture 注入能避免依赖真实大模型生成页面，使 E2E 稳定可重复。

测试 fixture 写入不得新增 PageBuilder 生产 debug API。若需要辅助写入，优先由测试脚本在宿主机持久化目录中操作，或通过 test-only 容器共享同一验证卷完成；`cms-mock` 可以承载测试页面和模拟 CMS server-to-server 调用，但不应成为生产 PageBuilder API 的后门。

Alternative considered: 通过真实 Agent 对话生成页面后再预览/导出。该方案会依赖上游大模型耗时和输出稳定性，不适合作为部署 smoke/E2E 的基础。

### Decision 5: Docker 外部变量使用 `AI_PAGE_BUILDER_*`，内部兼容只在 entrypoint 边界映射

Docker 对外配置只暴露 `AI_PAGE_BUILDER_*` 命名；确需兼容现有内部库时，在容器启动命令或 entrypoint 中映射到 `PROMA_*`：

```text
AI_PAGE_BUILDER_CONFIG_DIR     -> PROMA_CONFIG_DIR
AI_PAGE_BUILDER_SDK_HOME       -> PROMA_CLAUDE_HOME
AI_PAGE_BUILDER_CMS_BASE_URL   -> PROMA_CMS_BASE_URL
AI_PAGE_BUILDER_CMS_USERNAME   -> PROMA_CMS_USERNAME
AI_PAGE_BUILDER_CMS_PASSWORD   -> PROMA_CMS_PASSWORD
```

新增 CMS 集成配置继续由应用直接读取 `AI_PAGE_BUILDER_*`，例如 integration mode、public origin、base path、secret、handoff/access TTL、sync export timeout。

Rationale: 统一外部命名能降低部署者认知成本；保留内部映射能避免一次性重构旧 CMS gateway 和运行态目录读取逻辑。

### Decision 6: E2E 验证分层执行，避免把 Docker smoke 做成慢速全量业务测试

建议验证分三层：

1. 静态/单元层：检查 compose、Dockerfile、`.env.example`、start script、文档中关键变量和 sidecar 语义。
2. HTTP 层：复用现有 route/prod-server 测试，覆盖 header 透传、base path proxy、Cookie Secure/Path、结构化错误。
3. Docker/E2E 层：启动本地 cms-mock/nginx/PageBuilder，执行创建项目、写入 preview fixture、builder/preview handoff、直接 URL 防绕过和同步导出 ZIP。

Rationale: Docker E2E 代价高且容易受本机 Docker 状态影响；静态和 HTTP 测试能快速发现大部分 wiring 回归，Docker E2E 用于最终闭环验证。

### Decision 7: Cookie Secure 验证拆分为 HTTP E2E 与可信 forwarded proto/route 测试

本地 Nginx 验证拓扑默认以 HTTP 方式验证 iframe/new window、Cookie Path 和 non-Secure 行为；`Secure` 行为不强制要求本地生成 TLS 证书。`Secure` 相关断言可以通过两种方式补齐：

- HTTP route/prod-server 测试传入 `AI_PAGE_BUILDER_PUBLIC_ORIGIN=https://...` 或可信 `X-Forwarded-Proto: https`，验证 `Set-Cookie` 带 `Secure`。
- 如实现成本可控，可增加 Nginx HTTPS overlay 作为补充，但它不是 Change 8 的唯一验收路径。

Rationale: 本 change 关注 PageBuilder 对浏览器侧协议的判定语义，而不是测试本机 TLS 证书管理。把 Secure 验证拆到 route/proxy 层能减少 E2E 环境依赖，同时覆盖真实生产中 TLS 终止后通过 forwarded proto 表达 HTTPS 的关键路径。

## Risks / Trade-offs

- [Risk] 本地验证拓扑与真实生产 Nginx 配置不完全一致。→ Mitigation: 文档明确“只剥离一次”和必须保留 `Authorization`、`X-CMS-Cookie`、`Host` 或等效 forwarded host、`X-Forwarded-Proto` 的原则，并把本地 conf 作为参考而非生产唯一配置。
- [Risk] E2E 直接写入 workspace fixture 与真实 Agent 生成路径不同。→ Mitigation: 本 change 只验证部署和访问闭环；真实 Agent 生成能力已有独立测试和人工验证，不作为 Docker smoke 的前置。
- [Risk] 默认启动 Playwright sidecar 增加资源占用。→ Mitigation: 维持当前用户确认的默认行为，并允许通过环境变量覆盖 server 使用的 MCP 地址；如未来要 profile 化需另开 change。
- [Risk] handoffId 出现在本地 Nginx 或 PageBuilder access log 中。→ Mitigation: 第一阶段不做全局脱敏重构，但部署文档必须把公网生产前的 access log 脱敏/跳过策略列为检查项。
- [Risk] 多层代理下 `Secure` 判定可能依赖错误的 proto。→ Mitigation: 验证 `AI_PAGE_BUILDER_PUBLIC_ORIGIN=https://...` 和可信 `X-Forwarded-Proto: https` 两条路径；文档要求只信任受控网关传入的 forwarded header。

## Migration Plan

1. 更新 OpenSpec delta，统一 Docker sidecar、base path 和 CMS 集成验证要求。
2. 补齐 Docker env wiring 和 `.env.example`，确保 Change 1-7 的运行时变量在容器内可见。
3. 新增或调整 Docker 文档，删除 root-only/subpath 不支持等过期描述。
4. 新增 cms-mock/nginx 本地验证资产和执行脚本。
5. 补齐静态、HTTP、Docker/E2E 测试。
6. 回滚时可移除新增验证 overlay、mock、nginx conf 和文档调整；默认 `server/playwright/web` 部署仍应可独立启动。

## Open Questions

无阻塞问题。已确认：允许新增本地 `cms-mock` / `nginx` compose；Playwright sidecar 继续保持默认启动。
