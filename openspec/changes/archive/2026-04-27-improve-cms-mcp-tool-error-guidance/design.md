## Context

page-builder 会话中的 CMS 能力目前统一通过 [`apps/app/src/main/lib/cms-sdk-tools.ts`](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/cms-sdk-tools.ts) 挂载为 runtime SDK MCP tools，但各条调用链抛出的错误来源并不统一：有的来自 `CmsGateway`，有的来自 handoff / decision store，有的来自 `apply_cms_binding` 的 preflight 或 mutation pipeline。现状下这些错误大多只描述失败事实，缺少对 agent 的恢复指引，导致 agent 容易盲目重试、猜测 `handoffId` / `decisionId` 或伪造 CMS 数据。

本次变更的目标不是重写底层领域错误模型，而是在 CMS tool 注册边界增加一层统一的 agent-facing error formatting，把底层错误翻译成适合模型继续执行的失败说明。

## Goals / Non-Goals

**Goals:**

- 为 `mcp__cms__list_catalogs`、`mcp__cms__list_contents`、`mcp__cms__decide_cms_binding` 与 `mcp__cms__apply_cms_binding` 提供统一的错误格式化出口。
- 让常见 CMS 失败明确区分恢复路径，例如重新发起 handoff、重新 decide、修正模板/参数、稍后重试或终止当前 CMS 路径。
- 保持错误输出脱敏，不暴露宿主内部路径、凭据、token、Cookie 或其他内部上下文。
- 保持成功返回结构、底层 error code、decision/apply 语义不变，只改善 agent 看到的失败信息。

**Non-Goals:**

- 不修改 `CmsGateway`、handoff store、decision store 或 apply pipeline 的领域语义与失效规则。
- 不引入新的结构化错误协议、前端 UI 专用建议字段或额外的 MCP tool。
- 不扩展 CMS 功能面，不改变 page-builder 之外的会话行为。

## Decisions

### 1. 在 `cms-sdk-tools.ts` 集中做错误翻译

所有 page-builder CMS tools 都经由 `cms-sdk-tools.ts` 注册，这是唯一同时掌握 tool 名称、调用意图和底层异常的边界。把格式化逻辑集中在这里，可以在不污染底层领域层的前提下统一文案、测试和回退策略。

备选方案：

- 在各个 domain service 内直接改写错误文案。未采用，因为会把 agent 交互语义耦合进领域层，并增加后续多入口复用成本。
- 在上层 prompt 中补救。未采用，因为 prompt 无法可靠识别所有错误类别，也无法保证对每个 tool 输出一致行为。

### 2. 采用“错误分类 + tool 语境”的映射表

格式化器将按 tool 名称和错误类别做映射。错误类别优先使用稳定的 typed error / error code / status 信号，例如 handoff not found、handoff stale、decision stale、decision consumed、template contract failure、upstream auth failure、gateway transient failure、输入校验失败等；只有无法识别时才退回默认兜底消息。

这样可以把恢复路径稳定绑定到错误类别，而不是依赖脆弱的原始 message 文本匹配。

备选方案：

- 仅原样透传原始 message。未采用，因为无法保证 agent 能从中得到可执行恢复路径。
- 完全按 message 文本模糊匹配。未采用，因为对后续文案变更过于脆弱。

### 3. 输出单条 plain-text 错误，内联恢复指引

错误输出采用单条 plain-text 内容，内联包含三类信息：失败原因摘要、下一步动作、禁止行为。这样可以兼容当前 tool 错误消费方式，也避免依赖额外的建议字段或前端专用结构。

建议的指导语义将覆盖以下恢复分流：

- 重新发起 handoff
- 基于最新 handoff 重新 decide
- 修正模板或 tool 参数后再试
- 仅在瞬时上游失败时重试
- 终止当前 CMS 路径并暴露宿主侧问题

备选方案：

- 返回结构化 JSON 建议对象。未采用，因为当前目标是改善 agent 可读性，而不是引入新的工具协议。

### 4. 保留底层原始语义，但只暴露安全摘要

tool 层会尽量保留底层错误的关键语义，例如“decision 已失效”“当前 handoff 不可复用”“上游鉴权失败”，但不直接泄露凭据、内部路径、原始请求头或其他宿主私有实现细节。对于无法安全透传的细节，只暴露稳定摘要并给出恢复方向。

## Risks / Trade-offs

- [新增错误类型未被映射] → 提供默认兜底格式，并为现有高频错误建立覆盖测试，后续新增错误码时补充映射。
- [指导语过于强硬，掩盖真实原因] → 在每条消息中保留失败摘要，再附加恢复指引，而不是只输出模板化建议。
- [不同 tool 的恢复路径不一致] → 通过共享格式化器和错误分类表集中维护，避免散落在调用点。
- [未来需要给前端展示更细粒度状态] → 当前先固定为 plain-text；若未来确有需求，再在不破坏现有文本兼容性的前提下扩展结构化字段。

## Migration Plan

该变更无需数据迁移。实施时只需：

1. 在 `cms-sdk-tools.ts` 引入统一错误格式化层并包裹四个 CMS tools。
2. 为代表性错误类别补充单元测试，确保文案、脱敏和恢复方向稳定。
3. 部署后观察 page-builder 会话的 CMS tool 失败日志与 agent 行为是否按预期收敛。

回滚方式为直接回退本次 tool 层格式化逻辑；底层 domain 语义与数据模型不会受影响。

## Open Questions

无。当前范围已收敛为 CMS tool 层 agent 指引增强。
