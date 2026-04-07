## Why

当前运行时系统提示词与工作区 `CLAUDE.md` 模板仍会向模型暴露品牌名和底层实现身份，导致助手在用户对话中可能把自己描述为特定产品或底层运行时，而不是仅以职责身份交流。随着 page-builder 等用户面场景持续收敛，这类品牌/实现暴露已经影响对话一致性，也不符合“只呈现任务助手身份”的产品目标。

## What Changes

- 新增一组关于助手对外身份的运行时规则，要求助手始终只以职责身份交流，不暴露品牌名、模型名、CLI、SDK 或其他底层实现身份。
- 收敛运行时系统提示词中的品牌化措辞，将工作区语义、scratch/repo 边界和回复约束改为中性宿主表述。
- 更新 page-builder 工作区 `CLAUDE.md` 模板中的品牌化描述，避免在 project-level prompt surface 中继续注入产品名或底层身份暗示。
- 补充验证，确保提示词构建与模板初始化后，模型可见文本不再要求或鼓励自称具体品牌/底层身份。

## Capabilities

### New Capabilities
- `assistant-runtime-identity`: 定义助手在运行时系统提示词与工作区模板中的对外身份约束，确保其始终以中性职责身份与用户交流。

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `apps/app/src/main/lib/agent-prompt-builder.ts`
  - `apps/app/resources/templates/page-builder-workspace-claude.md`
  - `apps/app/resources/templates/page-builder-workspace-claude.zh-CN.md`
  - `apps/app/src/main/lib/workspace-template-service.ts`
  - related prompt/template tests
- No public API changes.
- No dependency changes expected.
