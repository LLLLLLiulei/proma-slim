## Context

当前 page-builder 的 CMS 定位链路混用了两套作者态内部 identity：
- `data-proma-cms-source-id` 用于 `cms-island` 的精确定位、快照、删除和 apply
- `data-proma-block-id` 用于 block 级选择和部分 parent block 上下文

这两套 identity 都直接暴露在 `workspace-files/index.html` 中，agent 在普通 HTML 改写时可以直接复制、漏写、手写或污染它们。仓库里已经出现了手写 `sourceId` 的真实案例，导致以下问题：
- preview 命中的渲染结果回不到同一个源 CMS 标签
- apply / deletion / targeted edit 在 identity 冲突时频繁 fail-closed 或误命中
- blockId/sourceId 都在源码层承担“内部定位”职责，和业务模板混杂在一起

与此同时，当前 preview bootstrap 实际已经能够从源 CMS 标签推导出稳定的 `sourceSelector` 与 `parentBlockSelector`，并把这些 runtime 元数据注入到渲染根节点上。说明系统已经具备“宿主管理 runtime locator”的基础雏形，只是正式写入、删除、快照、manifest 与 validator 还没有围绕同一个 locator contract 收敛。

本次变更是一个跨 `packages/shared`、`apps/page-builder`、`apps/app` 和 `packages/page-builder-cms-rendering` 的 CMS targeting 模型收敛，不只是某个单点 bug 修复。

## Goals / Non-Goals

**Goals:**
- 将 CMS 链路中的目标 identity 收敛为宿主管理的 runtime locator，而不是继续依赖作者态源码中的内部 id。
- 为 `cms-island` 目标建立统一 locator contract，至少包含 `htmlPath`、`component`、`sourceSelector` 与 `parentBlockSelector`。
- 让 preview bridge、CMS 选择结果、apply、targeted edit、block deletion、snapshot、manifest 和 validator 共同消费同一套 locator 语义。
- 停止在作者态源码中生成、依赖或传播 `data-proma-cms-source-id`。
- 保持 `cms-island` 的 `editBoundary: source-atomic`，并在 locator 失效时严格 fail-closed，而不再模糊兜底。
- 让 runtime locator 元数据只存在于 preview 渲染 DOM、host 内部结构和派生产物中，而不是暴露为作者态 contract。

**Non-Goals:**
- 不在本次 change 中重做普通静态 block 的整体 identity 模型。
- 不要求一次性删除仓库中所有 `data-proma-block-id`；它在普通 block 兼容路径中可继续存在。
- 不引入 XPath 作为新的主要定位协议。
- 不为 stale locator 提供模糊恢复、相邻节点猜测或 parent block 自动兜底。
- 不扩展新的 CMS 组件类型，也不改变现有 CMS 数据来源模式。

## Decisions

### Decision: 为 `cms-island` 引入统一的 runtime locator contract

**Decision**
- 将 `cms-island` 的正式 identity 收敛为宿主管理的 locator 对象：
  - `htmlPath`
  - `component`
  - `sourceSelector`
  - `parentBlockSelector`
- 该 locator 作为 `targetSelection.kind: cms-island` 的正式定位载荷。
- CMS 链路中的 apply、删除、快照、targeted edit 和 selection contract 不再依赖作者态 `sourceId`。

**Rationale**
- `sourceId` 和 `blockId` 的问题不是“唯一性不够”，而是它们暴露在可被 agent 直接编辑的 source HTML 中。
- locator 是 host 从当前作者态 HTML 与 preview runtime 推导出来的，不需要模型手写，也不需要持久化为作者态字段。
- `sourceSelector + parentBlockSelector + component + htmlPath` 足以表达单个 CMS source target 及其父块上下文。

**Alternatives considered**
- 保留 `sourceId`，改成 host 自动补齐和纠偏：能缓解一部分问题，但内部 id 仍然暴露在源码中，模型仍可能复制污染。
- 把 `blockId` 和 `sourceId` 合并成另一个源码 id：只是把问题换个名字继续暴露在源码里。
- 使用 XPath：与现有 `querySelectorAll` / CSS selector 链路不一致，调试和转义成本更高，也更脆弱。

### Decision: Runtime locator 元数据只注入 preview 渲染根节点，不写回作者态源码

**Decision**
- preview bootstrap 在挂载每个顶层 CMS island 时，基于源 CMS 标签计算 locator，并把它注入到渲染结果的顶层 roots。
- 注入信息至少包括 `component`、`sourceSelector`、`parentBlockSelector`、`htmlPath`，以及仅供前端 runtime 去重/缓存的 `islandKey`。
- 这些属性是 runtime-only 元数据，不属于作者态 contract，不得写回 `workspace-files/index.html`。

**Rationale**
- 这让 preview bridge、overlay 和 selection 侧仍然能稳定识别同一个 CMS island，同时把内部定位信息完全从业务模板中剥离。
- 把注解限制在渲染根节点，而不是整个 slot 子树，可以避免 DOM 污染面扩大和子树冲突判断复杂化。

**Alternatives considered**
- 把 locator 写回源 `cms-*` 标签：又回到 agent 可修改的作者态字段问题。
- 给 slot 中所有后代节点都打 locator：实现更重，也更容易产生选择冲突和性能噪音。

### Decision: 所有正式 CMS 写入路径改为 locator-first、严格 fail-closed

**Decision**
- 当目标为 `kind: cms-island` 时，正式写入路径统一按以下顺序解析目标：
  1. 读取 `htmlPath` 对应作者态 HTML
  2. 使用 `sourceSelector` 定位唯一源 CMS 标签
  3. 校验命中元素的 `component`
  4. 使用 `parentBlockSelector` 校验该源标签仍属于预期 parent block
- 任一步失败都直接中止，不做模糊匹配、相邻 block 猜测或旧 `sourceId` 兜底。

**Rationale**
- 用户已经确认 stale locator 时必须明确失败并重新选择，不能再走“尽量改点什么”的危险路径。
- 失败闭合是让 CMS selection/apply/edit 具备可预测性的前提。

**Alternatives considered**
- locator 失效时退回到 parent block：高概率改错范围。
- locator 失效时继续读取旧 `sourceId`：继续保留内部 id 依赖，和本次目标冲突。

### Decision: `data-proma-block-id` 先降级为普通 block 兼容标识，不再承担 CMS source identity

**Decision**
- CMS 链路中的 parent block 语义统一通过 `parentBlockSelector` 表达，而不是通过作者态 `blockId` 反推。
- 普通 block 选择路径仍可保留现有 `data-proma-block-id` 兼容逻辑。
- manifest、apply 结果与诊断允许保留 `blockId` 作为兼容性摘要，但 CMS 目标解析不得继续依赖它。

**Rationale**
- 直接一次性重写整个 block identity 模型会扩大范围并影响非 CMS 路径。
- CMS 链路的问题更集中、更急迫，应先从最不稳定的 `sourceId` 与 block-based source identity 中解耦。

**Alternatives considered**
- 同步删除全部 `blockId`：技术上可行，但会把这次 change 范围扩展到整个普通 block 选择体系。
- 继续让 CMS 路径依赖 parent block 的 `blockId`：仍然要求作者态保留内部 identity。

### Decision: Manifest 与 validator 改为 locator snapshot + runtime-only 元数据治理

**Decision**
- manifest 不再把持久化 `sourceId` 视为 CMS source identity 的正式组成部分。
- manifest entry 改为保留 locator snapshot，例如：
  - `sourceSelectorSnapshot`
  - `parentBlockSelectorSnapshot`
  - `component`
  - `props`
  - `htmlPath`
  - `islandIndex`
- validator 需要校验：
  - 顶层 CMS island 是否都能导出唯一 `sourceSelector`
  - `parentBlockSelector` 是否可导出
  - 作者态 HTML 是否仍残留 `data-proma-cms-source-id` 或 `data-proma-cms-island-*`
- 对残留 runtime-only 元数据，支持的 mutation 路径自动剥离，并返回结构化诊断。

**Rationale**
- manifest/validator 必须与正式 targeting 模型保持一致，否则会继续存在“运行时一套、派生产物另一套”的漂移。
- 自动剥离旧内部 attrs 比直接硬失败更利于迁移已有页面。

**Alternatives considered**
- 继续保留 `sourceId` 在 manifest 中的主语义：会让后续 preview/apply/deletion 继续绕回旧模型。
- 发现旧 attrs 就完全拒绝处理：迁移成本太高，也不利于逐步清理历史页面。

## Risks / Trade-offs

- **[结构选择器会随 DOM 改写而失效]** → Mitigation: 明确 locator 失效时必须重新选择，并在错误信息中提示刷新 preview/重新选择，而不是猜测恢复。
- **[从 `selector` 迁移到 `sourceSelector` / `parentBlockSelector` 会影响多个模块的 shared types]** → Mitigation: 在 `packages/shared` 中集中更新 `PageBuilderTargetSelection` 与 helper，减少各处各自定义兼容层。
- **[旧页面残留 `sourceId` 或 runtime attrs 可能在迁移期持续出现]** → Mitigation: validator 输出结构化诊断，支持的 mutation 路径自动剥离这些字段。
- **[`blockId` 仍保留在普通 block 链路中，短期内体系不是完全统一]** → Mitigation: 在设计上明确 CMS locator 与普通 block identity 的边界，后续再单独收敛 block 模型。
- **[多根节点 CMS island 的 locator 注解需要保持一致，否则选择桥接会 fail closed]** → Mitigation: preview bootstrap 统一从同一个源 CMS 标签推导 locator，并在 bridge 中继续做一致性检查。

## Migration Plan

1. 在 `packages/shared` 中收敛 `cms-island` 目标类型，引入 locator-first 的 `targetSelection` 表达。
2. 更新 `packages/page-builder-cms-rendering` preview bootstrap，使其为渲染根节点注入 runtime locator 元数据，并停止镜像 `sourceId`。
3. 更新 `apps/page-builder` preview bridge 与 CMS 选择确认协议，使前端回传 locator-first 的 `cms-island` 目标。
4. 更新 `apps/app` 中的 apply、snapshot、block deletion 与 targeted edit guardrails，统一按 locator-first 解析源 CMS 标签。
5. 更新 mutation pipeline、manifest 和 validator：停止依赖 `sourceId`，改为 locator snapshot，并自动剥离残留 runtime-only attrs。
6. 更新相关技能、诊断文案和测试基线，覆盖 stale locator、multi-root locator、一致性检查与 legacy attr 清理。

**Rollback**
- 若 locator-first 迁移在集成阶段引发不可接受的 regressions，可整体回退本次 change，恢复旧的 `sourceId` 路径；不在运行时引入 sourceId fallback 作为长期兼容策略。

## Open Questions

- 当前没有必须阻塞本次 change 的开放问题；用户已确认 stale locator 必须直接失败并要求重新选择。
