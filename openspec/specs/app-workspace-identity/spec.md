## Purpose
定义主应用 workspace 在仓库中的公开身份必须使用 `app` 命名，并明确这一轮重命名不改变内部运行层级。

## Requirements

### Requirement: 主应用 workspace 身份必须使用 app 命名
仓库 SHALL 将主应用 workspace 公开为 `apps/app` 目录和 `@ai-page-builder/app` 包名，而不是继续暴露历史 `electron` 身份或旧的 Proma package scope 身份。

#### Scenario: 主应用 package 身份更新为 app
- **WHEN** 开发者查看主应用 workspace 的 `package.json`
- **THEN** 主应用 SHALL 位于 `apps/app/package.json`，且包名为 `@ai-page-builder/app`

#### Scenario: 根脚本路由到新的 app workspace
- **WHEN** 开发者从仓库根目录运行 `dev`、`build` 或 `start`
- **THEN** 根级脚本 SHALL 将这些命令路由到 `@ai-page-builder/app`，而不是旧的 Proma 或 Electron package scope

### Requirement: 第一阶段重命名不得改变内部运行层级
第一阶段仓库重命名 SHALL 只调整主应用的目录与 workspace 包身份，并保持内部 `src/main` 与 `src/renderer` 层级不变。

#### Scenario: 应用启动入口保持现有 main 路径
- **WHEN** 开发者查看主应用的启动脚本与运行入口
- **THEN** 系统 SHALL 继续从应用目录内的 `src/main/index.ts` 启动服务，而不是在本阶段同步重命名为其他内部层级名称

#### Scenario: 前端构建入口保持现有 renderer 路径
- **WHEN** 开发者查看应用的 Vite、TypeScript、Tailwind 或组件配置
- **THEN** 这些配置 SHALL 继续解析应用目录内的 `src/renderer` 路径，而不是在本阶段同步迁移到新的内部目录名

### Requirement: 当前态引用必须反映新的 app 身份
系统 SHALL 将当前态代码配置、开发测试文案和当前态说明文档更新为 `apps/app` 与 `@ai-page-builder/app`，同时保留归档历史材料对旧命名的历史准确性。

#### Scenario: 当前态说明与测试文案使用 app 命名
- **WHEN** 开发者查看当前主应用的活动配置、活动测试和描述当前代码库状态的文档
- **THEN** 这些引用 SHALL 使用 `apps/app` 或 `@ai-page-builder/app`，而不是继续将当前主应用表述为 `apps/electron`或旧的 Proma / Electron package scope

#### Scenario: 历史归档材料保留旧命名语境
- **WHEN** 开发者查看归档 change、历史迁移设计稿或明确描述过去 Electron 阶段的记录
- **THEN** 这些材料 SHALL 可以保留 `apps/electron` 等旧命名，以维持其对历史状态的准确描述

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
