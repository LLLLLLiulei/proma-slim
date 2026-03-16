## ADDED Requirements

### Requirement: 会话创建
系统 SHALL 支持创建新的对话会话，每个会话独立存储消息历史。

#### Scenario: 创建新会话
- **WHEN** 用户点击新建会话按钮
- **THEN** 系统 SHALL 创建一个新会话（生成 UUID），在侧边栏显示，并切换到该会话

### Requirement: 会话列表
系统 SHALL 在侧边栏展示所有会话列表，按最近修改时间倒序排列。

#### Scenario: 展示会话列表
- **WHEN** 用户打开应用
- **THEN** 系统 SHALL 从后端加载会话列表，显示标题和创建时间

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

### Requirement: 会话存储
系统 SHALL 复用现有文件系统持久化方案，存储在 `~/.proma/agent-sessions/` 目录。

#### Scenario: 会话索引存储
- **WHEN** 会话被创建、更新或删除
- **THEN** 系统 SHALL 更新 `~/.proma/agent-sessions.json` 索引文件

#### Scenario: 消息存储
- **WHEN** 新消息产生
- **THEN** 系统 SHALL 以 JSONL 格式追加写入 `~/.proma/agent-sessions/{id}.jsonl`
