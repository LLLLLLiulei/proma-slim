## 1. Workspace Template Persistence

- [x] 1.1 扩展 `AgentWorkspace` 共享类型与工作区索引读写逻辑，支持持久化可选的 `template` 字段
- [x] 1.2 更新 `createAgentWorkspace(..., { template: 'page-builder' })` 的创建路径，仅为新建 page-builder 工作区写入 `template: 'page-builder'`
- [x] 1.3 为普通工作区与 page-builder 工作区的索引持久化差异补充测试，确保历史/普通工作区不被强制写入新标记

## 2. Effective Permission Strategy

- [x] 2.1 在 Agent 编排层根据会话所属工作区解析有效权限策略，识别 `template: 'page-builder'` 的工作区
- [x] 2.2 调整 page-builder 会话的 SDK 权限配置，确保其保留 `canUseTool` 链路并禁用 `bypassPermissions`
- [x] 2.3 保持普通工作区继续遵循现有全局 `agentPermissionMode` 行为，并为该优先级分流补充编排测试

## 3. Page-Builder Permission Handling

- [x] 3.1 在权限服务中加入 page-builder 专用分支，对除 `AskUserQuestion` 外的工具请求直接返回 `allow`
- [x] 3.2 保持 `AskUserQuestion` 在 page-builder 会话中继续走现有 `ask_user_request` / resolve 交互链路
- [x] 3.3 为 page-builder 会话的非 AskUser 自动放行与 AskUser 保真补充权限服务或编排测试

## 4. Verification

- [x] 4.1 运行与工作区持久化、权限编排、AskUser 交互相关的测试，确认新增策略没有破坏普通会话行为
- [x] 4.2 手动验证新建 page-builder 工作区中的文件操作不再弹授权，而需求确认类提问仍然通过 AskUser UI 触发
