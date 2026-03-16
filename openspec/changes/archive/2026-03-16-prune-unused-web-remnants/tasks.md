## 1. Renderer Dead Code Pruning

- [x] 1.1 删除已证实无生产消费者的 renderer 文件，包括孤儿组件、工具函数、barrel 和未使用的 settings primitive
- [x] 1.2 收口 `agent-atoms.ts`、`api.ts`、`model-logo.ts`、settings/agent barrel 中的无消费者导出与兼容残留

## 2. Main and Shared Surface Reduction

- [x] 2.1 删除 main 侧无消费者 HTTP 管理接口与仅服务于这些接口或旧 workspace 流程的无调用 helper
- [x] 2.2 清理 `packages/shared` 中仅服务于已删除功能域的类型文件与顶层导出，并同步收口相关依赖/锁文件

## 3. Verification

- [x] 3.1 运行 `bun run typecheck`，确认清理后的 workspace 仍可通过类型检查
- [x] 3.2 完成一次当前 Web Agent 关键路径回归验证，确认页面加载、会话发送、消息流与权限交互未回退
