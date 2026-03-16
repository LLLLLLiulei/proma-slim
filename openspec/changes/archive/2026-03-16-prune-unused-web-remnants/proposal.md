## Why

前一轮精简后，Proma 已经收敛为 Bun + React 的 Web Agent 应用，但仓库里仍残留一批没有运行时入口、没有消费者或仅服务于已删除功能的代码表面。这些残留会放大后续维护噪音，也会让后续清理时难以区分“还能跑的运行时能力”和“已经失效的历史兼容层”。

现在需要用一次受控的 spec 驱动清理，把当前 Web 版真正支持的边界重新收紧，只删除已被证实无用的代码，并保留会话、消息流、权限交互和代理注入等主链能力。

## What Changes

- 删除 renderer 中已证实无生产消费者的组件、工具函数、barrel 导出和设置页 primitive 残留。
- 收口活跃文件中的无消费者导出与状态面，移除仅服务于旧 Team、旧高级参数或旧设置模型的残留定义。
- 删除 main 侧没有前端入口、也不参与当前运行主链的 HTTP 管理接口与无调用 helper。
- 清理 `packages/shared` 中仍暴露的旧 Chat/Channel 类型域及其孤儿导出，保留当前 Web Agent 运行所需的共享类型。
- 保留 Bun Web Agent 的核心运行时能力，包括会话 CRUD、SSE 消息流、Permission/AskUser、消息持久化、运行时初始化和代理注入链路。
- 通过 `bun run typecheck` 和关键路径回归验证，确认清理不会破坏当前 Web Agent 主流程。

## Capabilities

### New Capabilities
- `unused-code-pruning`: 定义当前 Web Agent 代码库中“无运行时入口、无消费者、仅历史兼容残留”的代码应如何被识别、删除和验证。
- `runtime-surface-retention`: 定义清理过程中必须保留的运行时能力边界，以及哪些无消费者管理表面可以移除而不影响当前产品。

### Modified Capabilities
- None.

## Impact

- Affected code: `apps/electron/src/renderer/`, `apps/electron/src/main/`, `packages/shared/src/types/`, `apps/electron/package.json`, `bun.lock`
- Affected systems: renderer export surface, Bun HTTP route surface, shared type surface, Web Agent runtime boundary
- Verification: `bun run typecheck`，以及当前 Web Agent 的页面加载、会话发送、消息流与权限交互回归验证
