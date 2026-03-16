## Purpose
定义会话的创建、列表展示、页签管理、标题维护与文件持久化行为。

## Requirements

### Requirement: 会话创建
系统 SHALL 支持创建新的对话会话，每个会话独立存储消息历史。

#### Scenario: 创建新会话
- **WHEN** 用户点击新建会话按钮
- **THEN** 系统 SHALL 创建一个新会话（生成 UUID），在侧边栏显示，并切换到该会话

### Requirement: 会话必须持久化工作区归属
系统 SHALL 为每个 Agent 会话持久化其所属工作区，并在创建、读取和更新时保留该归属关系。

#### Scenario: 新会话继承当前工作区
- **WHEN** 用户在某个当前工作区下创建新会话
- **THEN** 系统 SHALL 为该会话写入对应的 `workspaceId`，并在后续列表与详情读取中保留该字段

#### Scenario: 历史会话补齐工作区归属
- **WHEN** 系统读取旧会话索引且发现某个会话缺少 `workspaceId`
- **THEN** 系统 SHALL 将该会话补齐到默认工作区，而不是继续保持无归属状态

### Requirement: 会话列表
系统 SHALL 在当前工作区上下文下展示该工作区的会话列表，并按最近修改时间倒序排列。

#### Scenario: 展示当前工作区的会话列表
- **WHEN** 用户打开应用且当前工作区已经确定
- **THEN** 系统 SHALL 从后端加载并展示 `workspaceId` 属于当前工作区的会话条目，显示标题和创建时间

#### Scenario: 切换工作区后刷新会话列表范围
- **WHEN** 用户在侧边栏切换到另一个工作区
- **THEN** 系统 SHALL 将会话列表切换为目标工作区的会话集合，同时不改变已打开会话自身保存的 `workspaceId`

#### Scenario: 切换会话
- **WHEN** 用户点击侧边栏中的某个会话
- **THEN** 系统 SHALL 加载该会话的历史消息并展示在对话区域

#### Scenario: 再次打开已打开的会话
- **WHEN** 用户点击一个已经在顶部页签条中打开的会话
- **THEN** 系统 SHALL 聚焦现有页签，而不是重复创建同一会话的新页签

### Requirement: 会话页签管理
系统 SHALL 允许用户在顶部同时保留多个已打开的会话页签，并在这些页签之间来回切换。

#### Scenario: 打开多个会话后保留现有页签
- **WHEN** 用户连续打开不同会话
- **THEN** 系统 SHALL 保留之前已打开的会话页签，并将新打开的会话设为当前活动页签

#### Scenario: 切换并发流式会话页签
- **WHEN** 用户同时打开两个会话页签且它们都处于流式回复过程中，并在它们之间来回切换
- **THEN** 系统 SHALL 始终展示当前活动页签自己的消息历史与流式内容，而不是短暂展示另一个会话的消息

### Requirement: 会话删除
系统 SHALL 支持删除会话及其所有消息。

#### Scenario: 删除会话
- **WHEN** 用户对某个会话执行删除操作
- **THEN** 系统 SHALL 删除会话索引记录和对应的 JSONL 消息文件，从列表中移除

### Requirement: 会话标题
系统 SHALL 支持自动生成和手动编辑会话标题。

#### Scenario: 自动生成标题
- **WHEN** 会话首次收到助手响应
- **THEN** 系统 SHALL 基于对话内容自动生成简短标题

#### Scenario: 手动编辑标题
- **WHEN** 用户双击会话标题
- **THEN** 系统 SHALL 允许用户编辑标题并保存

### Requirement: 会话工作区迁移必须保留消息历史
系统 SHALL 支持在工作区之间迁移会话，并保留该会话已有的消息历史记录。

#### Scenario: 迁移会话后保留 JSONL 消息
- **WHEN** 用户将某个会话迁移到其他工作区
- **THEN** 系统 SHALL 保留该会话已有的 JSONL 消息历史，并仅调整工作区归属与执行目录

### Requirement: 会话存储
系统 SHALL 复用现有文件系统持久化方案，存储在 `~/.proma/agent-sessions/` 目录。

#### Scenario: 会话索引存储
- **WHEN** 会话被创建、更新或删除
- **THEN** 系统 SHALL 更新 `~/.proma/agent-sessions.json` 索引文件

#### Scenario: 消息存储
- **WHEN** 新消息产生
- **THEN** 系统 SHALL 以 JSONL 格式追加写入 `~/.proma/agent-sessions/{id}.jsonl`

#### Scenario: 页面刷新后补齐刚完成的助手消息
- **WHEN** 用户在一轮回复刚结束、但最后一条 assistant 消息可能仍处于持久化完成窗口时刷新页面
- **THEN** 系统 SHALL 在初次历史读取后短暂补拉该会话消息，避免长期停留在仅显示最后一条 `user` 消息的截断历史状态
