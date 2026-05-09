## ADDED Requirements

### Requirement: CMS 创建项目只初始化 primary session 元数据
系统 SHALL 在 CMS 创建 AI 专题项目时创建一个归属于该 page-builder workspace 的 primary session，但 SHALL NOT 写入初始用户消息或启动 Agent。

#### Scenario: CMS 项目 primary session 创建后消息为空
- **WHEN** CMS 创建 AI 专题项目成功
- **THEN** 系统 SHALL 创建一个归属于新 workspace 的 primary session
- **AND** 该 session 的消息文件 SHALL 不包含初始用户消息
- **AND** 系统 SHALL NOT 因创建项目而启动 Agent 运行

#### Scenario: project binding 记录 primary session
- **WHEN** CMS 创建 AI 专题项目成功
- **THEN** 系统 SHALL 将 primary session 的 `id` 写入 project binding 的 `primarySessionId`
- **AND** 后续 CMS 集成能力 SHALL 能通过 `projectId` 找到该 primary session
