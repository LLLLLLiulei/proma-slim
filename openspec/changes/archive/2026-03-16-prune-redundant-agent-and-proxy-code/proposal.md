## Why

前一轮 `simplify-to-claude-code-chat` 已经把工程收缩成 Web 版 Claude Code 应用，但代码库里仍残留一批没有运行时入口的 renderer 组件、上下文、主进程辅助模块和依赖声明。与此同时，代理链路已经从 UI 中移除，却仍混杂着少量仅服务于旧设置页的 API 包装和管理入口，容易让后续清理误删真正仍在工作的运行时代理能力。

现在需要用 spec 驱动一次收口，明确哪些遗留代码可以删除、哪些代理能力必须保留，以便后续实现和验证有稳定边界。

## What Changes

- 删除已确认无运行时引用的 renderer 壳层、占位组件、上下文、原子状态和工具函数。
- 删除已确认无调用的主进程遗留模块和仅服务于已删除功能的依赖声明。
- 精简 renderer 侧和 Web API 层的代理设置遗留包装，避免继续暴露未被使用的管理表面。
- 保留 Agent 运行时仍依赖的代理配置读取、系统代理探测和 SDK 环境变量注入能力。
- 清理 `@proma/shared` 中与已删除域功能对应、且无消费者的导出与类型文件。
- 通过 typecheck 和针对性手测验证会话、消息流和代理相关运行链路未回退。

## Capabilities

### New Capabilities
- `lean-agent-codebase`: 定义 Web 版 Agent 应用在删减后应保持的精简代码库边界，包括删除不可达模块、孤儿导出和冗余依赖。
- `runtime-proxy-preservation`: 定义代理相关遗留代码清理时必须保留的运行时能力，以及允许移除的无调用管理表面。

### Modified Capabilities
- None.

## Impact

- Affected code: `apps/electron/src/main/`, `apps/electron/src/renderer/`, `packages/shared/`, `apps/electron/package.json`
- Affected systems: session UI shell, renderer API wrapper layer, proxy configuration/runtime path, shared type exports
- Verification: `bun run typecheck`, 关键会话流程回归验证，代理相关运行链路验证
