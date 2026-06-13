## MODIFIED Requirements

### Requirement: CMS 集成模式首页不得加载 standalone 历史区
PageBuilder 首页历史区 SHALL 仅在 standalone 模式下加载；CMS 集成模式下首页 SHALL NOT 展示或请求 standalone 项目历史。仅当 integration status 明确返回 `devStandaloneEntryEnabled: true` 时，首页历史区 SHALL 在开发模式下按 standalone 行为加载并允许操作历史项目。

#### Scenario: CMS 模式首页不挂载历史区
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL NOT 挂载 `PageBuilderHistorySection`
- **AND** 系统 SHALL NOT 展示历史项目卡片、历史空态、刷新按钮或删除项目入口

#### Scenario: CMS 模式首页不请求历史项目列表
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL NOT 请求 `/api/page-builder/projects`
- **AND** 系统 SHALL NOT 因历史区初始化请求 `/api/workspaces` 或 `/api/sessions`

#### Scenario: 开发态 CMS 模式首页加载历史区
- **WHEN** 用户访问 PageBuilder 首页且 integration status 返回 `integrationMode: "cms"`、`enabled: true` 和 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 挂载 `PageBuilderHistorySection`
- **AND** 系统 SHALL 请求 `/api/page-builder/projects` 加载 page-builder 历史项目
- **AND** 历史项目卡片、历史空态、刷新按钮和删除项目入口 SHALL 按 standalone 视觉和交互规则展示

#### Scenario: 开发态 CMS 模式历史项目操作按 standalone 行为执行
- **WHEN** 首页历史区在开发态 CMS 模式下展示项目卡片
- **THEN** 历史项目预览 SHALL 在新窗口打开当前预览 URL
- **AND** 历史项目编辑 SHALL 在新窗口打开 `/builder/:workspaceId/:sessionId`
- **AND** 历史项目删除 SHALL 调用 standalone page-builder 项目删除流程
- **AND** 系统 SHALL 继续阻止删除正在编辑、导出或 agent 运行中的项目

#### Scenario: standalone 模式历史区保持可用
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 standalone 模式
- **THEN** 系统 SHALL 继续加载并展示 page-builder 项目历史区
- **AND** 历史项目编辑、预览和删除行为 SHALL 保持现有语义
