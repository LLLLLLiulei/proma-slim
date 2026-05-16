## Why

前 7 个 CMS 集成 change 已分别实现 base path、project binding、handoff/access session、前端入口 gating、项目 API 保护、workspace-scoped CMS 数据和同步导出，但目前缺少一个可复现的 Docker 级闭环验证来证明这些能力在真实同源反代部署下能一起工作。

本变更用于收口第一期 CMS 集成部署：补齐 Docker 配置、文档、本地 CMS mock/Nginx 验证拓扑和端到端测试，避免业务代码已完成但生产挂载、header 透传、Cookie、base path 或导出链路在部署时才暴露问题。

## What Changes

- 补齐 PageBuilder Docker 配置入口，确保 `AI_PAGE_BUILDER_INTEGRATION_MODE`、public origin、base path、CMS base URL、integration secret、handoff/access TTL、同步导出超时等变量能在容器运行时生效。
- 明确 Docker 对外 `AI_PAGE_BUILDER_*` 变量与应用内部 `PROMA_*` 变量的映射边界，避免同一配置值同时由两套命名输入导致覆盖顺序不确定。
- 修正 Docker 部署文档和 OpenSpec 中已过期的描述：PageBuilder 需要支持 root path 与 public base path，Playwright sidecar 继续作为默认部署服务启动。
- 新增本地 CMS mock / Nginx 验证拓扑，用于模拟 CMS 同源反代、`/ui/login` 校验、iframe/new window 打开、preview 和同步导出链路。
- 增加 Docker/E2E 验证脚本或测试 harness，覆盖 `/pagebuilder` base path、header 透传、access cookie、CSP/XFO、直接 URL 防绕过、preview 和 ZIP 导出。
- 补充生产前风险检查项，包括 handoffId 访问日志暴露、同源脚本信任、public asset 与 workspace preview asset 边界、Cookie Path/Secure 和反代 prefix 剥离规则。
- 保持 Change 8 只做部署验证与 wiring 收口，不重新拥有前 7 个 change 的业务实现。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-docker-deployment`: 增加 CMS 集成 Docker 运行配置、默认 Playwright sidecar 语义、本地 CMS mock/Nginx 同源验证拓扑、base path 部署验证和生产前部署检查要求。
- `page-builder-cms-integration`: 增加 CMS 集成第一期在 Docker 同源反代环境下必须可端到端验证的要求，覆盖 project binding、handoff builder/preview、Builder Access Session、workspace-scoped API 和同步导出闭环。

## Impact

- 部署资产：`build/.env.example`、`build/docker-compose.yml`、`build/start-page-builder.sh`、`build/Dockerfile.page-builder-app`、`build/Dockerfile.page-builder-web`。
- 新增或调整本地验证资产：CMS mock 服务、Nginx 配置、测试 compose/overlay、E2E 脚本或 Playwright harness。
- 文档：`docs/page-builder-docker-compose-deployment.md` 及相关 CMS 集成部署说明。
- 测试：Docker asset 单测、PageBuilder Web prod-server 单测、CMS integration HTTP route 回归、Docker/Nginx/Playwright E2E。
- 不修改真实 CMS 系统，不新增跨源 iframe token fallback，不引入多实例分布式 session 或业务权限模型。
