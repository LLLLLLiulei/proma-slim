## Context

当前仓库已经从 Electron 多模块产品收敛为 Bun + React 的 Web Agent 应用，但仍残留若干不同层级的历史代码：

- renderer 中存在没有任何生产消费者的组件、工具函数、barrel 导出和设置页 primitive。
- 活跃文件中仍暴露一批仅服务于旧 Team、旧高级参数、旧设置模型或旧 provider 体系的无消费者导出。
- main 侧仍保留若干 HTTP 管理接口和 helper，它们没有前端入口，也不参与当前 Bun Web Agent 运行主链。
- `packages/shared` 里仍导出旧 Chat/Channel 类型域，这些类型大多对应已删除功能，只剩零散兼容引用。

本次清理的核心约束是：只能删除“已证实无用”的代码，不能把“当前没有 UI，但仍在运行主链中参与代理、会话、SSE、权限或持久化”的能力一并删掉。

## Goals / Non-Goals

**Goals:**
- 用明确、可复核的标准识别当前 Web Agent 代码库中的无用代码。
- 删除高置信度死文件、孤儿导出和无消费者管理表面。
- 保留当前 Bun Web Agent 的核心运行时能力：会话 CRUD、消息流、Permission/AskUser、消息持久化、运行时初始化、代理注入。
- 把“能删”和“不能删”的边界写进 spec，避免后续继续混淆。

**Non-Goals:**
- 不做产品能力裁剪，只删除无用代码。
- 不重写 `agent-orchestrator.ts`、SSE 消息流或现有会话体验。
- 不处理 `.serena/`、`.tmp/`、`test-results/` 等本地辅助目录。
- 不在这一轮大规模裁剪 `assets/models/*` 这类数据驱动资源。

## Decisions

### Decision 1: 用“运行时入口 + 消费者证据”定义无用代码

**选择**: 只有当代码同时满足以下至少一类证据时，才纳入清理：
- 不在当前运行时入口链路中被 import；
- repo 级引用只剩自身、barrel export 或测试；
- 仅服务于已删除产品功能，没有运行时主链消费者。

**替代方案**: 仅凭主观判断或文件名批量删除看起来“过时”的模块。

**理由**:
- 当前仓库仍有一部分“无 UI 但有运行时作用”的能力，例如代理配置读取、系统代理探测、运行时初始化。
- 只有把删除标准收紧到“有明确无消费者证据”，才能满足“只清理无用代码”的约束。

### Decision 2: 分三层实施，而不是一次性大删

**选择**: 将清理拆为三层：
1. 低风险整文件删除：孤儿组件、工具函数、未使用 primitive、无用 barrel。
2. 活文件内部收口：删除 `agent-atoms.ts`、`api.ts`、`model-logo.ts` 等活文件中的无消费者导出。
3. main/shared 表面收口：删除无消费者 HTTP 管理接口、无调用 helper、旧 Chat/Channel 类型域。

**替代方案**: 按目录整体删除或一次性重写大文件。

**理由**:
- 第一层可以快速降低噪音，风险最低。
- 第二层和第三层涉及活文件与共享导出面，必须在已有证据基础上渐进清理。

### Decision 3: 区分“管理表面”与“运行时能力”

**选择**: 可以删除无消费者的 HTTP 管理接口和 renderer API 包装，但必须保留支撑当前运行结果的内部能力。

**具体边界**:
- 可以删除：`/api/proxy-settings*`、`/api/environment-check`、`/api/runtime-status`、`/api/sessions/:id/generate-title` 这类无前端入口的管理/诊断表面。
- 必须保留：`getEffectiveProxyUrl()`、`system-proxy-detector.ts`、`runtime-init.ts`、`settings-service.ts`、`agent-session-manager.ts`、`agent-orchestrator.ts` 等当前主链依赖。

**替代方案**: 因为路由无消费者就连同内部服务一起删除。

**理由**:
- 当前 UI 不再管理代理或环境诊断，不代表代理注入、运行时判断、后端设置读取这些内部能力已经无用。
- 删除管理表面、保留运行时能力，才能同时达到“继续精简”和“不破坏主链”。

### Decision 4: `shared` 只保留当前 Web Agent 仍有消费者的类型域

**选择**: 删除仅服务于旧 Chat/Channel 模型的共享类型与导出；保留 Agent、runtime、environment、proxy 中仍被当前 main/renderer 消费的部分。

**替代方案**: 出于兼容考虑长期保留所有历史类型域。

**理由**:
- 当前 `@proma/shared` 已不再作为多产品共享层使用，保留大量旧域类型只会继续制造误导。
- 但 `ProviderType`、`FileAttachment` 等仍被运行中代码使用的局部类型，若仍有消费者，就不能机械删除。

### Decision 5: 高风险资源裁剪延后处理

**选择**: 本轮不按“死代码”逻辑批量删除 `renderer/assets/models/*`。

**替代方案**: 顺手把看起来不像 Claude 体系的模型图标一并清掉。

**理由**:
- `getModelLogo(model)` 是数据驱动匹配，静态搜索无法证明某个资源一定永远不会在历史消息或兼容模型名下被用到。
- 这类裁剪更接近产品边界收缩，而不是单纯的无用代码删除。

## Risks / Trade-offs

- **[活文件误删]** → `agent-atoms.ts`、`api.ts`、`model-logo.ts` 都是仍在运行的文件。  
  **Mitigation**: 只删有明确无消费者证据的导出，删除后立即跑 typecheck。

- **[管理表面与运行时能力混淆]** → 删除 HTTP 路由时误删底层代理或设置读取能力。  
  **Mitigation**: 将“路由/API 包装删除”和“内部服务保留”写入独立 capability，并在实现时分别处理。

- **[shared 导出清理扩散]** → 删除 Chat/Channel 类型可能引出零散依赖。  
  **Mitigation**: 先做 repo 级引用核实，只在无消费者或可联动替换时收口，并依赖全量 typecheck 兜底。

- **[隐性外部调用]** → 某些 HTTP 管理接口虽然仓库内无调用，但可能被人工外部调用。  
  **Mitigation**: 将其定性为“无消费者管理表面”，仅在不影响当前 Web UI 和 Agent 主链时删除，并在变更说明中记录这一边界。

## Migration Plan

1. 删除 renderer 低风险死文件与未使用 settings primitive。
2. 收口 renderer 活文件中的无消费者导出与状态面。
3. 删除 main 侧无消费者路由与无调用 helper，同时保留代理/会话/运行时主链。
4. 清理 `packages/shared` 中的旧类型域与孤儿导出，并同步必要依赖/锁文件。
5. 运行 `bun run typecheck`，再做一次当前 Web Agent 关键路径验证。

## Open Questions

- 当前没有需要阻塞实现的开放问题。
- `assets/models/*` 的大规模资源裁剪被明确延后，不纳入本次清理。
