## Context

`page-builder` 的 Builder 页并没有自建聊天系统，而是直接复用 `apps/app` 中的 `AgentView`、`AgentMessages` 和 `RichTextInput`。这让 Builder 页能够天然继承统一的消息列表、流式输出和输入框样式，但也意味着附件能力不能只在 `apps/page-builder` 内局部补一层，否则会和现有共享对话链路分叉。

本次实现可以参考原始 Proma 工程中的附件交互与存储实现，原工程地址为：

`/Users/liu/Documents/work/learning/ai-page-builder/Proma`

其中值得参考的典型位置包括：
- `apps/electron/src/renderer/components/chat/ChatInput.tsx`
- `apps/electron/src/renderer/components/chat/AttachmentPreviewItem.tsx`
- `apps/electron/src/renderer/components/chat/ChatView.tsx`
- `apps/electron/src/main/lib/attachment-service.ts`
- `apps/electron/src/main/lib/conversation-manager.ts`

但这些实现只能作为迁移参考，不能原样搬回当前工程，因为当前仓库已经切换到 Web/HTTP + Claude Agent SDK 的运行时模型，和原工程存在明确设计冲突。

当前代码库已经保留了几块附件残留：
- `packages/shared/src/types/chat.ts` 中仍有 `FileAttachment` 定义。
- `apps/app/src/renderer/components/ai-elements/message.tsx` 中仍有通用附件展示 primitive。
- `apps/app/src/renderer/components/ai-elements/rich-text-input.tsx` 已预留 `onPasteFiles` 钩子。

但真正的上传、持久化、发送和展示链路并不存在：
- `AgentMessage` / `AgentSendInput` 还没有结构化附件字段。
- `api.sendMessage()` 与 `/api/sessions/:sessionId/send` 只支持 JSON 文本载荷。
- `AgentMessages` 目前仅通过解析消息正文中的 `<attached_files>` 兼容块显示“伪附件”芯片。
- 现有 `~/.proma/attachments` 路径是旧 conversation 时代的全局目录，不符合现在的工作区运行时模型。

与此同时，page-builder 的工作区已经具备稳定的目录边界：
- 工作区根目录位于 `~/.proma/agent-workspaces/{workspaceSlug}/`
- 会话运行目录位于 `~/.proma/agent-workspaces/{workspaceSlug}/{sessionId}/`
- 删除会话会删除整个 session 目录
- 迁移会话到其他工作区会整体移动该 session 目录

这意味着附件的最佳落点应当直接复用现有 session 目录生命周期，而不是再引入一套独立的全局目录清理协议。

## Goals / Non-Goals

**Goals:**
- 为 `page-builder` Builder 页对话框增加附件输入能力，支持点击选择、粘贴和拖拽文件。
- 保持 Builder 页继续复用共享 `AgentView` / `AgentMessages`，不创建 page-builder 专属聊天实现。
- 让用户消息以结构化附件形式持久化，并在历史消息中展示图片预览或文件卡片。
- 让 Agent 在当前工作区/会话上下文中可访问这些附件文件，用于网页生成与迭代。
- 让附件生命周期与 session/workspace 生命周期保持一致，避免遗留孤儿文件。

**Non-Goals:**
- 本阶段不为 page-builder 首页输入框增加附件能力。
- 本阶段不恢复旧 Chat 模块中的“编辑历史消息附件”“保留/替换已有附件”能力。
- 本阶段不把附件写入 `workspace-files/`，也不把它们视为最终网页产物。
- 本阶段不复活旧 Electron/provider 流程中的 base64 文档提取或图片多模态适配。
- 本阶段不引入跨会话共享附件库或工作区级素材管理器。

## Decisions

### Decision 1: 复用共享 Agent 对话链路，只在 Builder 页启用附件入口

附件输入与展示将落在共享 `apps/app` 对话组件中，而不是在 `apps/page-builder` 单独实现一套上传框。Builder 页继续通过 `AgentView` 获取该能力；普通主应用对话是否展示附件入口，由 `AgentView` 的新能力开关控制，首期仅由 page-builder Builder 页打开。

原因：
- Builder 页已经复用 `AgentView`，继续沿用共享组件改动最小。
- 消息持久化、SSE、权限横幅和 AskUser 交互都在共享链路中，附件若只在 page-builder 局部实现，会造成消息模型和 API 两套分叉。
- 附件消息展示本身也是共享能力，后续若主应用要启用，只需要打开入口开关，不必再迁移一次。

备选方案：
- 在 `apps/page-builder` 单独复制一份聊天输入框并自行实现附件。
  放弃原因：会和现有 `AgentView` 样式、流式状态、权限交互逐步偏离，违背“基于现有功能封装二次开发”的约束。

### Decision 2: 附件发送使用 `multipart/form-data`，并与 `/send` SSE 请求合并为单次提交

`POST /api/sessions/:sessionId/send` 将从“只接受 JSON”扩展为“无附件时继续接受 JSON，有附件时接受 `multipart/form-data`”。前端在存在附件时将 `userMessage`、其他字段和 `File` 一并放入 `FormData`，服务端解析后保存文件，再继续返回现有 SSE 响应。

原因：
- 避免 `base64` 带来的体积膨胀和额外内存拷贝。
- 避免先上传、再发送的双请求链路；附件和本轮消息以一次提交绑定，更接近原子操作。
- 保持现有 SSE 端点不变，page-builder 与共享前端 API 的调用入口仍然是 `sendMessage()`。

备选方案：
- 使用 JSON + `base64` 上传。
  放弃原因：对非图片同样低效，不符合当前 Web/HTTP 形态。
- 先调独立上传接口，再用 JSON 发消息。
  放弃原因：前端状态更复杂，需要处理中间态附件、失败回滚和额外 orphan 清理。

### Decision 3: 附件存储在工作区内的 session 目录下，而不是全局目录或 `workspace-files`

附件将存储到：

`~/.proma/agent-workspaces/{workspaceSlug}/{sessionId}/attachments/{uuid}{ext}`

`FileAttachment.localPath` 将使用“相对于 session cwd 的路径”，例如 `attachments/2d0f...png`。服务端通过当前会话所属工作区和 sessionId 解析绝对路径。

原因：
- session cwd 已经是 Agent 的实际运行目录，附件落在其子目录下后可天然被 Agent 访问，不需要额外暴露新的目录白名单。
- 删除会话时现有逻辑已经会删除整个 session 目录，附件能自动被清理。
- 会话迁移到其他工作区时现有逻辑会整体移动 session 目录，附件也会自动跟随，无需额外迁移脚本。
- 它仍然位于对应工作区目录内部，满足“不要落到全局 `~/.proma/attachments`”的约束。
- 附件不进入 `workspace-files`，可避免被误当作网站产物或被静态预览直接发布。

备选方案：
- 沿用全局 `~/.proma/attachments/{sessionId}`。
  放弃原因：这是旧 conversation 架构遗留，不符合当前工作区边界，也无法自然跟随 session 迁移。
- 使用 `~/.proma/agent-workspaces/{workspaceSlug}/attachments/{sessionId}`。
  放弃原因：虽然也在工作区内，但需要在 Agent 运行时额外暴露附件目录，且会话迁移时还要单独搬运。
- 直接写入 `workspace-files/attachments`。
  放弃原因：会混淆“参考输入”和“最终网页产物”，并可能泄漏到预览页面。

### Decision 4: 结构化持久化附件，用户可见消息正文保持原样

`AgentMessage` 和 `AgentSendInput` 将增加 `attachments?: FileAttachment[]` 字段。用户消息写入 JSONL 时，正文仍然保持用户原始文本，不把 `<attached_files>` 块拼接回可见消息内容。

Agent 真正执行时，编排层会在构造 prompt 的阶段为本轮消息补充一个内部使用的 `<attached_files>` 区块，其中包含：
- 原始文件名
- 绝对文件路径
- 必要的读取提示

这使得：
- 历史消息展示依赖结构化附件，不再依赖正文解析。
- 用户看到的消息不被内部提示污染。
- 运行时仍能复用 Claude Agent SDK 擅长的“读取本地文件”模式，而不是回退到旧 provider 注入链路。

兼容策略：
- `AgentMessages` 在渲染用户消息时优先使用 `message.attachments`。
- 现有 `parseAttachedFiles()` 解析逻辑暂时保留，仅用于兼容历史消息数据。

备选方案：
- 继续把附件清单拼进 `message.content`。
  放弃原因：用户可见正文被系统提示污染，也会让复制、搜索和后续编辑更混乱。

### Decision 5: 引入独立的 Agent 附件服务与内容读取端点

新增独立的主进程模块处理附件，而不是把逻辑塞回 `workspace-service.ts`。职责包括：
- 保存 multipart 上传文件
- 根据 `sessionId + attachmentId` 解析实际文件路径
- 删除附件文件
- 输出文件内容流与 MIME 类型

HTTP 层新增会话附件内容端点，供历史消息中的图片和文件卡片使用。建议路径：

- `GET /api/sessions/:sessionId/attachments/:attachmentId/content`

该端点返回文件内容本身，由前端将其作为图片 `src` 或文件打开地址使用。这样 `FileAttachment.localPath` 仍然只是内部路径字段，不暴露成浏览器直接可访问的本地路径。

原因：
- 当前浏览器环境不能直接消费 `localPath`。
- 现有 `MessageAttachments` primitive 可以复用，但其图片/文件 URL 解析要改为走 HTTP 端点。
- 将附件服务与 workspace 服务拆开后，后续无论 page-builder 还是其他入口复用，都不会把工作区服务继续膨胀成杂项模块。

备选方案：
- 继续让前端直接使用 `attachment.localPath` 作为图片地址。
  放弃原因：在当前 Web 架构下不可行，也会暴露本地文件系统路径。

### Decision 6: 上传回滚只覆盖“消息未持久化”的失败窗口

服务端在处理 multipart `/send` 请求时会先将附件保存到最终位置，再把 `attachments` 传给 `createSendResponse` / `AgentOrchestrator`。为避免早期失败产生孤儿文件，编排层将区分两个阶段：

- 若在用户消息写入 JSONL 之前发生前置失败，例如：
  - API Key 缺失
  - SDK CLI 缺失
  - Windows shell 环境不可用
  - 其他 preflight 直接返回错误
  
  则后端回滚刚保存的附件文件。

- 一旦用户消息已经以 `attachments` 形式持久化，附件就视为该轮历史的一部分，即使后续流式回复报错也不再删除。

原因：
- 这样能避免 multipart 单请求模式下最主要的 orphan 风险。
- 同时保留“失败消息仍可看到自己刚发送的附件”这一合理历史语义。

### Decision 7: 输入侧使用浏览器本地 `File`/`blob:` 预览，不引入预上传态

Builder 页附件选择后，待发送附件只保存在前端本地状态中：
- 图片预览使用 `URL.createObjectURL(file)`
- 非图片只展示文件名、类型和大小
- 在真正点击发送之前，不会把文件上传到后端

原因：
- 减少中间态管理与后台清理。
- 用户删除待发送附件时不需要再调删除接口。
- 与 `multipart /send` 单请求模式天然匹配。

备选方案：
- 选择文件后立刻上传，发送时只提交附件元数据。
  放弃原因：会引入“已上传但尚未发送”的缓存态和额外回滚逻辑。

### Decision 8: 文件校验采用服务端兜底、前端前置提示的双层策略

本阶段会增加基础校验：
- 前端在添加待发送附件时做数量和大小提示，避免明显误操作。
- 服务端在保存 multipart 文件时做最终校验，并在超限或不支持时返回明确错误。

默认限制将先采用保守值：
- 单文件默认上限 `20MB`
- 单次消息总附件默认上限 `50MB`

限制值设计为集中配置，便于后续调优。

原因：
- 浏览器端提示能减少无效等待。
- 服务端兜底是最终可信边界。

### Decision 9: 原始 Proma 仅作为交互与存储模式参考，不作为运行时实现蓝本

实现时可以借鉴原始 Proma 工程的以下内容：
- 输入区的附件交互模式，例如点击选择、粘贴、拖拽、待发送预览与移除行为。
- 附件预览卡片的视觉组织方式。
- 附件保存后生成稳定 `FileAttachment` 元数据的方式。
- 删除会话或删除消息时清理附件文件的生命周期意识。

但以下旧实现与当前设计冲突，必须按当前设计改写：
- 旧工程基于 Electron IPC 的 `window.electronAPI` 文件选择、保存、读取接口，当前工程必须改为 Bun HTTP 路由。
- 旧工程使用全局 `~/.proma/attachments` 目录，当前设计要求附件位于工作区内的 session 目录。
- 旧工程大量使用 `base64` 作为附件传输协议，当前设计要求改为文件上传协议。
- 旧工程通过 provider 适配器读取图片 base64、提取文档文本后再发送给模型，当前设计改为让 Claude Agent SDK 在本地文件可访问前提下自行读取附件。
- 旧工程里部分附件信息会被拼接进用户可见消息正文，当前设计要求结构化持久化附件，并保持用户可见正文不被污染。

因此，开发时应遵循“参考旧交互，不复活旧架构；参考旧存储语义，不沿用旧路径和传输协议”的原则。

## Risks / Trade-offs

- [共享 `AgentView` 改动面变大] → 通过“附件入口开关”限制首期只在 Builder 页展示，并补齐共享测试，避免影响普通会话体验。
- [multipart + SSE 混合请求需要调整现有 API helper] → `requestStream()` 增加对 `FormData` 透传的显式分支，并保持无附件 JSON 路径不变。
- [旧数据和新数据共存] → `AgentMessages` 先读结构化 `attachments`，保留 `<attached_files>` 兼容解析，避免历史记录回归。
- [附件 URL 暴露实现不当会泄漏本地路径] → 浏览器只拿到会话附件内容端点，不直接暴露文件系统绝对路径。
- [附件存储在 session cwd 下后，session 目录可能增长较快] → 通过数量/体积限制控制增长，并依赖现有 session 删除、迁移语义自动管理生命周期。
- [Claude Agent SDK 不走旧 provider 多模态注入链路] → 设计上明确依赖“本地文件可访问 + prompt 明示文件路径”的工作模式，不把旧 Electron/provider 行为当作兼容目标。

## Migration Plan

1. 扩展共享类型与前端 API 能力：
   - 在 shared 类型中为 `AgentMessage` / `AgentSendInput` 增加 `attachments`
   - 让 `api.sendMessage()` / `requestStream()` 同时支持 JSON 和 `FormData`
2. 新增独立附件服务与路径 helper：
   - 增加 session 级附件目录 helper
   - 新建 `agent-attachment-service.ts`
   - 提供会话附件内容读取端点
3. 接入 Builder 输入与历史渲染：
   - 在 `AgentView` 增加待发送附件状态、选择/粘贴/拖拽入口
   - 复用或迁回附件预览卡片样式
   - 让 `AgentMessages` / `MessageAttachments` 渲染结构化附件
4. 接入编排与持久化：
   - `sessions/:id/send` 解析 multipart 请求
   - `AgentOrchestrator` 持久化用户消息附件，并在 prompt 中注入内部 `<attached_files>` 块
   - 对 preflight 失败增加附件回滚
5. 补齐测试：
   - API helper 测试
   - sessions 路由 multipart 解析与错误测试
   - AgentView / AgentMessages 渲染与发送测试
   - page-builder Builder 页集成测试

回滚策略：
- 若实现出现问题，可保留新类型字段但关闭 Builder 页附件入口开关，恢复为纯文本发送。
- 因为附件目录位于 session 目录内部，回滚不会影响现有 `workspace-files` 或预览逻辑；未被读取的新附件文件可由后续清理脚本或会话删除回收。

## Open Questions

- 当前没有阻塞性开放问题；首页输入框附件、历史消息编辑附件以及工作区级素材管理器均留待后续独立 capability 讨论。
