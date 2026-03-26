## ADDED Requirements

### Requirement: Page-builder 项目工作区必须自动准备默认 MCP 服务
系统 SHALL 在新建 `page-builder` 项目工作区时，为该工作区持久化网页构建所需的默认 MCP 服务，使后续 builder 会话无需手动配置即可使用浏览器预览与辅助推理能力。

#### Scenario: 新建 page-builder 项目时写入默认 MCP 配置
- **WHEN** 用户通过 `page-builder` 首页提交需求并创建新的项目工作区
- **THEN** 系统 SHALL 在该工作区的持久化 MCP 配置中写入启用状态的 `playwright` 与 `server-sequential-thinking` 两个 stdio 服务

#### Scenario: 同一工作区下的后续会话复用默认 MCP
- **WHEN** 用户在同一个 `page-builder` 工作区下继续当前会话或新建后续会话
- **THEN** 系统 SHALL 继续复用该工作区已持久化的默认 MCP 配置，而不是要求用户再次配置或在消息中重复注入提示词

#### Scenario: 重复初始化时不覆盖已有同名 MCP 配置
- **WHEN** 某个 `page-builder` 工作区已经存在 `playwright` 或 `server-sequential-thinking` 的同名 MCP 配置，且模板初始化流程再次执行
- **THEN** 系统 SHALL 保留已有同名配置，并仅补齐缺失的默认 MCP 条目，而不是覆盖用户已经调整过的设置

