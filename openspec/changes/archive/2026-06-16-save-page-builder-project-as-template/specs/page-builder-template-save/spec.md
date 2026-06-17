## ADDED Requirements

### Requirement: 另存模板 API
系统 SHALL 提供 workspace 维度的 PageBuilder 当前项目另存模板 API：`POST /api/workspaces/:workspaceId/page-builder/templates`。

#### Scenario: 成功另存 PageBuilder 项目
- **WHEN** 客户端对 PageBuilder workspace 调用另存模板 API，提供合法请求体并携带有效编辑锁凭证
- **THEN** 系统生成用户模板并返回 `{ "template": <public template summary> }`

#### Scenario: 非 PageBuilder workspace 被拒绝
- **WHEN** 客户端对非 PageBuilder workspace 调用另存模板 API
- **THEN** 系统返回 400 或等价错误响应，且不创建模板目录

#### Scenario: 请求体字段校验
- **WHEN** 客户端调用另存模板 API 且 `name` 缺失、为空或字段类型非法
- **THEN** 系统返回 400 或等价错误响应，且不创建模板目录

### Requirement: 编辑锁要求
系统 SHALL 要求 PageBuilder 当前项目另存模板请求携带当前 workspace 的有效编辑锁凭证。

#### Scenario: 缺少编辑锁
- **WHEN** 客户端调用另存模板 API 且未携带 `x-proma-page-builder-edit-lock` 或 `x-proma-page-builder-edit-holder`
- **THEN** 系统返回 409，且不创建模板目录

#### Scenario: 编辑锁失效
- **WHEN** 客户端调用另存模板 API 且编辑锁不存在、过期或与 holder 不匹配
- **THEN** 系统返回 409，且不创建模板目录

#### Scenario: 有效编辑锁
- **WHEN** 客户端调用另存模板 API 且编辑锁有效
- **THEN** 系统继续执行来源识别和模板生成流程

### Requirement: 来源模式识别
系统 SHALL 将另存模板来源识别为 `standalone` 或 `cms-integrated`，并在模板 manifest 的 `sourceProject.sourceMode` 中记录识别结果。

#### Scenario: standalone 来源
- **WHEN** 当前请求没有有效 CMS Builder Access Session 和匹配的 CMS project binding
- **THEN** 系统按 `standalone` 来源处理，并在成功模板的 `template.json` 中记录 `sourceProject.sourceMode` 为 `standalone`

#### Scenario: CMS 集成来源
- **WHEN** 当前请求具备有效 CMS Builder Access Session，且 CMS project binding 与当前 workspace 和 primary session 匹配
- **THEN** 系统按 `cms-integrated` 来源处理，并在成功模板的 `template.json` 中记录 `sourceProject.sourceMode` 为 `cms-integrated`

#### Scenario: CMS 集成访问失效
- **WHEN** CMS 集成 Builder 项目的访问会话缺失、失效或与 project binding 不匹配
- **THEN** 系统返回 401、403、409 或等价 CMS 集成访问错误，且不创建模板目录

### Requirement: standalone 源页面 CMS 标记预扫描
系统 MUST 在 standalone 来源导出前扫描源 `workspace-files/index.html`，发现 CMS 作者态或 CMS runtime 标记时拒绝另存模板。

#### Scenario: standalone 源页面含 CMS 标签
- **WHEN** standalone 来源的 `workspace-files/index.html` 包含 `<cms-content>` 或 `<cms-catalog>`
- **THEN** 系统返回 409，且不得通过静态导出清理后静默保存模板

#### Scenario: standalone 源页面含 CMS runtime 标记
- **WHEN** standalone 来源的 `workspace-files/index.html` 包含 `data-proma-cms-*`、`data-proma-cms-rendering-*`、`__PROMA_CMS_RENDERING_PREVIEW__` 或 `cms-rendering-preview.js`
- **THEN** 系统返回 409，且不创建模板目录

#### Scenario: CMS 集成源页面含 CMS 标记
- **WHEN** CMS 集成来源的源页面包含 CMS 作者态或 runtime 标记
- **THEN** 系统允许进入静态导出流程，并要求最终模板不再残留这些标记

### Requirement: 静态导出复用
系统 SHALL 复用现有 PageBuilder 静态资源包导出逻辑生成另存模板的静态页面和资源。

#### Scenario: standalone 静态导出
- **WHEN** standalone 来源通过预扫描且静态导出成功
- **THEN** 系统使用导出产物整理用户模板目录

#### Scenario: CMS 集成静态导出
- **WHEN** CMS 集成来源调用另存模板 API
- **THEN** 系统按照当前静态资源包导出的方式固化 CMS 动态数据，不改变 CMS gateway 或 UI API 鉴权链路

#### Scenario: 静态导出失败
- **WHEN** 静态导出返回失败、源入口缺失或导出服务拒绝执行
- **THEN** 系统返回 404、409、500 或等价错误响应，且不创建最终模板目录

### Requirement: 模板目录结构
系统 SHALL 将另存结果整理为合法用户模板目录，并可被模板 registry 扫描识别。

#### Scenario: 成功生成模板目录
- **WHEN** 另存模板成功
- **THEN** 系统在用户模板根目录下生成 `<template-id>/template.json` 和 `<template-id>/workspace-files/index.html`

#### Scenario: 迁移静态导出报告
- **WHEN** 静态导出产物包含根部 `export-report.json`
- **THEN** 系统将其保存为 `<template-id>/reports/static-export-report.json`，且 `workspace-files/export-report.json` 不存在

#### Scenario: 写入模板校验报告
- **WHEN** 另存模板成功
- **THEN** 系统写入 `<template-id>/reports/template-validation-report.json`

#### Scenario: manifest 字段
- **WHEN** 另存模板成功
- **THEN** `template.json` 包含 `version: 1`、模板 ID、名称、`sourceKind: saved-project`、`entry: workspace-files/index.html`、`createdAt` 和 `sourceProject.sourceMode`，且不包含 `thumbnail` 或 `thumbnailUrl`

### Requirement: 模板质量校验
系统 MUST 在写入最终模板目录前校验模板质量，并阻断不合规模板。

#### Scenario: CMS 标记残留
- **WHEN** 导出后的模板 HTML 仍包含 `<cms-content>`、`<cms-catalog>`、`data-proma-cms-*`、`data-proma-cms-rendering-*`、CMS preview runtime 或 CMS rendering runtime loader
- **THEN** 系统返回 409，且不创建最终模板目录

#### Scenario: CMS manifest 残留
- **WHEN** 导出产物包含 `workspace-files/.proma/cms-rendering-manifest.json`
- **THEN** 系统移除该 manifest；如果最终模板中仍存在该 manifest，则系统返回 409

#### Scenario: 远程运行时依赖
- **WHEN** 静态导出报告包含 unsupported runtime dependency，或最终 HTML 包含远程 `script[src]` / `iframe[src]`
- **THEN** 系统返回 409，且不创建最终模板目录

#### Scenario: 关键资源下载失败
- **WHEN** 静态导出报告包含 failure、`attachment-download-failed` warning 或 `cms-remote-asset-skipped` warning
- **THEN** 系统返回 409，且不创建最终模板目录

### Requirement: 鉴权信息不落盘
系统 MUST NOT 在另存模板产物中保存 CMS cookie、session、token、Builder Access Session 或 server-to-server secret。

#### Scenario: manifest 不包含敏感信息
- **WHEN** CMS 集成来源另存模板成功
- **THEN** `template.json` 不包含 CMS cookie、session、token、Builder Access Session 或 server-to-server secret

#### Scenario: source metadata 不包含敏感信息
- **WHEN** 系统写入 `source/source-project.json`
- **THEN** 该文件只包含 workspace、来源模式、导出时间和非敏感 CMS 标识，不包含 CMS cookie、session、token、Builder Access Session 或 server-to-server secret

#### Scenario: 报告不包含敏感信息
- **WHEN** 系统写入 `reports/static-export-report.json` 或 `reports/template-validation-report.json`
- **THEN** 报告不包含 CMS cookie、session、token、Builder Access Session 或 server-to-server secret

### Requirement: 原子写入
系统 SHALL 使用临时目录生成模板，并在全部校验通过后原子移动到最终模板目录。

#### Scenario: 成功原子提交
- **WHEN** 模板文件、报告和 manifest 全部写入并通过校验
- **THEN** 系统将临时模板目录移动为最终 `<template-id>/` 目录

#### Scenario: 失败清理临时目录
- **WHEN** 另存模板流程在导出、整理、校验或写入过程中失败
- **THEN** 系统清理临时目录，且模板 registry 不出现半成品模板

#### Scenario: 模板 ID 合法
- **WHEN** 系统生成模板 ID
- **THEN** 模板 ID 满足 `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`，并且目录名、`template.json.id` 和 API 返回 ID 一致
