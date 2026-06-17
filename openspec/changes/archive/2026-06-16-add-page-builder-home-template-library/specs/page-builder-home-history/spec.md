## MODIFIED Requirements

### Requirement: 首页必须在现有启动入口下方展示 page-builder 项目历史区
系统 SHALL 在 `page-builder` 首页现有启动对话框下方提供包含历史记录的资源区，用于访问已有的 `page-builder` 项目；历史记录 SHALL 作为“历史记录”Tab 展示，且资源区的引入 MUST 保持现有首页启动入口继续可见且可用，而不是替换或重排原有启动入口。

#### Scenario: 访问首页时同时看到启动入口和历史记录入口
- **WHEN** 用户访问 `page-builder` standalone 首页，且系统中已经存在至少一个 `page-builder` 工作区
- **THEN** 系统 SHALL 保持现有首页启动对话框继续显示
- **AND** 系统 SHALL 在其下方展示包含“历史记录”Tab 的资源区入口

#### Scenario: 切换到历史记录 Tab 时看到历史区
- **WHEN** 用户在 standalone 首页资源区选择“历史记录”Tab
- **THEN** 系统 SHALL 展示项目历史记录区域
- **AND** 系统 SHALL 以既有历史卡片规则展示已有 `page-builder` 项目

#### Scenario: 没有历史项目时不影响首页启动入口
- **WHEN** 用户访问 `page-builder` standalone 首页，且系统中不存在任何 `page-builder` 工作区
- **THEN** 系统 SHALL 继续展示现有首页启动对话框
- **AND** 系统 SHALL 不因历史区为空而破坏首页原有启动流程

### Requirement: CMS 集成模式首页不得加载 standalone 历史区
PageBuilder 首页历史区 SHALL 仅在 standalone 行为下加载；CMS 集成生产模式下首页 SHALL NOT 展示或请求 standalone 项目历史，也 SHALL NOT 挂载包含 standalone 历史记录的本地资源区。仅当 integration status 明确返回 `devStandaloneEntryEnabled: true` 时，首页 SHALL 在开发模式下按 standalone 行为提供资源区，并允许用户切换到历史记录 Tab 操作历史项目。

#### Scenario: CMS 模式首页不挂载历史区或资源区
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL NOT 挂载 `PageBuilderHistorySection`
- **AND** 系统 SHALL NOT 展示历史项目卡片、历史空态、刷新按钮、删除项目入口或 standalone 资源区 Tabs

#### Scenario: CMS 模式首页不请求历史项目列表
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL NOT 请求 `/api/page-builder/projects`
- **AND** 系统 SHALL NOT 因历史区初始化请求 `/api/workspaces` 或 `/api/sessions`

#### Scenario: 开发态 CMS 模式首页提供历史记录 Tab
- **WHEN** 用户访问 PageBuilder 首页且 integration status 返回 `integrationMode: "cms"`、`enabled: true` 和 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 按 standalone 行为展示包含“历史记录”Tab 的资源区
- **AND** 系统 SHALL 允许用户切换到“历史记录”Tab 查看历史项目

#### Scenario: 开发态 CMS 模式历史记录 Tab 加载历史项目
- **WHEN** 首页资源区在开发态 CMS 模式下展示
- **AND** 用户切换到“历史记录”Tab
- **THEN** 系统 SHALL 请求 `/api/page-builder/projects` 加载 page-builder 历史项目
- **AND** 历史项目卡片、历史空态、刷新按钮和删除项目入口 SHALL 按 standalone 视觉和交互规则展示

#### Scenario: 开发态 CMS 模式历史项目操作按 standalone 行为执行
- **WHEN** 首页历史区在开发态 CMS 模式下展示项目卡片
- **THEN** 历史项目预览 SHALL 在新窗口打开当前预览 URL
- **AND** 历史项目编辑 SHALL 在新窗口打开 `/builder/:workspaceId/:sessionId`
- **AND** 历史项目删除 SHALL 调用 standalone page-builder 项目删除流程
- **AND** 系统 SHALL 继续阻止删除正在编辑、导出或 agent 运行中的项目

#### Scenario: standalone 模式历史区保持可用
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 standalone 模式
- **AND** 用户切换到“历史记录”Tab
- **THEN** 系统 SHALL 加载并展示 page-builder 项目历史区
- **AND** 历史项目编辑、预览和删除行为 SHALL 保持现有语义
