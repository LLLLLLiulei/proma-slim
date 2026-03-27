## 1. Shared Types And Transport

- [x] 1.1 为共享类型补齐 page-builder 附件所需的 `FileAttachment` 复用导出，并在 `AgentMessage` / `AgentSendInput` 中增加结构化附件字段。
- [x] 1.2 扩展前端 API 请求封装，使 `sendMessage()` 和底层 `requestStream()` 同时支持现有 JSON 载荷与带文件的 `FormData` 载荷。
- [x] 1.3 为带附件发送补充 API 层测试，覆盖 JSON 路径兼容和 multipart 透传行为。

## 2. Session Attachment Backend

- [x] 2.1 在主进程路径工具中增加基于工作区 session 目录的附件路径 helper，明确 `attachments/` 子目录解析规则。
- [x] 2.2 新建独立的 Agent 附件服务模块，负责保存上传文件、生成 `FileAttachment` 元数据、解析附件内容路径和删除附件文件。
- [x] 2.3 扩展 `/api/sessions/:sessionId/send` 处理逻辑，使其在无附件时继续接受 JSON，在有附件时解析 multipart 请求并返回现有 SSE 响应。
- [x] 2.4 新增会话作用域附件内容读取端点，供历史消息图片预览和文件打开链接使用。
- [x] 2.5 为附件保存、内容读取、缺失附件失败和 multipart 发送解析补充后端测试。

## 3. Agent Runtime Integration

- [x] 3.1 在 `AgentOrchestrator` 中持久化带附件的用户消息，并确保用户可见正文保持原始文本。
- [x] 3.2 在 Agent 运行时 prompt 构造阶段为带附件消息注入内部附件上下文，使 Claude Agent SDK 能读取当前 session 目录内的附件文件。
- [x] 3.3 为发送前前置失败增加附件回滚逻辑，避免未写入历史的孤儿文件残留在 session 目录中。
- [x] 3.4 为带附件消息的持久化、prompt 注入和失败回滚补充 orchestrator 级测试。

## 4. Builder Composer And Message UI

- [x] 4.1 在共享 `AgentView` 中增加可开关的附件入口和待发送附件状态，只在 page-builder Builder 页开启。
- [x] 4.2 迁移并适配原 Proma 的附件交互模式，支持点击选择、粘贴、拖拽、紧凑预览和发送前移除。
- [x] 4.3 更新 Builder 页对 `AgentView` 的接入参数，确保 page-builder 继续复用共享对话框而不是派生独立输入实现。
- [x] 4.4 更新 `AgentMessages` 与附件展示 primitive，优先渲染结构化附件，并保留旧 `<attached_files>` 消息的兼容显示。
- [x] 4.5 为 Builder 页输入交互、历史附件展示和兼容渲染补充 renderer 侧测试。

## 5. Validation And Lifecycle Coverage

- [x] 5.1 为前后端同时补充附件大小与数量校验，确保超限时返回明确错误并阻止无效消息写入历史。
- [x] 5.2 验证删除会话和迁移会话后的附件生命周期，确保附件随 session 目录自动清理或迁移。
- [x] 5.3 运行并补齐本次变更涉及的测试集，确认 page-builder 预览、共享 Agent 对话和新附件链路没有回归。
