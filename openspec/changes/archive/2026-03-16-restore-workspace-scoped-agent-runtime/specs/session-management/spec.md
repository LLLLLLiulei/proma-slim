## ADDED Requirements

### Requirement: 会话必须持久化工作区归属
系统 SHALL 为每个 Agent 会话持久化其所属工作区，并在创建、读取和更新时保留该归属关系。

#### Scenario: 新会话继承当前工作区
- **WHEN** 用户在某个当前工作区下创建新会话
- **THEN** 系统 SHALL 为该会话写入对应的 `workspaceId`，并在后续列表与详情读取中保留该字段

#### Scenario: 历史会话补齐工作区归属
- **WHEN** 系统读取旧会话索引且发现某个会话缺少 `workspaceId`
- **THEN** 系统 SHALL 将该会话补齐到默认工作区，而不是继续保持无归属状态

### Requirement: 会话工作区迁移必须保留消息历史
系统 SHALL 支持在工作区之间迁移会话，并保留该会话已有的消息历史记录。

#### Scenario: 迁移会话后保留 JSONL 消息
- **WHEN** 用户将某个会话迁移到其他工作区
- **THEN** 系统 SHALL 保留该会话已有的 JSONL 消息历史，并仅调整工作区归属与执行目录

## MODIFIED Requirements

### Requirement: 会话列表
系统 SHALL 在当前工作区上下文下展示该工作区的会话列表，并按最近修改时间倒序排列。

#### Scenario: 展示当前工作区的会话列表
- **WHEN** 用户打开应用且当前工作区已经确定
- **THEN** 系统 SHALL 只展示 `workspaceId` 属于当前工作区的会话条目，而不是将其他工作区的会话混在同一侧边栏列表中

#### Scenario: 切换工作区后刷新会话列表范围
- **WHEN** 用户在侧边栏切换到另一个工作区
- **THEN** 系统 SHALL 将会话列表切换为目标工作区的会话集合，同时不改变已打开会话自身保存的 `workspaceId`

### Requirement: 会话页签管理

#### Scenario: 切换并发流式会话页签
- **WHEN** 用户同时打开两个会话页签且它们都处于流式回复过程中，并在它们之间来回切换
- **THEN** 系统 SHALL 始终展示当前活动页签自己的消息历史与流式内容，而不是短暂展示另一个会话的消息
