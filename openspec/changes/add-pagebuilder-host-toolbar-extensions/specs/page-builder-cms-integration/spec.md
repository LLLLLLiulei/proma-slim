## ADDED Requirements

### Requirement: CMS builder handoff 必须支持宿主工具栏扩展按钮
系统 SHALL 允许 CMS 服务端在创建 `target: "builder"` handoff 时提供可选的宿主工具栏扩展按钮配置，并 SHALL 在写入 handoff 或 Builder Access Session 前对该配置执行与 PageBuilder 前端一致的归一化和安全校验。

#### Scenario: 创建 builder handoff 时保存合法扩展按钮
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie` 和合法 `toolbarExtensions.buttons` 创建 `target: "builder"` handoff
- **THEN** 系统 SHALL 返回正常 handoff 响应
- **AND** 系统 SHALL 将归一化后的宿主工具栏扩展按钮与该次 handoff 或其后续 Builder Access Session 关联

#### Scenario: 非法扩展按钮配置拒绝创建 handoff
- **WHEN** CMS 创建 builder handoff 时提供非法的 `toolbarExtensions.buttons`
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 写入可消费的 handoff 记录

#### Scenario: handoff 记录不保存敏感扩展数据
- **WHEN** 系统保存包含宿主工具栏扩展按钮的 handoff 或 Builder Access Session record
- **THEN** 持久化记录 SHALL 只包含归一化后的非敏感按钮展示字段和按钮 ID
- **AND** 持久化记录 SHALL NOT 包含 CMS Cookie、integration secret、外部业务 token、外部跳转 URL、JavaScript、HTML、SVG 或 CSS style

#### Scenario: preview handoff 不暴露工具栏扩展按钮
- **WHEN** CMS 创建 `target: "preview"` handoff 时提供 `toolbarExtensions.buttons`
- **THEN** 系统 SHALL NOT 将这些按钮暴露给 workspace preview 页面
- **AND** preview handoff 的消费和预览响应 SHALL 保持现有只读预览语义

### Requirement: CMS builder context 必须返回宿主工具栏扩展按钮
系统 SHALL 在 CMS 集成模式的 builder context 响应中返回当前 Builder Access Session 关联的宿主工具栏扩展按钮配置，使 PageBuilder renderer 能够在 Builder 左侧预览工具栏中渲染本次打开允许的宿主按钮。

#### Scenario: builder context 返回 handoff 关联的扩展按钮
- **WHEN** 浏览器通过包含合法 `toolbarExtensions.buttons` 的 builder handoff 获得 Builder Access Session
- **AND** 浏览器携带有效且匹配的 `ai_page_builder_access` Cookie 请求 builder context
- **THEN** 系统 SHALL 返回 `200`
- **AND** 响应 JSON SHALL 包含 `hostToolbarExtensions.buttons`，其内容为归一化后的扩展按钮列表

#### Scenario: 无扩展按钮时返回空列表
- **WHEN** 浏览器通过未包含宿主工具栏扩展按钮的 builder handoff 获得 Builder Access Session
- **AND** 浏览器请求 builder context
- **THEN** 系统 SHALL 返回 `hostToolbarExtensions.buttons: []`
- **AND** PageBuilder renderer SHALL 将其视为没有扩展按钮

#### Scenario: builder context 不泄露扩展按钮以外的宿主数据
- **WHEN** builder context 返回 `hostToolbarExtensions`
- **THEN** 响应 SHALL NOT 包含外部业务 token、CMS Cookie、integration secret、access cookie 值、handoffId、edit lock credentials 或未归一化的原始请求体

#### Scenario: 访问校验失败时不返回扩展按钮
- **WHEN** builder context 因缺少 access cookie、workspace/session mismatch、binding 失效或其他访问校验失败返回错误
- **THEN** 响应 SHALL NOT 包含 `hostToolbarExtensions`
- **AND** 系统 SHALL 保持现有 `builder_access_required`、`builder_access_mismatch` 或 `project_not_found` 错误语义
