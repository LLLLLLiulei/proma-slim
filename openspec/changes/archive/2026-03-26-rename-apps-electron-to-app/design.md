## Context

当前仓库已经从 Electron IPC 架构收缩为 Bun HTTP 服务加 Vite/React 浏览器前端，但主应用在仓库中的身份仍然暴露为 `apps/electron` 和 `@proma/electron`。这会在三个层面持续制造误导：

- 顶层开发脚本仍然把主应用称为 `@proma/electron`
- Bun workspace、锁文件和配置文件仍然把目录路径固定在 `apps/electron`
- 当前状态说明文档已经承认该命名是历史遗留，但代码和路径层尚未同步完成纠正

本次 change 只处理第一阶段：把主应用的外层目录和 workspace 包身份改为中性的 `app` 命名，同时保持运行形态、目录结构和现有行为不变。这样可以先消除最显著的误导项，再把 `src/main` / `src/renderer` 这类内部层级命名留到后续独立 change 处理。

## Goals / Non-Goals

**Goals:**
- 将主应用目录从 `apps/electron` 统一重命名为 `apps/app`
- 将主应用 workspace 包名从 `@proma/electron` 统一重命名为 `@proma/app`
- 更新所有会影响运行、构建、测试或开发入口的硬引用
- 更新当前态说明文档与必要测试文案，避免仓库入口身份与真实架构继续冲突
- 保持现有命令行为、服务启动方式和前后端运行链路不变

**Non-Goals:**
- 不重命名 `src/main` / `src/renderer`
- 不调整 Bun HTTP 服务、Vite 构建或前端运行方式
- 不修改用户配置目录、数据目录或运行时持久化路径
- 不批量改写所有历史归档文档中关于 Electron 迁移过程的叙述

## Decisions

### Decision: 第一阶段只重命名应用身份，不重命名内部架构层级

**Decision**
- 本阶段只改两层身份：
  - `apps/electron` -> `apps/app`
  - `@proma/electron` -> `@proma/app`
- 保持 `src/main` 和 `src/renderer` 原样不动。

**Rationale**
- `apps/electron` / `@proma/electron` 是开发者最先接触到的命名，也是误导最强的一层。
- 先改外层身份，可以立即降低理解成本，同时把影响面限制在 workspace、脚本、配置和文档硬引用。
- 如果同步去改 `src/main` / `src/renderer`，会把当前 change 从“应用身份重命名”扩大成“内部架构层级重命名”，验证与回滚成本明显上升。

**Alternatives considered**
- 一次性把 `apps/electron`、`@proma/electron`、`src/main`、`src/renderer` 全改掉：语义最彻底，但跨层影响过大，不适合作为第一阶段。
- 只改包名，不改目录名：会留下路径与包身份不一致的问题，反而增加混乱。

### Decision: 以“运行硬引用优先”方式迁移，而不是全仓搜索替换

**Decision**
- 优先修改会影响运行和工具链的硬引用：
  - 根 `package.json` 脚本过滤条件
  - 应用 `package.json` 包名
  - `bun.lock` / `pnpm-lock.yaml`
  - 指向应用路径的构建配置与测试文件
- 对文档采取分层处理，而不是机械地全仓替换 `apps/electron`。

**Rationale**
- 这次重命名的风险主要来自 workspace 解析、脚本入口和配置路径，而不是字面量本身。
- 全仓替换很容易误伤历史文档、归档 proposal、以及描述“过去曾是 Electron”的记录。
- 先保证代码与工具链一致，再逐步处理说明层文本，可以降低变更噪音。

**Alternatives considered**
- 直接全仓替换 `electron`：执行快，但会破坏历史文档准确性，也可能误改无关文本。
- 只改目录不改脚本/包名：构建和开发入口会立即失效。

### Decision: 当前态文档同步更新，归档历史文档保留原语义

**Decision**
- 更新描述“当前仓库状态”的文档，让它们引用 `apps/app` / `@proma/app`
- 保留归档 change、历史设计稿和迁移记录中对 `apps/electron` 的历史描述，只在必要时补充说明，不强行重写

**Rationale**
- 当前态文档是新接手者理解代码库的入口，必须与真实路径一致。
- 归档文档本质上记录的是当时的状态与决策，强行替换会削弱历史可追溯性。

**Alternatives considered**
- 所有文档一律替换：历史上下文会被抹平。
- 一个文档都不动：会让“当前路径”和“当前说明”持续矛盾。

### Decision: 运行时数据路径与默认配置目录不随本次改名变化

**Decision**
- 保持 `~/.proma/`、`PROMA_CONFIG_DIR` 和相关运行时目录规则不变。
- 保持应用内逻辑只改仓库路径和 workspace 包身份，不借机修改数据目录命名。

**Rationale**
- 本次变更目标是仓库身份纠偏，不是产品数据布局迁移。
- 一旦把数据目录也卷入，迁移就会从“代码重命名”升级为“用户数据兼容问题”，风险不成比例。

**Alternatives considered**
- 同步重命名配置目录：表面更整齐，但与本次目标无关，并会引入迁移兼容负担。

## Risks / Trade-offs

- **[路径改名会让大量导入与工具缓存同时失效]** → Mitigation: 先完成目录移动与配置修正，再统一运行 typecheck 和目标测试，必要时重建锁文件与本地缓存。
- **[锁文件中 workspace 路径同步不完整会导致依赖解析异常]** → Mitigation: 明确把 `bun.lock` 和 `pnpm-lock.yaml` 纳入变更范围，并在提交前重新验证根脚本可用。
- **[历史文档与当前文档边界处理不清会造成文档口径混乱]** → Mitigation: 只改描述当前状态的文档，保留 archive/历史 proposal 的原始叙述。
- **[第一阶段完成后仓库内部仍存在 `main` / `renderer` 命名债]** → Mitigation: 在设计中明确这是后续独立阶段，而不是本次遗漏。

## Migration Plan

1. 将 `apps/electron` 目录重命名为 `apps/app`
2. 将应用 package 名称从 `@proma/electron` 调整为 `@proma/app`
3. 更新根 `package.json` 中对主应用的 `bun run --filter=...` 脚本引用
4. 更新应用内配置文件中对路径的硬引用，例如 Vite、TypeScript、Tailwind、组件配置和相关测试说明
5. 更新锁文件中的 workspace 路径与包名引用
6. 更新当前态说明文档与少量会误导维护者的测试文案
7. 运行 typecheck、目标测试和根级命令验证，确保目录改名后开发入口仍然可用

**Rollback**
- 如果迁移后 workspace 解析或脚本入口异常，可整体回退目录名、包名和锁文件变更。
- 因为本次不触碰运行时数据路径，所以回滚不涉及用户数据恢复。

## Open Questions

- 第二阶段内部重命名时，`src/main` / `src/renderer` 更合适的目标是否为 `src/server` / `src/client`？
- 当前态文档是否需要在本次顺手新增一条说明，明确“archive 下保留历史 `apps/electron` 叙述是有意为之”？
