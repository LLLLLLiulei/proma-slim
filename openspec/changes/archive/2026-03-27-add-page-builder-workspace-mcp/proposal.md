## Why

当前 `page-builder` 工作区虽然已经具备工作区级 `mcp.json` 持久化与 Claude Agent SDK `mcpServers` 透传能力，但新建项目后并不会自动具备网页构建所需的浏览器预览与结构化推理工具。结果是普通用户需要手动配置 MCP，或继续依赖不直观的提示词注入，这与 `page-builder` 面向非技术用户的即开即用目标不一致。

## What Changes

- 为新创建的 `page-builder` 工作区自动写入默认 MCP 配置，并在工作区级持久化保存 `playwright` 与 `server-sequential-thinking` 两个 stdio 服务。
- 让这些默认 MCP 配置对该工作区下的所有会话持续生效，而不是在单次对话或单次运行时临时注入。
- 补齐 Agent 运行时对工作区 MCP 配置的映射细节，使 stdio MCP 在传递到 Claude Agent SDK 时保留必要的启动环境与超时配置。
- 明确本次方案不引入运行时动态 MCP 注入，也不要求回填或迁移历史工作区。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-app`: 新建 `page-builder` 项目时必须为工作区自动准备网页构建所需的默认 MCP 服务，使后续 builder 会话无需用户手动配置即可使用浏览器预览与辅助推理能力。
- `workspace-scoped-agent-runtime`: 工作区级持久化 MCP 配置传递给 Claude Agent SDK 时，必须按工作区模板解析默认服务，并为 stdio MCP 补齐稳定的启动环境与超时映射，同时禁止依赖运行时临时注入。

## Impact

- 受影响代码主要位于 [workspace-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/workspace-service.ts)、[workspace-template-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/workspace-template-service.ts)、[agent-orchestrator.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/agent-orchestrator.ts) 与 [claude-agent-adapter.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/adapters/claude-agent-adapter.ts)。
- 需要补充工作区创建与运行时相关测试，覆盖 `page-builder` 默认 MCP 初始化、普通工作区不受影响，以及工作区 MCP 到 SDK 参数的映射行为。
- 不涉及外部 API 破坏性调整；影响范围集中在 `page-builder` 工作区初始化链路与 Agent 运行时配置装配。
