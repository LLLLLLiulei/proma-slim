## Context

现有 PageBuilder 静态导出由 `PageBuilderStaticExportService` 以浏览器异步 job 方式提供：创建 job、后台执行 `runJob()`、轮询状态、完成后通过下载 URL 获取 ZIP。该实现已经包含 workspace-files 复制、CMS islands 服务端渲染、远程资源本地化、导出报告和 ZIP 打包能力。

CMS 集成第一期的发布流程需要 CMS Server 在一次 server-to-server 调用中同步拿到 ZIP。该调用使用长期稳定 `projectId`，并通过 integration secret 与当前请求的 `X-CMS-Cookie` 校验 CMS 用户登录态。同步导出不应依赖浏览器 Builder Access Session，也不应创建浏览器异步 job 后轮询等待。

## Goals / Non-Goals

**Goals:**

- 提供 `POST /api/integrations/cms/projects/:projectId/export`，成功时同步返回 ZIP。
- 复用现有静态导出能力，避免浏览器异步导出和 CMS 同步导出分叉。
- 在导出前和导出期间保证同 workspace 不被并发编辑、Agent 构建或另一个导出流程破坏。
- 让同步导出错误以 CMS integration 结构化错误返回，尤其是 `project_busy`、`export_upstream_failed`、`export_timeout`。
- 保持 standalone 模式、浏览器异步导出 job、导出 UI 和现有报告语义兼容。

**Non-Goals:**

- 不新增 CMS 异步导出 API。
- 不改造浏览器侧导出 UI 或下载交互。
- 不切换 CMS 数据读取到 UI Gateway，也不把本次 `X-CMS-Cookie` 注入长期 CMS 数据读取链路。
- 不实现多实例分布式导出锁；第一期仍按单 PageBuilder 实例内存状态处理。
- 不在 Change 7 做完整 Docker/E2E 部署闭环；该收口由后续部署验证 change 负责。

## Decisions

### Decision 1: 抽出共享导出核心，而不是用异步 job 模拟同步导出

将 `PageBuilderStaticExportService.runJob()` 中与 job 状态无关的导出流程抽成可复用核心，例如 `exportWorkspaceStaticPackage(workspace, options)`。核心负责：

- 准备 artifact/staging/report/package 路径。
- 复制 `workspace-files/`。
- 执行 CMS islands SSR。
- 扫描 HTML/CSS 并处理远程资源。
- 写入 `export-report.json`。
- 打包 ZIP 并返回 artifact 信息。

浏览器异步 job 通过 `onPhase` 回调更新 job snapshot；CMS 同步导出直接等待核心完成并返回 ZIP。

Rationale: 异步 job 外壳会吞掉失败并转成 failed snapshot，不适合 CMS 同步 API 精确映射 HTTP 错误；轮询等待也会引入 job 生命周期、下载 URL、超时和清理语义的额外复杂度。

Alternative considered: CMS 同步 API 创建异步 job 后内部轮询直到完成。该方案会污染浏览器 job 状态、无法稳定阻止半成品响应，并让超时后 job 是否继续运行变得不透明，因此不采用。

### Decision 2: 同 workspace 导出使用统一活动 guard

新增或扩展 `PageBuilderStaticExportService` 的 workspace export activity 管理，使浏览器异步 job 与 CMS 同步导出共用同一互斥边界。

语义：

- 浏览器异步 job 已存在时，浏览器再次创建仍保持现有“返回活动 job snapshot”行为。
- CMS 同步导出遇到任意同 workspace 活动导出时返回 `409 project_busy`。
- CMS 同步导出活动期间，浏览器创建异步导出应被拒绝或映射为项目 busy，不创建第二个并发导出。
- 导出核心结束或失败后释放 workspace export activity。

Rationale: 同一 workspace 同时复制、改写 staging 和打包会造成资源竞争和发布结果不稳定；CMS 发布语义比浏览器导出更严格，遇到并发应明确失败而不是复用另一个 job 的结果。

### Decision 3: 同步导出期间项目视为 edit-lock busy

同步导出开始后，`page-builder-edit-lock-service` 应将该 workspace 视为 busy，并拒绝新的编辑锁获取。导出前仍先检查已有有效 edit lock 和活跃 Agent；导出期间再阻止新的编辑会话进入。

实现上可把 edit lock service 的 busy 检测从 `isWorkspaceAgentActive` 扩展为项目 busy provider，或显式增加 `isWorkspaceStaticExportActive` 依赖。共享类型 `PageBuilderProjectEditState.reason` 需要增加 `export`，用于准确表达“正在导出”。

Rationale: 只做导出前检查存在竞态：导出检查通过后，用户立即获取编辑锁并修改文件，CMS 可能发布混合状态。导出期间阻止新 edit lock 才能让“发布包来自稳定 workspace-files 快照”的语义成立。

Alternative considered: 仅在导出开始时快速复制 workspace-files，复制完成后允许编辑。该方案仍需要清晰表示复制窗口内的互斥，而且 CMS islands SSR 和资源解析依赖 staging 后续状态；第一期直接把整个导出过程视为 busy 更简单可靠。

### Decision 4: 同步导出默认不启用 PageBuilder 服务端超时

`AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 缺省为 `0`，表示 PageBuilder 不主动中断同步导出。CMS HTTP 客户端自行决定等待时间。

显式配置正数时，route 层采用 soft timeout：超过时间则返回 `504 export_timeout`；底层导出流程尽量自然结束并释放 activity guard，不向 CMS 返回半成品 ZIP。第一期不要求给所有 fetch、文件操作和 CMS SSR 链路接入硬中断 `AbortSignal`。

soft timeout 的后台导出 Promise 必须被继续 observe：无论后续 resolve 还是 reject，都需要完成日志记录、错误吞吐边界和 workspace export activity guard 释放，不能产生未捕获 rejection，也不能让 workspace 永久保持 busy。

Rationale: 导出过程中涉及文件系统、CMS 数据预取、远程资源下载和 ZIP 打包，完整硬中断会显著扩大改造面。soft timeout 能满足 HTTP 响应语义，同时降低对现有异步导出核心的影响。

### Decision 5: CMS Cookie 只用于当前导出请求登录态校验

同步导出的 `X-CMS-Cookie` 只用于调用 CMS `/ui/login` 验证当前 CMS 用户仍有效。导出核心中的 CMS 数据/资产读取第一期仍沿用现有 `CmsGateway` 与既有 CMS 配置，不把原始 Cookie 写入 binding、Agent 消息、workspace 文件、report 或长期运行态。

Rationale: 这与第一期整体集成边界一致，避免把短期用户 Cookie 混入长期 CMS 数据读取链路。后续若切换到 UI Gateway，再单独设计短期活动凭据注入。

### Decision 6: 同步导出错误只返回结构化 JSON，不返回部分 ZIP

同步导出只有在导出核心完整成功并存在 ZIP 文件时才返回 `application/zip`。任一前置检查失败或导出期关键资源失败都返回 JSON 错误：

- `invalid_request`：请求体或参数非法。
- `integration_unauthorized`：secret 缺失或错误。
- `cms_login_expired` / `cms_login_unavailable`：CMS 登录态校验失败或不可用。
- `project_not_found`：project binding 或内部 workspace/session 不存在。
- `project_busy`：编辑锁、Agent、无 `index.html`、已有导出或其他不可安全导出的状态。
- `export_upstream_failed`：CMS 数据、CMS 资源或外部资源处理失败。
- `export_timeout`：显式配置超时时发生 soft timeout。

Rationale: CMS 发布流程不能接收半成品包；结构化错误便于 CMS 侧给用户明确提示并阻止发布旧包冒充最新结果。

## Risks / Trade-offs

- [Risk] soft timeout 返回后底层导出可能仍在运行一小段时间。→ Mitigation: workspace export activity guard 必须直到导出流程清理完成才释放，期间后续导出和编辑锁获取仍返回 busy；后台 Promise 必须被 observe，完成后释放 busy 状态。
- [Risk] 增加 `editState.reason = "export"` 会影响前端展示映射。→ Mitigation: 同步更新共享类型和相关展示 fallback，测试覆盖导出 busy 状态。
- [Risk] 抽取静态导出核心时可能改变现有浏览器异步 job 行为。→ Mitigation: 保持现有 job API、phase、report、downloadUrl 语义，并运行现有静态导出测试。
- [Risk] CMS 同步导出不使用 `X-CMS-Cookie` 读取 CMS 数据，可能让当前用户权限与导出数据读取权限不完全一致。→ Mitigation: 第一阶段明确只校验登录态，CMS 发布权限仍由 CMS 自身判断；后续 UI Gateway change 再处理短期活动凭据。
- [Risk] 单实例内存 activity guard 在进程重启后丢失。→ Mitigation: 第一阶段部署约束为单实例；重启会中断同步请求，CMS 侧应按发布失败处理。

## Migration Plan

1. 新增错误码和配置读取，默认 standalone 行为不变。
2. 抽出共享导出核心，并让现有浏览器异步 job 先通过测试。
3. 增加 workspace export activity guard 与 edit lock busy 检测。
4. 新增 CMS 同步导出 service 与 route。
5. 补充 route、service、edit lock 和静态导出测试。
6. 若需要回滚，移除新 route 并保留原异步 job 路径；由于未改变持久化数据结构，回滚不需要数据迁移。

## Open Questions

无阻塞问题。默认采用“同步导出期间阻止新的编辑锁获取”和“显式超时时 soft timeout”的语义。
