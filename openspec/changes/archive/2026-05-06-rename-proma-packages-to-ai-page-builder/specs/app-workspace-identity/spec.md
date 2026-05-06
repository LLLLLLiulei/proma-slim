## MODIFIED Requirements

### Requirement: 主应用 workspace 身份必须使用 app 命名
仓库 SHALL 将主应用 workspace 公开为 `apps/app` 目录和 `@ai-page-builder/app` 包名，而不是继续暴露历史 `electron` 身份或旧的 `@proma/app` 包身份。

#### Scenario: 主应用 package 身份更新为 app
- **WHEN** 开发者查看主应用 workspace 的 `package.json`
- **THEN** 主应用 SHALL 位于 `apps/app/package.json`
- **AND** 包名 SHALL 为 `@ai-page-builder/app`

#### Scenario: 根脚本路由到新的 app workspace
- **WHEN** 开发者从仓库根目录运行 `dev`、`build` 或 `start`
- **THEN** 根级脚本 SHALL 将这些命令路由到 `@ai-page-builder/app`，而不是 `@proma/app` 或 `@proma/electron`

### Requirement: 当前态引用必须反映新的 app 身份
系统 SHALL 将当前态代码配置、开发测试文案和当前态说明文档更新为 `apps/app` 与 `@ai-page-builder/app`，同时保留归档历史材料对旧命名的历史准确性。

#### Scenario: 当前态说明与测试文案使用 app 命名
- **WHEN** 开发者查看当前主应用的活动配置、活动测试和描述当前代码库状态的文档
- **THEN** 这些引用 SHALL 使用 `apps/app` 或 `@ai-page-builder/app`，而不是继续将当前主应用表述为 `apps/electron`、`@proma/electron` 或 `@proma/app`

#### Scenario: 历史归档材料保留旧命名语境
- **WHEN** 开发者查看归档 change、历史迁移设计稿或明确描述过去 Electron / Proma package 阶段的记录
- **THEN** 这些材料 SHALL 可以保留 `apps/electron`、`@proma/app` 或其他旧命名，以维持其对历史状态的准确描述
