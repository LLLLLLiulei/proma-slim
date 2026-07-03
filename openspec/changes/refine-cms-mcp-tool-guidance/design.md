## Context

CMS 集成目前已经形成了三层链路：runtime SDK MCP tools 负责栏目/内容读取、decision 物化和正式 apply；`cms-binding-apply` skill 负责把确认后的 CMS 选择转成可执行决策；`page-builder-cms-rendering` contract / validator 负责约束 `cms-catalog` 与 `cms-content` 的作者态写法。当前问题集中在这些层之间的“面向模型契约”不一致：工具 schema、工具 description、skill references、OpenSpec 示例和 validator 错误语义存在偏差，导致模型容易传错 payload、把最终源码示例当成工具入参，或在错误后不知道如何修正。

本变更不改变 CMS 选择器和 CMS 数据源能力本身，也不引入新的 MCP server。重点是把已存在工具的参数边界、示例、错误提示和规格描述统一到同一套可执行语义上。

## Goals / Non-Goals

**Goals:**

- 让 Agent 能清楚理解每个 CMS MCP 工具的使用场景、参数形状、调用顺序和失败后的纠正方式。
- 让 `cms-binding-apply` 的 ready decision 示例覆盖 `nav`、`catalog-list`、`content-list` 与 fixed ids 场景，并与 SDK schema 完全一致。
- 让 `apply_cms_binding` 的模板字段语义统一为 slot inner content，避免把完整 `<cms-catalog>` / `<cms-content>` 作者态源码误传给工具。
- 让校验错误指向具体字段、具体 contract 违规点和可重试方向，减少模型盲目重复调用。
- 让 `level`、正式 `siteId`、`catalogId`、`parentId`、`ids`、`take` 等字段的 contract / schema / validator 约束与 runtime 行为一致，避免静默忽略、伪造语义 ID 或无效绑定。
- 让 Agent 明确知道 CMS MCP 是宿主运行时注入能力，而不是 workspace `mcp.json` 中的静态配置；当 runtime 不可用时不得伪造 CMS 数据。
- 让 OpenSpec 与当前产品决策一致：confirmed CMS handoff / decision 不因页面 revision 变化自动过期，但仍保留 session、workspace、target identity 和成功消费边界。

**Non-Goals:**

- 不新增 CMS 内容类型、CMS API、MCP server 或用户侧 CMS 选择交互。
- 不新增 `list_sites` 工具；普通 CMS 查询仍使用当前站点上下文或既有 lookup fallback。
- 不恢复 handoff / decision revision 过期机制。
- 不在程序层面对 Agent 返回的自然语言消息做字符串匹配、语义分析或安全过滤。
- 不改变 `apply_cms_binding` 的公开入参集合；它仍只接收 `decisionId`、`templateBody`、`emptyTemplate?` 与 `errorTemplate?`。
- 不扩大普通页面生成流程直接新建或重绑 CMS 标签的权限。

## Decisions

### 1. 以 SDK tool schema 和 canonical CMS contract 作为工具说明的校准源

`cms-sdk-tools.ts` 中的 tool description、字段 description 和错误提示必须与实际 zod schema、decision store 校验和 rendering contract 保持一致。默认 skill references 可以提供解释和示例，但不能引入 schema 不支持的字段、枚举值或 payload 形状。

替代方案是只修改 skill 文档，不动 SDK tool description。该方案风险较高，因为 Claude Agent SDK 直接把 tool schema / description 暴露给模型，工具层仍会继续给出冲突信号。

### 2. 明确区分“工具 payload 示例”和“最终作者态源码示例”

`apply_cms_binding` 的工具入参应展示为 slot inner content，例如 `<li v-for="item in items">...</li>` 或一组内部节点；完整 `<cms-content>...<template v-slot:...>` 只能作为“工具执行后生成的作者态源码”示例出现，并必须明确标注不能直接传入 `templateBody`。

替代方案是继续允许模型传完整源码并在工具中自动剥离外层 `cms-*`。该方案会弱化正式 apply 的边界，也容易把 raw binding identity、source props 与模板内容混在一起，因此不采用。

### 3. 保留 decision-backed apply，但取消 revision 自动过期

`decisionId` 仍然是正式 apply 的唯一 authority，并继续受 workspace、session、selection、targetSelection、targetSnapshot、source props 和成功消费状态约束。但页面 revision 变化不再单独使 decision 过期；revision 只作为上下文记录或调试信息存在。真正的写入安全由 apply 时的 target locator、parent block 校验、结构 guardrails 和 mutation pipeline 承担。

替代方案是恢复 revision stale 检查。该方案与已确认需求冲突，也会导致页面小幅刷新或无关编辑后 CMS apply 难以恢复，因此不采用。

### 4. 错误提示采用字段级、动作级恢复语义

工具错误统一为 plain-text，但内容必须包含：当前 CMS 步骤未完成、失败字段或失败边界、下一步如何修正、禁止继续做什么。对于模板校验，错误必须尽量指出 `templateBody` / `emptyTemplate` / `errorTemplate` 中的具体字段，而不是总是归因到 `templateBody`。

替代方案是返回结构化错误对象。当前 Claude SDK tool error 表达主要面向文本消费，结构化字段不一定稳定可见，因此先保持 plain-text，并通过测试固定关键语义。

### 5. 禁止程序层 Agent 输出语义过滤

内部安全分析暴露、开发者视角回复等问题应通过 system / workspace prompt、tool guidance 和 skill 指令约束解决，不在程序层对 Agent 自然语言输出做字符串匹配、语义分类或改写。工具结果和工具错误可以规范化，因为它们是宿主产生的确定性内容。

替代方案是引入 assistant content policy 进行输出过滤。该方案容易误伤正常回复，也违反当前产品边界，因此不采用。

### 6. 将静默无效值升级为 contract / validator 错误

`cms-catalog level` 必须收敛为 `root | children`，正式写入链路的 `siteId` 必须是大于等于 1 的整数，`take` 必须是正整数。文档示例修正不够，schema / validator / apply preflight 也必须拒绝这些无效值，避免 runtime 静默忽略后让 Agent 误以为绑定成功。

替代方案是只在 guidance 中提示不要使用非法值。该方案无法阻止模型或历史示例继续生成无效作者态，因此不采用。

### 8. 正式 CMS source identity 使用 confirmed selection 中的数字 ID 字符串

正式 `decide_cms_binding`、decision store 与 `apply_cms_binding` 入口中的 `source.catalogId`、`source.parentId` 和 `source.ids` 必须来自 confirmed CMS selection，并使用正整数 ID 字符串；数字入参可以规范化为字符串。面向 Agent 的示例不得展示 `news`、`root`、`news-root`、`n-101` 这类语义别名或伪造 ID。`parentId: "root"` 不作为根栏目特殊语义；根栏目应通过明确的来源模式表达。
`cms-catalog parent-id` 只有在 `level="children"` 时才会被 runtime 使用，因此 authoring validator 与 guidance 需要拒绝 `parent-id` 缺少 `children` level、或 `level="children"` 缺少 `parent-id` 的组合。

替代方案是继续把这些字段当作任意非空字符串，只在文档里提示不要编造。该方案会让 tool schema 和 guidance 继续冲突，模型仍可能复制语义占位值并走到后续失败，因此不采用。

### 7. 在动态上下文中解释 runtime CMS MCP 边界

CMS MCP 保持为宿主运行时注入的 SDK MCP server，不写入 workspace `mcp.json`。当 CMS 配置可用并挂载工具时，动态上下文应说明可使用 `mcp__cms__*` 工具；当 CMS runtime 不可用或未挂载时，动态上下文应说明当前不能执行 CMS 读取或绑定，并禁止 Agent 伪造 CMS 数据或退化为普通静态 HTML 绑定结果。

替代方案是依赖模型观察 tool list。该方案在模型读取 `mcp.json` 或 tool list 缺失时容易产生误判，因此不采用。

## Risks / Trade-offs

- Revision 不再自动过期 → 可能在页面已变化后复用旧 decision；通过 apply 阶段的 selector 唯一性、parent block 校验、cms-island locator 和结构 guardrails 拦截实际冲突。
- Tool description 与 skill references 双处维护 → 仍可能再次漂移；通过测试扫描关键示例和非法片段降低回归风险。
- Contract 约束收紧 → 历史页面中的非法字段可能被新校验诊断；通过区分“新建/重绑 formal apply”与“legacy 读时兼容”降低兼容风险。
- 数字 ID 约束更贴近当前 CMS，但降低了通用 mock / demo 语义 ID 的复用性；通过仅收紧正式 Agent-facing 写入链路、保留独立 demo/mock 边界降低影响。
- 错误提示更详细 → 可能暴露过多实现词汇；通过脱敏、截断和统一格式控制，只暴露修正参数所需信息。
- 只做工具契约和 guidance 修正 → 不能完全保证模型永远遵循；通过 schema 校验、preflight 校验和可恢复错误形成第二道边界。
