## Why

`page-builder` 后续要从内部 CMS 读取栏目和内容数据来驱动页面内容，但当前 Proma 运行时只支持持久化的外部 MCP 配置和字符串形式的 SDK prompt。既然本次明确选择 Agent SDK 的进程内 custom tools 路线，就需要先补齐运行时对 SDK MCP server、流式用户消息输入和宿主管理 CMS 鉴权的支持。

## What Changes

- 为 `page-builder` 会话新增宿主运行时创建的 CMS SDK MCP server，而不是要求额外启动外部 MCP 进程或修改工作区 `mcp.json`
- 新增只读 CMS tools，对应当前已确认的栏目列表与内容列表 API，并返回归一化结果供 Agent 使用
- 引入宿主侧 `CmsGateway`，统一处理 CMS base URL、Cookie/Header 鉴权、错误翻译和响应归一化
- 升级 Agent 查询链路，使需要 runtime SDK tools 的查询可以使用 `AsyncIterable<SDKUserMessage>` 输入，同时保持现有隐藏上下文拼接语义
- 在运行时 allowlist / 权限链路中显式放行当前 query 附加的 CMS tool 名称，而不扩大其他会话的工具面
- 不在本次变更中引入 CMS picker modal、block 绑定持久化或自动填充页面内容

## Capabilities

### New Capabilities
- `page-builder-cms-sdk-tools`: `page-builder` 会话可以通过宿主创建的进程内 SDK tools 读取内部 CMS 的栏目和内容数据，并获得稳定的归一化结果

### Modified Capabilities
- `workspace-scoped-agent-runtime`: Agent 查询运行时可以在保留工作区持久化 MCP 语义的同时，按受控策略合并宿主创建的 runtime SDK MCP servers，并为其切换到流式用户消息输入路径

## Impact

- `apps/app/src/main/lib/agent-orchestrator.ts`
- `apps/app/src/main/lib/adapters/claude-agent-adapter.ts`
- `packages/shared/src/types/agent-provider.ts` 及相关运行时类型
- 新增宿主侧 CMS gateway 与 runtime SDK MCP builder 模块
- 运行时 `allowedTools` / 权限策略装配
- 针对 CMS 鉴权、响应归一化、runtime MCP merge 和流式 prompt 路径的测试
