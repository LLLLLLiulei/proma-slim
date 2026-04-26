## Why

当前 `page-builder` 的系统提示词、动态上下文、根级 `CLAUDE.md`、bootstrapped skill 和 worker skill 之间存在明显的重复与错层，导致模型在同一轮里反复阅读相近规则，同时 `taste-skill` / `redesign-skill` 仍保留偏 React/Next.js 工程的默认假设，和 page-builder 的 HTML 工作流不一致。现在需要在不改变宿主 owner/handoff/CMS 受控链路的前提下，做一次保守的提示词分层收敛，先修正错误默认和职责边界，再降低提示词冲突。

## What Changes

- 收敛 `system prompt` 与 `dynamic context` 的职责边界，删除明显自重复内容，并把运行时 scratch 说明限制为当前事实与最小使用说明。
- 精简 page-builder 根级 `CLAUDE.md`，只保留工作区共享硬边界、普通用户交互边界、输出规则与 CMS 高层安全边界，不再重复 ordinary flow 细节。
- 保持 `page-builder-guided-generation` 作为 ordinary owner，但压缩其与 `CLAUDE.md` 的重复文案，保留 owner 专属的提问、确认、分派和 ordinary CMS 边界。
- 为 `taste-skill` 与 `redesign-skill` 增加 page-builder 专属顶层 override，使其在 page-builder 中默认遵守 `workspace-files` 输出、HTML-first 作者态和 CMS islands 边界，而不再优先假设 React / Next.js / Tailwind / package.json 工程环境。
- 保留现有 `<page_builder_turn_routing>`、bootstrapped skill、owner lock、confirmed CMS apply 与 MCP tool 链路，不在本次 change 中引入新的 bootstrap 摘要机制或替换宿主分流方式。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-prompt-layering`: 收敛 `system prompt`、dynamic context、根级 `CLAUDE.md`、bootstrapped owner skill 与 visual worker 的职责分层，减少重复并保留宿主控制的 owner / scene 机制。
- `page-builder-guided-generation`: 明确 ordinary owner 文案只保留 owner 协议与 lightweight CMS 边界，并要求其调度的 visual workers 继承 page-builder 的 HTML-first、`workspace-files` 输出与 CMS 高层约束。
- `workspace-capability-surface`: 收敛 workspace prompt context 中的事实层与规则层，保留运行时路径与可访问资源说明，同时把通用 subagent 行为规则从 dynamic context 收回到更高层的系统提示词。

## Impact

- Affected code: `apps/app/src/main/lib/agent-prompt-builder.ts`, `apps/app/resources/templates/page-builder-workspace-claude.md`, `apps/app/default-skills/page-builder-guided-generation/SKILL.md`, `apps/app/default-skills/taste-skill/SKILL.md`, `apps/app/default-skills/redesign-skill/SKILL.md`
- Affected tests: page-builder prompt/skill/template related tests under `apps/app/src/main/lib/`
- Systems: page-builder prompt layering, skill surfacing semantics, visual worker execution contract
