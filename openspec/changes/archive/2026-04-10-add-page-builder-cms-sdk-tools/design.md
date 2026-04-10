## Context

当前 Proma 的 Agent 运行时已经稳定支持两类能力：

- 工作区持久化的外部 MCP 配置会在查询前被转换为 Claude Agent SDK 的 `mcpServers`
- 右侧对话区发送的最终 prompt 仍然以单个字符串传给 SDK

这套链路足以支撑外部 stdio/http/sse MCP，但不适合这次明确选择的路线 A：

- CMS 工具希望直接运行在 Proma 主进程内，复用已有配置、日志、权限和错误处理，而不是额外维护一个外部 MCP 进程
- SDK 的 `createSdkMcpServer()` 返回的是带 live instance 的 runtime config，不能进入现有 `workspace mcp.json` 的持久化模型
- 官方 SDK 已提供 `tool()`、`createSdkMcpServer()` 和 `prompt: string | AsyncIterable<SDKUserMessage>`，说明路线 A 在 SDK 能力上成立，但 Proma 当前适配层还没有把这些输入当作一等运行时对象来接
- 已确认的 CMS API 依赖 Cookie/Header 鉴权，且内容列表响应存在 `extendJSON`、`imagesTotal`、`videosTotal`、`filesTotal` 等异构字段，必须先由宿主统一归一化，不能把原始响应直接暴露给模型

本次变更的目标不是把 CMS picker、区块绑定和页面自动填充一口气做完，而是先把“Proma runtime 能稳定、安全地向 page-builder 会话提供进程内 CMS data tools”这条底层通路打通。

## Goals / Non-Goals

**Goals:**
- 让 `page-builder` 会话在 Agent 查询期间能够附加一个宿主创建的 runtime SDK MCP server `cms`
- 基于当前已确认的 CMS API 暴露最小只读工具集，覆盖栏目列表和内容列表读取
- 保持 CMS base URL、Cookie 和 Header 完全由宿主控制，不进入 prompt，也不要求模型传入
- 在运行时支持 `AsyncIterable<SDKUserMessage>` prompt，以兼容 SDK custom tools 路径
- 让 runtime CMS tool names 进入当前 query 的工具 allowlist，而不改变其他工作区会话的工具面

**Non-Goals:**
- 不在本次变更中增加 CMS picker modal、CMS 选择交互或 `RequestCmsSelection`
- 不做 block 绑定、页面自动填充或素材导入链路
- 不把进程内 SDK MCP server 持久化到工作区 `mcp.json`
- 不新增 CMS 设置 UI；首版凭据来源由宿主配置层提供
- 不把 CMS tool 能力扩展到所有工作区；默认只对受控的 `page-builder` 会话启用

## Decisions

### 1. 使用 runtime SDK MCP server，而不是外部 MCP 进程或持久化 `mcp.json`

本次选择在查询开始时动态构建：

- `tool()` 定义 CMS tools
- `createSdkMcpServer({ name: 'cms', tools: [...] })`
- 将生成的 runtime server 作为本次 query 的 `mcpServers.cms`

原因：

- 这正是路线 A 的核心能力，能把工具逻辑与宿主状态放在同一进程里
- 不需要维护额外进程、stdio 生命周期和外部安装依赖
- `McpSdkServerConfigWithInstance` 不可序列化，本身也不适合落入现有工作区 MCP 持久化模型

备选方案：

- 外部 MCP server：技术上更贴合现有实现，但违背用户已经明确选择的路线 A
- 持久化到 `mcp.json`：会把 runtime instance 伪装成静态配置，抽象层级错误

### 2. 新增 `CmsGateway` 作为唯一 CMS 访问入口

宿主侧新增 `CmsGateway`，负责：

- 读取宿主配置中的 CMS base URL、Cookie 和固定请求头
- 发起栏目列表与内容列表请求
- 解析并归一化 `extendJSON`
- 生成稳定的内容 shape、素材计数和摘要字段
- 把鉴权失败、超时和上游错误翻译为对模型和 UI 都可接受的工具错误

原因：

- 当前 CMS API 需要 `ZUSID`、`CurrentSite` 以及特定请求头，不能交给模型自己组织
- 内容列表响应是异构结构，若不在宿主统一归一化，后续 Agent 行为会极度脆弱

备选方案：

- 让 tool handler 直接拼 HTTP：会把鉴权、归一化和错误处理散落在多个 tool handler 中
- 前端直连 CMS：会暴露内部地址、Cookie 语义和 CORS 风险，不适合这个产品边界

### 3. 仅为受控的 `page-builder` 查询注入 runtime CMS server

runtime `cms` SDK MCP server 不应成为全局默认能力。系统只在满足受控策略时附加它，首版策略为：

- 会话所属工作区带有 `page-builder` 模板标记
- 宿主 CMS 配置存在且有效

原因：

- 本次变更的业务目标是服务 page-builder 场景，而不是改变普通工作区能力面
- 这样可以把影响面限制在最小范围，避免普通 Agent 会话无意获得新的内部数据源

备选方案：

- 所有工作区默认附加：影响面过大，且没有当前产品需求支撑
- 由用户消息显式引用后才附加：会把 runtime 能力发现做复杂，首版没有必要

### 4. 为 runtime CMS tools 切换到流式 `SDKUserMessage` 输入，但保持现有 prompt 语义

当 query 附加 runtime SDK MCP server 时，Proma 不再把最终 prompt 作为裸字符串传给 SDK，而是：

- 先继续沿用当前的动态上下文、隐藏上下文和可见消息拼接逻辑，得到最终的“组合用户消息”
- 再把该组合消息封装成一个单条 `SDKUserMessage` 的 `AsyncIterable`
- 将这个 iterable 传给 `sdk.query(...)`

这样做的原因：

- 路线 A 依赖 SDK custom tools 的 streaming input mode
- 现有消息装配逻辑已经稳定，没必要因为 transport 改变而重写 prompt 语义

备选方案：

- 继续传字符串：与 custom tools 路径不匹配，风险最高
- 直接重构为多消息流：收益不大，却会放大现有 resume/context 逻辑的变更面

### 5. 首版 CMS tool 集合保持只读且最小

首版只提供两类核心能力：

- `mcp__cms__list_catalogs`
- `mcp__cms__list_contents`

其中 `list_contents` 的归一化结果需要包含：

- 基础内容字段：`id`、`title`、`summary`、`publishUrl`
- 素材计数：`imagesTotal`、`audiosTotal`、`videosTotal`、`filesTotal`
- 归一化 shape：如 `single-article`、`gallery`、`video`、`file`、`mixed`
- 从 `extendJSON` 中可稳定解析出的图片/视频/文件提示信息

原因：

- 这两项与当前已经确认的 API 文档严格对齐
- 先把读路径做稳，比过早引入写操作、选择器交互或额外未确认 API 更可控

备选方案：

- 首版就补齐 `get_content_detail`：如果没有单独 detail API，会迫使实现走低效或不稳定的曲线救国路径
- 首版就做写操作：不符合当前“接入 CMS 数据源”的最小目标

### 6. 运行时 allowlist 必须显式合并 CMS tool names

Proma 当前在交互权限模式下会显式传 `allowedTools`。因此在当前 query 附加 `cms` runtime server 时，系统必须把对应的 `mcp__cms__*` 工具名加入 allowlist；当 query 不附加 `cms` server 时，保持现有 allowlist 行为不变。

原因：

- 否则即使 runtime server 已成功挂载，模型也无法在当前权限策略下调用这些工具
- 这能保持权限面精确到 query，而不是粗暴放宽所有工具

备选方案：

- 把 CMS tools 加进全局 `SAFE_TOOLS`：范围过大，且失去 query 级控制
- 完全绕开 allowlist：会破坏现有交互权限模型的一致性

## Risks / Trade-offs

- [runtime SDK MCP server 只存在于当前 query 生命周期，调试链路比持久化配置更隐式] → 通过单独的 builder/helper、明确日志和测试把可观测性补齐
- [改成流式 `SDKUserMessage` 输入后，若语义迁移不完整，可能影响现有 prompt 行为] → 保持“先拼好组合消息，再封装成单条 streamed user message”的保守策略，并补回归测试
- [CMS 鉴权依赖 Cookie/Header，配置错误会导致工具整体不可用] → 在 `CmsGateway` 中集中做配置校验和脱敏错误翻译
- [只基于栏目列表/内容列表接口做首版，信息密度可能不足以覆盖未来所有 block 映射场景] → 本次只承诺打通稳定读路径；更细粒度 detail / picker / block binding 作为后续变更处理

## Migration Plan

1. 扩展共享运行时类型，使 query 支持 streamed `SDKUserMessage` 和 runtime SDK MCP server 输入。
2. 更新 orchestrator 与 adapter，在保留现有持久化 MCP 行为的同时，按 query 合并 runtime `cms` SDK MCP server。
3. 新增 `CmsGateway` 和 `buildCmsSdkMcpServer`，并在受控的 `page-builder` 查询路径中启用。
4. 为 runtime merge、流式 prompt、allowlist 和 CMS 归一化补充测试。
5. 发布后仅影响符合策略的 `page-builder` 会话；如需回滚，只需停止附加 runtime `cms` server，并恢复原有字符串 prompt 路径。

## Open Questions

- 宿主 CMS 配置的最终来源采用哪条现有配置链路最合适：应用级设置、环境变量还是单独的安全配置文件？本次设计假定先由宿主安全配置层提供，但不定义 UI。
