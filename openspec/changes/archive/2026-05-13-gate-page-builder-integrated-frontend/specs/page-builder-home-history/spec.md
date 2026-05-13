## ADDED Requirements

### Requirement: CMS 集成模式首页不得加载 standalone 历史区
PageBuilder 首页历史区 SHALL 仅在 standalone 模式下加载；CMS 集成模式下首页 SHALL NOT 展示或请求 standalone 项目历史。

#### Scenario: CMS 模式首页不挂载历史区
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **THEN** 系统 SHALL NOT 挂载 `PageBuilderHistorySection`
- **AND** 系统 SHALL NOT 展示历史项目卡片、历史空态、刷新按钮或删除项目入口

#### Scenario: CMS 模式首页不请求历史项目列表
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **THEN** 系统 SHALL NOT 请求 `/api/page-builder/projects`
- **AND** 系统 SHALL NOT 因历史区初始化请求 `/api/workspaces` 或 `/api/sessions`

#### Scenario: standalone 模式历史区保持可用
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 standalone 模式
- **THEN** 系统 SHALL 继续加载并展示 page-builder 项目历史区
- **AND** 历史项目编辑、预览和删除行为 SHALL 保持现有语义
