## Context

当前工程已经具备工作区级 MCP 的基础能力：每个工作区都可以持久化自己的 `mcp.json`，`agent-orchestrator` 也会把工作区启用中的 MCP 转成 Claude Agent SDK 的 `mcpServers` 参数后透传给 adapter。这说明底层链路已经存在，缺的是 page-builder 场景的默认初始化与运行时细节补齐。

目前 `page-builder` 工作区在创建时只会初始化 `CLAUDE.md`，不会自动写入浏览器预览或结构化推理相关的 MCP 配置。结果是同一个工作区下的新会话虽然共享 `CLAUDE.md`，但仍然缺少稳定的 Playwright MCP 与 sequential-thinking MCP，用户必须靠手动配置或在消息里塞提示词弥补。

用户已经明确限制本次方案边界：
- 不使用运行时动态注入 MCP。
- 只对 `page-builder` 创建或接管的新工作区自动写入默认配置。
- 不处理历史工作区回填。
- 继续基于当前 Proma 的工作区 `mcp.json` 与程序化 `mcpServers` 透传方式实现，而不是切换到另一套配置来源。

因此，这次设计的重点不是“新增 MCP 体系”，而是把现有工作区级 MCP 能力补齐为 page-builder 的默认体验。

## Goals / Non-Goals

**Goals:**
- 为新建的 `page-builder` 工作区自动持久化默认 MCP 配置，并让该配置对工作区下的所有会话持续生效。
- 复用当前工程已有的 `WorkspaceMcpConfig` 存储结构和 `options.mcpServers` 透传链路，不额外引入新的配置面。
- 让 stdio MCP 在传给 Claude Agent SDK 时具备稳定的启动环境和超时配置，避免因 Electron 进程环境差异导致启动失败。
- 将 page-builder 的初始化逻辑保持在专用模块中，而不是继续把模板、MCP、权限等产品特性堆叠进通用的 `workspace-service.ts`。
- 保持普通工作区、历史工作区和现有手动 MCP 配置行为不变。

**Non-Goals:**
- 不为普通工作区自动注入任何 MCP。
- 不为历史 `page-builder` 工作区做扫描、迁移或回填。
- 不在本次改动中新增 MCP 设置 UI、测试按钮或前端配置面。
- 不切换到 SDK 自动发现的 `.mcp.json` / `settingSources` 方案。
- 不引入运行时临时拼接的内置 MCP、会话级 MCP 或产品级全局 MCP。

## Decisions

### 1. 继续使用 Proma 现有的工作区 `mcp.json` 作为唯一事实来源

默认的 page-builder MCP 将写入当前工作区自己的 `mcp.json`，格式继续使用现有 `WorkspaceMcpConfig`：
- `playwright`
- `server-sequential-thinking`

这两个条目都作为普通工作区 MCP 服务器存储，后续仍由现有的 `getWorkspaceMcpConfig(workspaceSlug)` 读取，并在 Agent 查询时转换为 SDK `mcpServers`。

选择这一方案，而不是依赖 Claude SDK 的 `.mcp.json` 自动发现或运行时注入，有三个原因：
- 当前工程已经有成熟的工作区 MCP 存储与传递链路，直接复用改动最小，也最符合“不要重写”的要求。
- 工作区 `mcp.json` 能天然保证“对该工作区下所有会话持续生效”，而不是只在某一轮对话里生效。
- SDK 自动发现配置会把配置来源分散到另一套文件约定中，反而削弱 Proma 当前“工作区能力由主进程统一管理”的边界。

### 2. page-builder 默认 MCP 初始化放到专用引导模块，而不是写死在通用 CRUD 里

`createAgentWorkspace(..., { template: 'page-builder' })` 仍然是触发入口，但实际的 page-builder 初始化应由专用 helper 承担，例如由 `workspace-template-service` 扩展，或新增一个紧邻模板初始化的 page-builder bootstrap 模块，统一负责：
- 生成 `CLAUDE.md`
- 写入默认 MCP 配置
- 保证初始化过程幂等，避免未来重复调用时覆盖用户后续手工修改

不建议把默认 MCP 定义和 merge 规则继续直接塞进 `workspace-service.ts`，因为：
- `workspace-service.ts` 已经承担工作区索引、目录结构、Skills、MCP CRUD、附加目录等多类职责；
- page-builder 是模板化产品行为，和通用工作区 CRUD 的抽象层级不同；
- 后续 page-builder 若继续扩展模板资源、预置文件或初始化策略，专用引导模块更容易演进和测试。

### 3. 默认服务器定义固定且显式，只在新建 page-builder 工作区时写入缺失项

默认配置应明确声明两个 stdio MCP：

- `playwright`
  - `type: "stdio"`
  - `command: "npx"`
  - `args: ["@playwright/mcp@latest", "--headless", "--browser", "chrome"]`
- `server-sequential-thinking`
  - `type: "stdio"`
  - `command: "npx"`
  - `args: ["-y", "@modelcontextprotocol/server-sequential-thinking@latest"]`

设计上应把这份默认定义集中在单一常量或 helper 中，由初始化流程统一写入。写入策略采用“仅补齐缺失服务器，不覆盖现有同名配置”的保守 merge：
- 对全新 page-builder 工作区，结果就是完整写入这两个默认 MCP。
- 对未来可能重复触发初始化的场景，不会把用户已经修改过的同名配置覆盖掉。

选择保守 merge，而不是每次模板初始化都强制重写，原因是 MCP 配置属于用户可能继续调整的工作区能力面，一旦覆盖会破坏用户自主配置。

### 4. `agent-orchestrator` 按原始工程的成熟做法补齐 stdio MCP 映射细节

当前 `buildWorkspaceMcpServers(workspaceSlug)` 已能把启用中的工作区 MCP 转成 SDK 参数，但对 stdio MCP 还缺两类关键细节：
- Electron/Node 进程的 `PATH` 没有并入 `entry.env`，可能导致 `npx` 或其子进程找不到依赖。
- `entry.timeout` 没有映射成 SDK 侧的 `startup_timeout_sec`，重型 stdio MCP 首次启动时缺少明确超时控制。

本次设计沿用原始工程已经验证过的映射方式：
- stdio MCP 合并 `PATH` 到 `env`
- 将 `timeout` 映射到 `startup_timeout_sec`
- 为 MCP 条目标记 `required: false`
- http/sse MCP 保持现有 `url`/`headers` 映射，同时同样设置 `required: false`

明确不做的内容：
- 不额外注入 `mem`、Nano Banana 或其他产品级动态 MCP
- 不增加会话级 `customMcpServers`
- 不在运行时根据 prompt 或页面状态临时拼接 MCP

### 5. 测试应覆盖“初始化持久化”和“运行时映射”两条主线

本次改动最容易回归的点不在 UI，而在工作区初始化和 SDK 参数装配，因此测试重点应是：
- 工作区创建测试：`template: 'page-builder'` 时会写入默认 MCP，普通工作区不会写入。
- 幂等测试：重复执行 page-builder 初始化不会清空或覆盖已有 MCP 自定义值。
- 编排测试：工作区 MCP 转成 SDK `mcpServers` 时，stdio 条目会带上 `PATH`、`startup_timeout_sec` 和 `required: false`。
- 回归测试：普通工作区已有的手动 MCP 配置仍能按原样传给 adapter。

这组测试能直接锁住产品真实依赖的行为边界，而不是停留在文件存在与否。

## Risks / Trade-offs

- [默认 MCP 依赖 `npx` 与外部包首次解析，启动可能偏慢] → 通过显式 `startup_timeout_sec` 和 `PATH` 合并提高成功率；若后续发现稳定性不足，再考虑版本锁定或本地安装策略。
- [使用 `@latest` 会带来上游版本漂移] → 当前阶段接受这类漂移，以换取安装简便；后续若出现兼容问题，可在不改架构的前提下单独收紧版本。
- [只对新建 page-builder 工作区自动写入，历史工作区仍然缺失默认 MCP] → 与当前边界保持一致；如有个别历史项目需要处理，再走人工迁移或专门脚本，不在本次自动化处理。
- [page-builder 引导逻辑拆分后会新增一个专用模块] → 模块数量增加，但职责边界更清晰，可降低后续继续把产品特性堆进通用服务的风险。

## Migration Plan

1. 新增 page-builder 工作区默认 MCP 定义与初始化 helper，并将其挂到现有 `template: 'page-builder'` 的工作区创建链路上。
2. 让初始化流程在写入 `CLAUDE.md` 的同时补齐 `mcp.json` 中缺失的默认服务器，但不覆盖已有同名配置。
3. 更新 `agent-orchestrator` 的工作区 MCP 转换逻辑，为 stdio/http/sse 条目补齐与 SDK 对接所需的字段。
4. 补充工作区创建与编排测试，锁定 page-builder 默认 MCP 初始化和 SDK 映射行为。
5. 发布后仅影响新创建的 page-builder 工作区；如需回滚，可停止初始化默认 MCP 并恢复原编排映射逻辑，已有 `mcp.json` 仍可被安全忽略或保留。

## Open Questions

- None.
