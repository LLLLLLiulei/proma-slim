## Purpose
定义工作区作用域下的 Skills、MCP、workspace-files 与输入引用上下文如何暴露给 Agent 运行时和 Web UI。

## Requirements

### Requirement: 工作区必须拥有独立的 Skills 与 MCP 配置面
系统 SHALL 为每个工作区维护独立的 Skills 目录与 MCP 配置，并在 Agent 运行时按当前工作区加载它们。

#### Scenario: 工作区切换后读取对应能力
- **WHEN** 用户切换当前工作区或在不同工作区下打开会话
- **THEN** 系统 SHALL 读取该工作区自己的 Skills 与 MCP 配置，而不是复用全局共享配置

#### Scenario: 工作区能力摘要可被查询
- **WHEN** 前端请求某个工作区的能力摘要
- **THEN** 系统 SHALL 返回该工作区启用中的 Skill 与 MCP 服务器概要，供 UI 展示和引用

### Requirement: 工作区文件与附加目录必须进入 Agent 可访问范围
系统 SHALL 让工作区文件目录与工作区级附加目录进入 Agent 的可访问目录集合。

#### Scenario: workspace-files 自动加入附加目录
- **WHEN** 某个工作区会话开始执行 Agent 查询
- **THEN** 系统 SHALL 将该工作区的 `workspace-files` 目录加入 Agent SDK 的 `additionalDirectories`

#### Scenario: 工作区级附加目录共享给会话
- **WHEN** 用户为某个工作区配置附加目录
- **THEN** 该工作区下的会话 SHALL 共享这些目录，并在运行 Agent 时一并传递给 SDK

### Requirement: 输入引用上下文必须感知当前工作区
系统 SHALL 让输入组件基于当前工作区路径、slug 与附加目录启用文件、Skill 和 MCP 的工作区作用域引用。

#### Scenario: 文件引用搜索当前工作区
- **WHEN** 用户在输入框中触发文件引用
- **THEN** 系统 SHALL 以当前工作区路径及其附加目录作为搜索范围，而不是使用固定全局目录

#### Scenario: Skill 与 MCP 引用绑定工作区 slug
- **WHEN** 用户在输入框中触发 Skill 或 MCP 引用
- **THEN** 系统 SHALL 以当前工作区的 slug 解析引用上下文，确保引用结果与当前工作区能力一致

### Requirement: Workspace prompt context MUST describe workspace topology and local resource paths
系统 SHALL 在每次 Agent 查询前注入 workspace 作用域上下文，明确说明 session `cwd`、workspace root、Skills、workspace-files、附加目录与本地 `memory/MEMORY.md` 的关系，避免模型把 scratch `cwd` 误判为全部资源的根目录。

#### Scenario: Prompt includes workspace-local memory contract
- **WHEN** 当前工作区存在本地 `memory/MEMORY.md`
- **THEN** 系统 SHALL 在动态上下文中暴露该文件的稳定绝对路径，并明确要求本地记忆读写只使用该路径，而不是回退到 `sdk-config/projects/.../memory/MEMORY.md` 等 SDK 内部路径

#### Scenario: Prompt includes workspace skill and subagent guidance
- **WHEN** 系统为某个工作区会话构建 prompt
- **THEN** 系统 SHALL 在上下文中同时说明该工作区的 Skill 命名空间与 subagent 使用边界，使模型能区分 workspace 能力面与 scratch/runtime 边界
