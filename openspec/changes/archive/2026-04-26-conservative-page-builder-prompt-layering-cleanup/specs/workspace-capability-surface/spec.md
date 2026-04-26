## ADDED Requirements

### Requirement: Workspace dynamic context MUST stay runtime-factual and keep global behavior rules in higher prompt layers
系统 SHALL 让 workspace dynamic context 以当前运行时事实和与当前值强绑定的最小使用说明为主，例如 `cwd`、workspace root、`workspace-files`、附加目录、本地 memory 文件路径、内部预览地址与 scratch 状态；跨 workspace 通用的行为规则，例如助手身份、对外表述约束、全局 subagent/worktree 原则，SHALL 继续留在 system prompt 或等价的更高提示层，而不得在 dynamic context 中重复展开。

#### Scenario: dynamic context 暴露当前 scratch 事实但不重复完整 subagent 政策
- **WHEN** 系统为某个 workspace 会话构建 dynamic context
- **THEN** 系统 SHALL 说明当前 `working_directory` 是宿主管理的 scratch 目录
- **AND** 系统 SHALL 只提供与该事实直接绑定的最小使用说明
- **AND** 系统 SHALL NOT 在该层重复整套“研究型 subagent 是否使用 worktree”之类的全局行为规则

#### Scenario: dynamic context 继续暴露 memory 与 preview 的运行时说明
- **WHEN** 当前 workspace 存在本地 memory 文件路径或内部预览地址
- **THEN** 系统 SHALL 在 dynamic context 中暴露这些稳定运行时值及其最小使用说明
- **AND** 系统 SHALL 允许该层继续承担与这些值强绑定的路径/访问提示

#### Scenario: system prompt 保持全局身份与 subagent 规则的权威来源
- **WHEN** 系统为 workspace 会话构建完整 prompt surface
- **THEN** 系统 SHALL 继续让 system prompt 作为助手身份、语言、破坏性确认和全局 subagent/worktree 规则的权威来源
- **AND** 系统 SHALL NOT 依赖 dynamic context 重新承载这些全局行为规则

### Requirement: Workspace capability summaries MUST remain discoverability surfaces rather than active turn owner contracts
系统 SHALL 将 workspace capability summary，例如当前工作区启用 skills 与 MCP 的概览，视为 discoverability surface，而不是当前 turn owner 协议的替代物。active turn 的 owner、consult-only guidance 与 confirmed apply contract SHALL 继续由宿主注入的 routing metadata、bootstrapped skill 或等价的 turn-scoped surfacing 机制显式表达，而不得仅凭 capability summary 列表推导。

#### Scenario: skill summary 仅作为能力目录
- **WHEN** 系统在 workspace prompt context 中提供当前启用 skills 的概览
- **THEN** 该概览 SHALL 主要服务于能力发现和引用
- **AND** 系统 SHALL NOT 将该概览视为当前 turn owner 已稳定生效的充分条件

#### Scenario: current owner 仍通过 turn-scoped surfacing 明确表达
- **WHEN** 某次 page-builder turn 已由宿主确定当前 owner 或 consult-only guidance
- **THEN** 系统 SHALL 继续通过 turn-scoped prompt surfacing 明确表达当前已生效的 owner / consult contract
- **AND** 系统 SHALL NOT 仅依赖 workspace capability summary 让模型自行推导当前控制链路
