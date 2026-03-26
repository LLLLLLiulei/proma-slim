## ADDED Requirements

### Requirement: Workspace prompt context MUST describe workspace topology and local resource paths
系统 SHALL 在每次 Agent 查询前注入 workspace 作用域上下文，明确说明 session `cwd`、workspace root、Skills、workspace-files、附加目录与本地 `memory/MEMORY.md` 的关系，避免模型把 scratch `cwd` 误判为全部资源的根目录。

#### Scenario: Prompt includes workspace-local memory contract
- **WHEN** 当前工作区存在本地 `memory/MEMORY.md`
- **THEN** 系统 SHALL 在动态上下文中暴露该文件的稳定绝对路径，并明确要求本地记忆读写只使用该路径，而不是回退到 `sdk-config/projects/.../memory/MEMORY.md` 等 SDK 内部路径

#### Scenario: Prompt includes workspace skill and subagent guidance
- **WHEN** 系统为某个工作区会话构建 prompt
- **THEN** 系统 SHALL 在上下文中同时说明该工作区的 Skill 命名空间与 subagent 使用边界，使模型能区分 workspace 能力面与 scratch/runtime 边界
