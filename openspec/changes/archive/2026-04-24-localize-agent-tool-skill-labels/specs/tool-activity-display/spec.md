## ADDED Requirements

### Requirement: 工具活动名称必须支持前端中文展示映射
系统 SHALL 在对话页工具活动展示中，对常见内置工具名称、第一方 MCP 工具调用名称和已知内置 skill 调用名称应用前端中文展示映射；未命中映射时，系统 SHALL 直接显示原名称，而不得生成“未知工具”“未知技能”“未知 MCP”或其他兜底文案。

#### Scenario: 已知工具名称显示中文
- **WHEN** 对话页展示一个命中前端工具名称映射的工具活动，例如 `AskUserQuestion` 或 `Skill`
- **THEN** 系统 SHALL 在工具活动标题中显示对应的中文名称
- **AND** 系统 SHALL 不直接暴露该工具的英文内部名称作为主展示标签

#### Scenario: 第一方 MCP 工具名称显示中文
- **WHEN** 对话页展示一个命中第一方 MCP 工具名称映射的工具活动，例如 `mcp__cms__apply_cms_binding`
- **THEN** 系统 SHALL 在工具活动标题中显示对应的中文名称
- **AND** 系统 SHALL 保持该本地化只作用于前端展示，而不改变底层 MCP 工具调用名

#### Scenario: 已知内置 skill 调用显示中文
- **WHEN** 对话页展示 `Skill` 工具，且其摘要中的 skill 调用名命中已知内置 skill 中文映射
- **THEN** 系统 SHALL 在摘要中显示该 skill 的中文名称
- **AND** 系统 SHALL 支持直接使用 skill slug 或 `<workspace-slug>:<skill-slug>` 形式的调用名进行匹配

#### Scenario: 未命中映射时保留原名称
- **WHEN** 对话页展示的工具名、MCP 调用名或 skill 调用名未命中中文映射
- **THEN** 系统 SHALL 直接显示原名称
- **AND** 系统 SHALL NOT 生成额外的未知类型兜底文案
