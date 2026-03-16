## Context

当前工程已经完成从 Electron 到 Bun + React Web 应用的主迁移，但仍残留若干明显的过渡态代码：

- renderer 侧还留有 `ModeSwitcher`、`NavigatorPanel`、`AppShellContext`、`session-context`、占位组件和空 SidePanel 等旧壳。
- renderer API 仍暴露 `proxy-settings` 相关请求包装，但设置页已明确移除代理设置入口。
- 主进程存在未被引用的遗留模块，如 `app-lifecycle.ts`、`mcp-validator.ts`、`memos-client.ts`。
- `@proma/shared` 仍导出 `github`、`system-prompt`、`chat-tool`、`feishu` 等旧域类型；`config-paths.ts` 也保留对应路径助手。
- 代理运行链路尚未完全过时：Agent 启动时仍通过 `getEffectiveProxyUrl()` 决定是否向 SDK 注入 `HTTP_PROXY` / `HTTPS_PROXY`。

这次清理的核心约束是：可以删掉无调用的管理表面和死代码，但不能破坏会话、消息流和出网代理能力。

## Goals / Non-Goals

**Goals:**
- 为已确认的死代码和冗余依赖建立明确、可执行的删除边界。
- 保留 Claude Agent 运行时真正依赖的代理解析与注入能力。
- 将共享导出面与当前产品实际能力重新对齐。
- 用最小改动完成清理，并以 typecheck 和回归验证收口。

**Non-Goals:**
- 不重写 Agent 编排链路。
- 不新增新的代理配置 UI。
- 不在这次变更里重构消息渲染或会话体验。
- 不为未来可能回归的旧功能预留兼容层。

## Decisions

### Decision 1: 将“代理运行时能力”与“代理管理表面”拆开处理

**选择**: 保留 `proxy-settings-service` 的读取能力、`system-proxy-detector` 的探测能力，以及 `agent-orchestrator` 中的环境变量注入；删除 renderer 侧代理包装，以及仅服务于已删除 UI 的代理管理表面。

**替代方案**: 为了未来可能恢复 UI，保留整条代理设置 API 链。

**理由**:
- 当前设置页已经移除代理配置入口，renderer 侧代理 API 没有任何调用者。
- 真正影响运行结果的是“读取当前配置并为 SDK 注入代理”，而不是“在应用内编辑代理设置”。
- 将两者拆开后，可以继续支持已有配置文件和系统代理，同时缩小代码面和误解空间。

### Decision 2: 按风险分层推进清理，而不是一次性全删

**选择**: 先删除已通过引用扫描确认的死代码和孤儿依赖，再处理共享导出与配置路径收口，最后做运行时验证。

**替代方案**: 一次性按目录批量删除所有看起来像旧功能的文件。

**理由**:
- 当前代码库仍处在简化后的稳定化阶段，批量删除容易把仍参与运行的代理或会话链路误删。
- 先收掉高置信度目标，可以快速降低噪音并缩小后续判断范围。

### Decision 3: 共享导出面单独治理，不混入第一批低风险删除

**选择**: 将 `packages/shared` 中旧域类型和 `config-paths.ts` 中旧配置路径助手作为第二层清理目标，统一通过 workspace 级 typecheck 验证。

**替代方案**: 跟随首批 renderer/main 文件一起立刻删光。

**理由**:
- 共享导出面影响范围更广，即使当前仓库内没有直接消费者，也需要通过全量 typecheck 兜底。
- 将这批改动单独处理，更容易定位类型层回归。

### Decision 4: 用“静态引用 + 类型检查 + 关键路径手测”三段式验证

**选择**: 先用引用扫描确认删除对象，再以 `bun run typecheck` 验证编译面，最后用关键流程手测确认会话和代理相关运行不回退。

**替代方案**: 仅依赖静态扫描工具给出的 unused 列表。

**理由**:
- 静态工具会对 barrel export、条件导入和未来保留入口产生误报。
- 代理链路属于运行时敏感路径，必须配合实际启动验证。

## Risks / Trade-offs

- **[静态分析误报]** → 可能把仅通过间接导入使用的模块当成死代码。缓解方式：删除前做 repo 级 `rg` 复核，删除后跑 workspace `typecheck`。
- **[代理行为回退]** → 如果误删了配置读取或环境变量注入逻辑，代理环境下的 Claude 调用会失败。缓解方式：将代理运行时保留为单独 capability，并做针对性回归验证。
- **[共享导出变更扩散]** → 删除 shared 导出可能引发类型层连锁修改。缓解方式：把 shared 清理放到第二层任务，并以全量 typecheck 收口。
- **[锁文件噪音]** → 依赖清理会引入 lockfile 变化。缓解方式：先删源码，再集中更新依赖与锁文件，减少反复 churn。

## Migration Plan

1. 先完成低风险死代码清理：renderer 壳层、无调用 API 包装、未引用主进程模块。
2. 再处理 shared 导出与 `package.json` 依赖收口。
3. 最后运行 typecheck 与关键路径验证，确认会话发送、页面加载和代理注入仍正常。

## Open Questions

- 是否同时删除 `/api/proxy-settings*` 路由，取决于这次实现中是否明确将“应用内代理管理”认定为废弃表面；如果保留，只能作为过渡，不应再暴露 renderer 调用包装。
