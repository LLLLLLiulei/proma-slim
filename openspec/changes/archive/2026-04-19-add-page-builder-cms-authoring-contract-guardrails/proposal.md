## Why

当前“从 CMS 选择数据 -> 自动 handoff -> Agent 编写 `cms-catalog` / `cms-content` -> 正式 apply -> 预览渲染”的链路已经具备基础能力，但仍存在三类真实问题：
- authoring contract 虽然已经集中，但传给模型的 digest 仍主要是字段名和 prop 名数组，缺少类型、可选性、含义和推荐用法，模型仍会猜字段语义或遗漏可选字段守卫
- 预览层对临时无效的 CMS 作者态缺少 graceful degradation，错误内容在一次 Agent 回合中仍可能短暂打到预览并造成抖动
- 普通编辑链路和正式 apply 链路的校验强度仍不完全一致，最终虽然可回滚，但过程内稳定性仍然不够

随着 CMS 绑定场景扩展到多种来源模式与 source-atomic 编辑，这些问题已经直接影响可用性，因此需要继续把 contract 提升为“语义完备的唯一真相源”，并补上预览与过程内稳定性的缺口。

## What Changes

- 新增一套可被 skill、prompt、apply tool 与 validator 共同消费的 CMS authoring contract，明确：
  - 当前仅支持的 `cms-catalog` / `cms-content` props
  - 必填字段与互斥来源模式
  - slot scope 与可用 `item` 字段
  - 字段类型、可选性、含义与推荐用法
  - 禁止的模板结构、危险标签与嵌套规则
  - 旧页面兼容与显式 `site-id` 落盘规则
- 修改 CMS 自动 handoff 与自动应用 skill，使其在运行时携带稳定的 contract 摘要、目标上下文与 source-atomic 写入边界，并停止依赖过时示例或自由猜测。
- **BREAKING** 收紧 `apply_cms_binding` 与统一 HTML mutation pipeline 的 CMS 校验策略：不再只拦截危险标签和重复 sourceId，而是对所有阻断性 CMS authoring 错误直接失败，不允许落盘部分无效写入。
- 增强 CMS rendering core 的扫描、编译与验证能力，在正式写入前执行更严格的模板/字段预检，并让新建或重绑后的 CMS 标签显式写出 `site-id`。
- 修改 preview 与普通编辑保护链路，使临时无效的 CMS 作者态不再直接把预览打成最终错误状态，而是优先保留最近一次安全预览并向会话反馈结构化错误。
- 清理或降级过时 CMS 指引，确保默认 skill、引用示例和 workspace 模板只指向当前 contract。

## Capabilities

### New Capabilities
- `page-builder-cms-authoring-contract`: 定义 CMS 标签 authoring 的唯一真相源，包括受支持 props、slot scope、字段白名单、禁用结构与兼容规则，供 handoff、skill、validator 和提示词统一复用。

### Modified Capabilities
- `page-builder-cms-auto-agent-handoff`: 自动 handoff 需要显式携带 CMS authoring contract 摘要与更稳定的目标上下文，避免模型仅凭自然语言猜测写法。
- `page-builder-cms-apply-skill`: `cms-binding-apply` 必须按统一 contract 生成和校验 CMS 写入方案，缺少必填字段或存在非法结构时直接阻断。
- `page-builder-cms-rendering-apply-tool`: 正式 apply 工具与 mutation pipeline 需要对 CMS authoring 执行完整的 fail-closed 校验，并在改写旧页面时补出显式 `site-id`。
- `page-builder-cms-rendering-core`: 核心运行时、模板扫描与 validator 需要暴露稳定的字段合同，并拒绝未支持 props、字段或模板结构。
- `page-builder-cms-rendering-preview`: 预览层需要在当前作者态 HTML 暂时无效时优先保留最近一次安全预览，而不是直接把工作区暴露为 CMS 渲染失败。
- `page-builder-cms-targeted-edit-guardrails`: 普通目标编辑链路需要在 CMS 作者态失效时维持 source-scoped 回滚和预览安全，不让无效中间状态长期停留。
- `page-builder-guided-generation`: 相关页面生成/编辑指引必须只引用统一 contract，并在处理已有 CMS 标签时遵守相同的 authoring 与校验边界。

## Impact

- `apps/app` 中的默认 skills、workspace prompt/template、CMS apply tool、HTML mutation pipeline 与相关测试
- `apps/app` 中的工作区 preview 服务与 Agent turn 级 CMS guardrail
- `apps/page-builder` 中的 CMS 自动 handoff 组装逻辑
- `packages/page-builder-cms-rendering` 中的组件 props 归一化、模板扫描/编译、字段合同与校验逻辑
- 现有 CMS 参考文档、示例和测试基线；此前可“侥幸通过”的非法 CMS authoring 将被显式拒绝
