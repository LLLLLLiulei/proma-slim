## Why

当前 page-builder 的 CMS 绑定链路主要依赖模型自己在 `cms-binding-apply` skill 与 `mcp__cms__apply_cms_binding` 之间做软编排。缺少机器可判定的中间状态会让模型停留在抽象决策、裸调 apply tool，或直接绕过受控链路去手写 `cms-*` / 整页 Vue 方案，因此需要把 confirmed CMS apply 升级为带 `decisionId` / apply plan 的硬 handoff。

上一轮收紧后，链路已经具备 `decisionId` / apply plan / no-decision-no-write 的基础能力，但仍存在三个未闭环点：

- confirmed CMS handoff 目前仍主要依赖 prompt 层 `mentionedSkills` 提示模型“先调 skill”，宿主没有真正硬启动 `cms-binding-apply`
- 首次绑定完成后，选中 `cms-island` 的后续消息会重新落回 ordinary `page-builder-guided-generation`，缺少“样式迭代”和“数据源重绑”之间的宿主分流
- persisted apply plan 当前只绑定 target/source identity，还没有表达“外层壳子是否保留、major container 由谁拥有”这类结构约束，导致模型在保留旧壳层时仍可能重复生成主布局容器并造成样式错乱

## What Changes

- 新增宿主管理的 CMS binding decision/apply-plan 能力，在 `cms-binding-apply` 与正式 `apply_cms_binding` 之间生成可机器消费的 `decisionId`，并由宿主持久化归一化 apply plan。
- 扩展 page-builder 的 runtime CMS MCP tool surface，新增用于创建 decision/apply plan 的受控工具，并保持 CMS 读取工具与正式 apply tool 仍由宿主创建和托管。
- 收紧 `mcp__cms__apply_cms_binding` 的正式写入前置条件，要求写入必须消费有效 `decisionId`，缺失、过期、冲突或目标失配时 fail closed。
- 调整 confirmed CMS browser handoff 与 `cms-binding-apply` ready 路径，使正式链路变为“自动 handoff -> 宿主硬启动 skill 语境 -> decision tool -> apply tool”，而不是直接编辑工作区文件、只靠 prompt 提示模型自己调 skill，或无状态 apply。
- 为已绑定 `cms-island` 的后续消息补充分流规则：样式/slot 迭代继续走 ordinary flow，但涉及 `site-id`、`catalog-id`、`ids`、`page-size` 等 binding identity 的重绑请求必须回到 CMS browser confirm 与 decision/apply chain。
- 扩展 persisted apply plan 与正式 apply 校验，使其不仅绑定 target/source identity，还绑定壳层保留策略、major container owner 与等价结构 guardrails，并在模板形状与当前壳层冲突时返回可恢复的稳定错误。
- 保持 ordinary page-builder flow 与 confirmed CMS apply flow 的边界：普通页面生成/迭代仍不得凭空新建或重绑 `cms-*`，confirmed CMS apply 仍是唯一正式写入入口。

## Capabilities

### New Capabilities
- `page-builder-cms-binding-decision-plan`: Define the machine-readable decision/apply-plan layer that persists `decisionId`, binds it to confirmed CMS selection context and target snapshot, and invalidates stale or conflicting decisions before formal apply.

### Modified Capabilities
- `page-builder-cms-auto-agent-handoff`: Route confirmed CMS browser handoff into the decision-backed apply chain and preserve the structured context needed to mint a valid decision record.
- `page-builder-cms-apply-skill`: Change the `ready` path so `cms-binding-apply` must materialize a machine-readable decision before formal apply, instead of treating free-text readiness as sufficient authority to write.
- `page-builder-cms-rendering-apply-tool`: Require a valid `decisionId` for formal CMS writes, carry structure-aware apply-plan guardrails, and fail closed when the decision is missing, stale, conflicting, target-mismatched, or structurally incompatible with the preserved shell.
- `page-builder-cms-sdk-tools`: Expose the new host-managed CMS decision tool in the runtime MCP bundle while preserving the controlled CMS read/apply boundaries.
- `page-builder-prompt-layering`: Update the confirmed CMS apply route so prompt-layering contracts the decision-backed chain, and so selected `cms-island` follow-up messages can distinguish style iteration from binding re-entry.

## Impact

- Affected specs: `page-builder-cms-binding-decision-plan` (new), `page-builder-cms-auto-agent-handoff`, `page-builder-cms-apply-skill`, `page-builder-cms-rendering-apply-tool`, `page-builder-cms-sdk-tools`, `page-builder-prompt-layering`
- Affected runtime surfaces: page-builder CMS browser handoff, workspace Agent programmatic send path, selected `cms-island` ordinary follow-up routing, runtime CMS MCP server, formal CMS apply path, shared CMS apply/decision contracts
- Likely affected code: `apps/app/src/main/lib/agent-orchestrator.ts`, `apps/app/src/main/lib/cms-sdk-tools.ts`, `apps/app/src/main/lib/page-builder-cms-rendering-tools.ts`, `apps/app/src/main/lib/page-builder-cms-binding-decision-store.ts`, page-builder CMS browser / BuilderPage / AgentView integration, `apps/page-builder/src/renderer/lib/preview-selection.ts`, `packages/shared/src/types/page-builder-cms-apply.ts`, related regression tests
