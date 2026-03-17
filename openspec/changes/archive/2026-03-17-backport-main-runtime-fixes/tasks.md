## 1. Streaming Behavior Backport

- [x] 1.1 对照上游 `b8a11dd` 的最终行为与当前 `packages/ui/src/hooks/useSmoothStream.ts` 实现，确定需要迁移的最小算法差异。
- [x] 1.2 更新 `packages/ui/src/hooks/useSmoothStream.ts`，使流式文本保持渐进有序输出，并在流结束后渐进排空剩余内容而不是一次性跳出。
- [x] 1.3 调整 Agent 消息渲染链路中与流式体验直接相关的组件逻辑，确保流式期间不会因 `content-visibility` 或渲染引用抖动导致卡顿或跳变。
- [x] 1.4 已核查 `message.tsx` 的最小迁移范围，当前未出现需要在“最小迁移 / 完整迁移”之间交由用户确认的 UI 冲突。
- [x] 1.5 为流式文本平滑输出、结束排空和新一轮发送起点行为补充或更新测试。

## 2. Friendly SDK Error Handling

- [x] 2.1 在当前 Agent 运行时提取一个共享的“原始错误 -> 用户友好提示”映射点，覆盖适配器与 orchestrator 的错误出口。
- [x] 2.2 接入已确认有效的登录、认证、API Key 或 Base URL 配置错误模式映射，同时保留原始错误用于日志或错误详情。
- [x] 2.3 为已知错误友好化与未知错误透传补充或更新测试，确保前端展示与持久化语义一致。

## 3. SDK Upgrade Evaluation

- [x] 3.1 按最新确认范围，将 `@anthropic-ai/claude-agent-sdk` 升级到 `0.2.76` 纳入本次 change，并同步更新设计结论。
- [x] 3.2 更新依赖版本与锁文件，并检查当前工作区运行时、会话恢复和 MCP 透传是否出现回归。
- [x] 3.3 升级后未发现与当前分支工作区/UI 定制冲突的新行为，相关运行时与页面回归通过。

## 4. Regression Verification

- [x] 4.1 在 SDK 升级后重新运行 `bun run typecheck`、`bun test`、`bun run build`，确认本次回迁未破坏当前主分支。
- [x] 4.2 在 SDK 升级后重新使用 Playwright 对 Agent 对话主链做回归，重点验证流式输出节奏、已知错误提示和工作区作用域运行时不受影响。
- [x] 4.3 重新汇总最终纳入与排除的上游修复项，为后续 OpenSpec 归档与提交说明准备变更摘要。

## Implementation Notes

- 纳入：上游 `b8a11dd` 的平滑流式排空目标行为，按当前分支结构兼容移植到 `useSmoothStream`，并补上新一轮发送起点与渐进排空测试。
- 纳入：上游 `b8a11dd` 中对 markdown 渲染稳定引用的思路，最小化落地到 `message.tsx`，避免流式期间每帧重建插件与组件映射。
- 纳入：上游 `ae0c450` 的“SDK 原始错误 -> 用户友好提示”思路，但改写为适配当前基于 `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` 的产品形态。
- 纳入：上游 `550d85f` 的 SDK 升级，当前分支已升级到 `@anthropic-ai/claude-agent-sdk@0.2.76`，并补充版本钉住测试。
- 排除：上游 `b8a11dd` 中已不适用于当前分支的路径 chip、图片预览、后台任务面板等 UI 结构差异。
- 升级后验证：`bun run typecheck`、全量 `bun test`、`bun run build` 通过；Playwright MCP 在 `http://127.0.0.1:3211` 完成升级后真实对话回归，运行时日志确认实际请求使用 `0.2.76`。
