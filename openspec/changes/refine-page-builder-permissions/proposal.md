## Why

Page-builder 面向不懂编程的终端用户，当前对话流程中的文件读写等权限确认会频繁打断网页生成；但直接使用全局自动授权又会一起绕过 `AskUserQuestion`，破坏产品需要的用户确认流程。现在需要为 page-builder 会话引入更细粒度的权限策略，在减少打断的同时保留必要的人机确认。

## What Changes

- 为新建的 `page-builder` 工作区持久化显式的工作区标记，避免运行时依赖目录命名或文件内容推断工作区类型。
- 仅对带有 `page-builder` 标记的工作区会话应用专用权限策略：除 `AskUserQuestion` 外的工具请求自动放行，`AskUserQuestion` 继续走现有交互确认链路。
- 保持现有全局权限模式与普通 Agent 会话行为不变，不改变非 `page-builder` 工作区的权限交互。
- 该策略仅覆盖后续新建的 `page-builder` 工作区，不回填或迁移历史工作区数据。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `permission-interaction`: 调整权限交互要求，支持对 `page-builder` 会话自动放行非 `AskUserQuestion` 的工具调用，同时保留 `AskUserQuestion` 的前后端等待与恢复机制。
- `workspace-scoped-agent-runtime`: 调整工作区持久化要求，使新建的 `page-builder` 工作区保存可供运行时识别的模板/类型标记，用于解析工作区级权限策略。

## Impact

- 受影响代码主要包括工作区类型定义、工作区创建与索引持久化、Agent 权限编排与相关测试。
- 不引入新的外部依赖，不改变现有普通会话的公开 API 或默认权限行为。
- 工作区索引数据结构会增加一个用于新建 `page-builder` 工作区的可选标记字段。
