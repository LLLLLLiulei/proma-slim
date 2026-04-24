## Why

当前对话页中的工具调用、技能调用、MCP 工具调用和权限提示仍直接显示 `AskUserQuestion`、`Skill`、`mcp__cms__apply_cms_binding` 这类英文内部名称，普通用户在阅读执行过程时理解成本偏高。既然这些名称只属于前端展示层，就应该在不改动后端事件协议和真实工具名的前提下，将常见工具、首批第一方 MCP 工具和内置 skill 的显示名称本地化为中文。

## What Changes

- 为对话页工具活动列表增加一层前端展示名称映射，将常见内置工具、首批第一方 MCP 工具与内置 skill 的显示名称翻译为中文。
- 保持底层 `toolName`、skill slug、事件持久化结构和后端协议不变；本次修改仅影响前端展示效果。
- 未命中中文映射的工具名、MCP 调用名、skill 名或调用名 SHALL 直接显示原名称，不引入“未知工具”“未知技能”“未知 MCP”等兜底文案。
- 权限提示横幅中的工具名称 SHALL 与对话页工具活动列表复用同一套前端展示名称格式化逻辑，避免同一工具在不同位置出现不一致名称。
- 本次修改会明确首批中文映射清单，包括当前活动列表中已处理的内置工具、第一方运行时 MCP 工具，以及 `apps/app/default-skills` 中默认提供的内置 skill。
- 本次修改不调整消息正文中用户自己输入的 `/skill:xxx`、`#mcp:xxx` mention 展示，也不改变 MCP 工具的底层调用语义。

## Capabilities

### New Capabilities

### Modified Capabilities
- `tool-activity-display`: 修改对话页工具活动展示要求，常见工具、第一方 MCP 工具与内置 skill 调用在前端 SHALL 以中文名称展示，未命中映射时保留原名称。
- `permission-interaction`: 修改权限横幅中的工具名称展示要求，使其与工具活动列表一致地使用前端本地化名称映射，而不直接显示内部英文工具名或第一方 MCP 调用名。

## Impact

- Affected code:
  - `apps/app/src/renderer/components/agent/ToolActivityItem.tsx`
  - `apps/app/src/renderer/components/agent/PermissionBanner.tsx`
  - new shared agent tool/skill label formatter in renderer code
  - related renderer tests
- Affected systems:
  - agent conversation tool activity display
  - permission request banner display
  - first-party MCP tool name presentation
- Out of scope:
  - backend tool events and persistence schema
  - message body mention chips such as `/skill:...` and `#mcp:...`
