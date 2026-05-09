## ADDED Requirements

### Requirement: CMS 集成项目必须使用 projectId 隐藏内部 workspace 身份
系统 SHALL 在 CMS 集成模式下将 `projectId` 作为 CMS 对外长期项目身份，并 SHALL 将内部 `workspaceId` 和 `primarySessionId` 作为 project binding 的实现细节。

#### Scenario: CMS 创建项目返回 projectId 而非内部路由契约
- **WHEN** CMS 调用 `POST /api/integrations/cms/projects` 成功创建项目
- **THEN** 系统 SHALL 返回稳定 `projectId`
- **AND** 系统 SHALL 在 project binding 中保存对应内部 `workspaceId` 和 `primarySessionId`
- **AND** CMS 后续集成 SHALL 以 `projectId` 作为对外契约，而不是直接依赖 `workspaceId` 或 `sessionId`

#### Scenario: projectId 不复用内部 workspace 或 session id
- **WHEN** CMS 创建 AI 专题项目成功
- **THEN** 系统 SHALL 独立生成 CMS 对外使用的 `projectId`
- **AND** `projectId` SHALL NOT 等于内部 `workspaceId`
- **AND** `projectId` SHALL NOT 等于内部 `primarySessionId`

#### Scenario: CMS 创建的 workspace 使用 page-builder 模板
- **WHEN** CMS 创建 AI 专题项目成功
- **THEN** 系统 SHALL 创建一个 `template: "page-builder"` 的 Agent workspace
- **AND** 该 workspace SHALL 继续遵循现有 page-builder workspace 初始化规则
