## 1. Runtime Query Support

- [x] 1.1 扩展共享运行时类型，使 Agent 查询支持 streamed `SDKUserMessage` 输入与 runtime SDK MCP server 配置
- [x] 1.2 更新 Claude adapter，使其能够向 SDK 透传 `AsyncIterable<SDKUserMessage>` prompt 和 runtime `McpServerConfig`
- [x] 1.3 更新 orchestrator，在受控的 `page-builder` 查询中构建并合并 runtime `cms` SDK MCP server

## 2. CMS Runtime Tools

- [x] 2.1 实现宿主侧 `CmsGateway`，统一处理栏目列表、内容列表、鉴权请求头、Cookie 和错误翻译
- [x] 2.2 实现 CMS 响应归一化，输出稳定的栏目树、内容摘要、素材计数和内容 shape
- [x] 2.3 使用 `tool()` 与 `createSdkMcpServer()` 构建 runtime `cms` SDK MCP server，并暴露只读 `list_catalogs` 与 `list_contents` tools
- [x] 2.4 将 runtime `mcp__cms__*` tool names 并入当前 query 的 allowlist，而不影响无关会话

## 3. Verification

- [x] 3.1 为 runtime MCP merge、非持久化语义和 streamed prompt 路径补充单元测试
- [x] 3.2 为 CMS 鉴权脱敏、错误映射和响应归一化补充测试
- [x] 3.3 验证 `page-builder` 会话可以调用 CMS tools，而普通工作区仍保持原有运行时行为
