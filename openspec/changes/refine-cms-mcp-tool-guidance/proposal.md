## Why

当前 CMS MCP 工具、默认 skill guidance、示例文档与 OpenSpec 中存在若干不一致：部分示例会误导模型传入完整 `cms-*` 标签或错误的 `level` 值，部分错误提示不够精确，且 handoff / decision 的有效性描述与现有实现及产品决策不一致。这会导致 Agent 在 CMS 绑定流程中误传参数、误判失败原因或给用户暴露不友好的恢复建议。

## What Changes

- 统一 `list_catalogs`、`list_contents`、`decide_cms_binding`、`apply_cms_binding` 的工具说明、参数约束、示例与错误恢复文案。
- 明确 `apply_cms_binding` 只接收 slot 内部内容，工具自动生成外层 `cms-catalog` / `cms-content` 与 slot wrapper；示例不得混用完整作者态源码和工具 payload。
- 补齐 `catalog-list` 的正式 ready decision 示例，并明确其仍使用 `mappingKind: "catalog-nav"` 与 `toolKind: "catalog-nav"`。
- 修正 CMS authoring guidance 中与 runtime 不一致的示例，例如 `cms-catalog level` 只能使用 `root` 或 `children`，不得展示 `level="1"`。
- 将 `cms-catalog level`、正式 `siteId`、`catalogId`、`parentId`、`ids`、`take` 等容易静默失效或被模型伪造的字段从“仅文档提示”提升为 contract / schema / validator 层面的可诊断约束。
- 移除或修正 “handoff / decision 因页面 revision 变化而过期” 的需求描述；当前确认后的 CMS apply 链路不应因 revision 变化自动过期。
- 收紧面向 Agent 的参数约束说明：正式 `siteId` 必须是大于等于 1 的整数；正式 `catalogId`、`parentId` 与 `ids` 必须来自 confirmed CMS selection 并使用正整数 ID 字符串；`take` 只允许正整数语义；内容查询在分页和 fixed ids 场景都应明确 `catalogId`。
- 明确 CMS MCP 是宿主运行时注入的 SDK MCP server，不写入 workspace `mcp.json`；当 CMS runtime 不可用时应阻止 Agent 伪造 CMS 数据或走普通 HTML 兜底。
- 优化 apply preflight / validation 错误，使错误能够指出具体模板字段、失败原因和可重试方向，避免模型在错误参数不变的情况下重复调用。
- 不在程序层面对 Agent 返回消息做语义或字符串过滤；本变更只调整工具契约、校验、错误边界和 guidance。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-cms-sdk-tools`: 统一 CMS runtime SDK tools 的说明、参数 schema、示例和 Agent 可执行错误恢复语义。
- `page-builder-cms-rendering-apply-tool`: 澄清正式 apply 工具的模板字段语义、字段级校验和错误提示要求。
- `page-builder-cms-binding-decision-plan`: 修正 handoff / decision 有效性策略，明确不再因页面 revision 变化自动判定过期。
- `page-builder-cms-apply-skill`: 统一默认 CMS apply skill 的阅读顺序、ready decision 示例和工具 payload 示例。
- `page-builder-cms-authoring-contract`: 修正 human-readable guidance 与 canonical contract 的不一致示例，确保 `cms-catalog` / `cms-content` 写法和字段语义一致。
- `tool-activity-display`: 将 CMS apply 工具的前端展示名称调整为同时覆盖栏目和内容的中性表述。

## Impact

- 影响 `apps/app/src/main/lib/cms-sdk-tools.ts`、`apps/app/src/main/lib/page-builder-cms-rendering-tools.ts`、`apps/app/src/main/lib/page-builder-cms-binding-decision-store.ts` 等 CMS MCP 工具与 apply 链路代码。
- 影响 `apps/app/default-skills/cms-binding-apply/` 下的默认 skill 与 references，以及 page-builder workspace prompt 中的 CMS 指导说明。
- 影响 `packages/page-builder-cms-rendering` 中 CMS validation / contract guidance 的一致性边界。
- 影响 `apps/app/src/main/lib/agent-orchestrator.ts` 或等价动态上下文注入点，用于说明 CMS runtime MCP 可用性与 `mcp.json` 边界。
- 影响 `apps/app/src/renderer/components/agent/tool-labels.ts` 中 CMS apply 工具的展示文案。
- 影响 OpenSpec 中 CMS SDK tools、rendering apply tool、binding decision plan、apply skill 与 authoring contract 的规格描述。
- 需要补充或更新相关单元测试，覆盖工具 schema、错误提示、模板字段校验、示例一致性和非过期 decision 行为。
