## Why

当前 page-builder 的 CMS MCP tools 在失败时大多只返回“发生了什么”，但没有明确告诉 agent 下一步应该怎么处理、哪些动作不能做，导致 agent 容易在 handoff 缺失、decision 失效、模板校验失败或上游 CMS 网关异常时重复错误重试、猜测参数，或者直接卡在不可恢复状态。

现在需要把 CMS tool 层的失败输出统一成可执行的错误指引，让 agent 在不暴露宿主内部细节的前提下，能够区分“应重新发起 handoff / 重新 decide / 修正模板 / 稍后重试 / 终止当前 CMS 路径”等恢复路径。

## What Changes

- 为 page-builder 会话中的 CMS runtime MCP tools 增加统一的 agent-facing 错误格式化层，覆盖 `list_catalogs`、`list_contents`、`decide_cms_binding` 与 `apply_cms_binding`。
- 为高频 CMS 失败场景补充明确的恢复指引，包括 handoff 缺失或过期、decision 缺失/已消费/已失效/冲突、apply 前置 revision 缺失、模板 contract/guardrail 校验失败，以及读取参数不合法等情况。
- 为上游 CMS 网关失败补充统一提示，明确何时可以重试、何时需要检查 CMS 配置或权限，并要求 agent 不得伪造 CMS 数据、栏目 ID、内容 ID 或 decision / handoff 上下文。
- 保持底层 domain error code、decision store 语义与 apply guardrail 语义不变，仅调整 CMS MCP tool 对 agent 暴露的错误文案与恢复建议。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `page-builder-cms-sdk-tools`: CMS runtime MCP tools 的失败输出需要变为统一、可执行的 agent 指引，而不是仅返回原始错误说明。
- `page-builder-cms-binding-decision-plan`: `decide_cms_binding` 遇到 handoff/decision 上下文失效、冲突或不可继续时，需要向 agent 返回明确的恢复方向与禁止行为。
- `page-builder-cms-rendering-apply-tool`: `apply_cms_binding` 遇到 decision 失效、revision 缺失、模板护栏冲突或 formal apply 失败时，需要向 agent 返回明确的修正或重走流程指引。

## Impact

- 受影响代码主要位于 [`apps/app/src/main/lib/cms-sdk-tools.ts`](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/cms-sdk-tools.ts) 及其测试 [`apps/app/src/main/lib/cms-sdk-tools.test.ts`](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/cms-sdk-tools.test.ts)。
- 现有 decision store、apply pipeline 与 CMS gateway 的底层错误仍继续保留，但其暴露给 agent 的文案会被 CMS tool 层统一收敛。
- 该变更会影响 page-builder 会话内 agent 调用 CMS tools 时看到的错误文本和恢复路径，但不引入新的外部 API，也不修改工作区 mcp 配置方式。
