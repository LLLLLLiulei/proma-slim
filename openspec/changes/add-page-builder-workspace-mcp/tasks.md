## 1. Page-builder workspace bootstrap

- [x] 1.1 提取 page-builder 工作区初始化 helper，在专用模块中集中定义默认 MCP 服务器清单与幂等 merge 逻辑
- [x] 1.2 接入 `template: 'page-builder'` 的工作区创建链路，使新建 page-builder 工作区在初始化 `CLAUDE.md` 的同时补齐 `mcp.json` 中缺失的 `playwright` 与 `server-sequential-thinking`
- [x] 1.3 确保普通工作区与已有手动 MCP 配置不受影响，重复初始化时不覆盖用户已有的同名服务器配置

## 2. Workspace MCP runtime mapping

- [x] 2.1 更新 `agent-orchestrator` 的工作区 MCP 构建逻辑，只从工作区持久化且启用中的 MCP 条目生成 Claude Agent SDK `mcpServers`
- [x] 2.2 为 stdio MCP 映射补齐 `PATH` 合并、`startup_timeout_sec` 和 `required: false`，并让 http/sse 条目同样按非必需服务传递
- [x] 2.3 保持当前运行时不注入任何额外的动态 MCP、会话级 MCP 或与工作区配置无关的内置 MCP

## 3. Tests and verification

- [x] 3.1 为 page-builder 工作区创建与初始化补充测试，覆盖默认 MCP 写入、普通工作区不写入以及重复初始化不覆盖已有配置
- [x] 3.2 为工作区 MCP 到 SDK 参数的装配补充测试，覆盖 stdio `PATH` 合并、超时映射、`required: false` 与普通工作区回归场景
- [x] 3.3 运行目标测试并记录结果，确认 page-builder 默认 MCP 初始化链路与 Agent 运行时映射行为符合变更 spec
