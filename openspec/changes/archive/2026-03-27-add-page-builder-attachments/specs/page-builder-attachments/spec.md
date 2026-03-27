## ADDED Requirements

### Requirement: Builder 页对话框必须支持待发送附件输入
系统 SHALL 在 `page-builder` 的 Builder 页对话框中提供附件输入能力，使用户能够在不离开当前项目工作台的情况下向当前会话附加参考图片、文档或其他支持的文件。

#### Scenario: 通过文件选择器添加附件
- **WHEN** 用户在 Builder 页对话输入区触发附件按钮并选择一个或多个文件
- **THEN** 系统 SHALL 将这些文件加入当前待发送附件列表，而不立即发送消息

#### Scenario: 通过粘贴添加附件
- **WHEN** 用户在 Builder 页对话输入区粘贴包含文件数据的剪贴板内容
- **THEN** 系统 SHALL 将可识别的文件加入当前待发送附件列表，而不丢弃现有文本草稿

#### Scenario: 通过拖拽添加附件
- **WHEN** 用户将一个或多个文件拖拽到 Builder 页对话输入区域
- **THEN** 系统 SHALL 将这些文件加入当前待发送附件列表，并提供明确的拖拽接收反馈

#### Scenario: 待发送附件在提交前可移除
- **WHEN** 用户在消息发送前移除某个待发送附件
- **THEN** 系统 SHALL 仅将该附件从当前待发送列表中删除，而不影响其他待发送附件或文本内容

### Requirement: Builder 页待发送附件必须提供紧凑预览反馈
系统 SHALL 在 Builder 页输入区中以紧凑且与现有对话框样式一致的方式展示待发送附件，使用户能在发送前确认本轮消息将附带哪些文件。

#### Scenario: 图片附件显示缩略预览
- **WHEN** 待发送附件中包含图片文件
- **THEN** 系统 SHALL 在输入区附件列表中显示对应图片的缩略预览和移除入口

#### Scenario: 非图片附件显示文件卡片
- **WHEN** 待发送附件中包含非图片文件
- **THEN** 系统 SHALL 在输入区附件列表中显示包含文件名的紧凑文件卡片和移除入口

#### Scenario: 空待发送列表不占据额外空间
- **WHEN** 当前输入区没有任何待发送附件
- **THEN** 系统 SHALL 不渲染附件预览区域的占位内容

### Requirement: Builder 会话发送必须以结构化附件持久化消息
系统 SHALL 在 Builder 页发送带附件的消息时，将附件与该轮用户消息一起持久化为结构化会话数据，而不是仅将附件清单拼接进用户可见正文。

#### Scenario: 发送带附件消息时持久化附件元数据
- **WHEN** 用户在 Builder 页发送一条包含附件的消息
- **THEN** 系统 SHALL 为该条用户消息持久化结构化附件列表
- **AND** 系统 SHALL 保持用户可见消息正文为用户原始输入文本

#### Scenario: 发送无附件消息时保持现有纯文本行为
- **WHEN** 用户发送一条不包含任何附件的消息
- **THEN** 系统 SHALL 继续沿用现有纯文本消息发送链路，而不要求前端额外构造附件数据

#### Scenario: 发送前校验失败时不写入消息历史
- **WHEN** 当前消息附件因服务端校验失败、运行时前置检查失败或请求解析失败而未能进入有效发送流程
- **THEN** 系统 SHALL 拒绝本次发送
- **AND** 系统 SHALL 不向该会话历史中追加一条携带无效附件的用户消息

### Requirement: Builder 附件必须存储在所属工作区的 session 目录中
系统 SHALL 将 Builder 会话的附件存储在该会话所属工作区的 session 目录内部，使附件与会话目录一起迁移和清理，而不是写入全局附件目录或 `workspace-files`。

#### Scenario: 保存附件到 session 目录下的 attachments 子目录
- **WHEN** Builder 会话中的某条消息携带附件并进入发送流程
- **THEN** 系统 SHALL 将每个附件保存到该会话运行目录下的 `attachments/` 子目录

#### Scenario: 删除会话时自动删除该会话附件
- **WHEN** 用户删除一个包含附件历史的会话
- **THEN** 系统 SHALL 随该会话 session 目录一起删除其附件文件，而不保留孤儿文件

#### Scenario: 迁移会话到其他工作区时附件跟随迁移
- **WHEN** 某个包含附件历史的会话被迁移到另一个工作区
- **THEN** 系统 SHALL 使该会话附件随 session 目录一起迁移到目标工作区，而不丢失原有附件引用

#### Scenario: 附件不得写入 workspace-files
- **WHEN** 系统保存 Builder 会话附件
- **THEN** 系统 SHALL 不将这些附件写入当前工作区的 `workspace-files` 目录

### Requirement: Builder 会话历史必须展示结构化附件
系统 SHALL 在 Builder 页历史消息中渲染结构化附件，使用户在回看需求和上下文时能够直接看到之前上传的参考文件。

#### Scenario: 历史用户消息显示图片附件
- **WHEN** 某条历史用户消息包含图片类型附件
- **THEN** 系统 SHALL 在该消息内容区域显示可见的图片预览

#### Scenario: 历史用户消息显示非图片附件
- **WHEN** 某条历史用户消息包含非图片类型附件
- **THEN** 系统 SHALL 在该消息内容区域显示文件卡片或文件标签，而不是忽略附件

#### Scenario: 兼容旧的正文附件块
- **WHEN** 某条历史消息没有结构化附件字段，但正文中仍包含旧格式的 `<attached_files>` 内容块
- **THEN** 系统 SHALL 继续按兼容模式显示这些历史附件引用，而不使旧记录完全失去附件可见性

### Requirement: Builder 历史附件内容必须通过会话作用域 HTTP 端点读取
系统 SHALL 通过会话作用域的 HTTP 内容读取端点向前端提供附件内容，使浏览器能够安全地加载图片预览和文件打开链接，而不是直接暴露本地文件系统路径。

#### Scenario: 历史图片附件通过 HTTP 端点加载
- **WHEN** 前端需要渲染一条历史消息中的图片附件
- **THEN** 系统 SHALL 提供一个会话作用域的附件内容地址供浏览器加载该图片内容

#### Scenario: 缺失附件返回明确失败
- **WHEN** 前端请求的历史附件文件已不存在、无法解析或不再属于当前会话
- **THEN** 系统 SHALL 返回明确的失败响应，而不是回退到任意其他本地文件路径

### Requirement: Builder 会话运行时必须将已发送附件暴露给 Agent
系统 SHALL 在处理 Builder 会话的附件消息时，将这些附件作为当前工作区运行时上下文的一部分暴露给 Agent，以便 Agent 能基于用户上传的文件继续网页构建任务。

#### Scenario: 带附件消息发送时向 Agent 注入附件上下文
- **WHEN** Builder 会话发送一条带附件的用户消息
- **THEN** 系统 SHALL 在该轮 Agent 执行上下文中提供附件文件名和可读取路径

#### Scenario: Agent 可在当前会话工作目录内访问附件文件
- **WHEN** Agent 在处理某条带附件的 Builder 消息时需要读取参考文件
- **THEN** 系统 SHALL 使这些附件文件位于当前会话工作目录可访问范围内，而不要求 Agent 依赖全局附件目录

### Requirement: Builder 附件上传必须使用文件传输协议而非 base64 消息注入
系统 SHALL 在 Builder 会话中使用面向文件上传的 HTTP 传输方式提交附件，而不是要求前端将附件文件整体编码为 base64 后再注入消息正文或 JSON 字段。

#### Scenario: 带附件发送使用 multipart 载荷
- **WHEN** 前端发送一条包含附件的 Builder 消息
- **THEN** 系统 SHALL 以适合文件上传的请求载荷传输这些附件文件

#### Scenario: 无附件发送不需要 multipart
- **WHEN** 前端发送一条不包含附件的消息
- **THEN** 系统 SHALL 继续允许现有非文件消息以原有请求格式发送，而不强制所有消息都切换为文件上传协议
