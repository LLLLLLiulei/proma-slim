## ADDED Requirements

### Requirement: Brainstorming MUST be an explicit-entry discussion skill rather than a universal preflight gate
系统 SHALL 将 `brainstorming` 定义为一个仅在用户明确要求 brainstorm、比较方案、先讨论再决定，或宿主在非 workspace-specific controller flow 中显式选择时才进入的讨论型 skill；系统 SHALL NOT 再把它描述为“任何 creative work 前都必须使用”的通用前置 gate。

#### Scenario: 用户显式要求 brainstorm 时允许进入 brainstorming
- **WHEN** 用户明确表达“先 brainstorm 一下”“先讨论几个方案”“先比较实现方向再做”或同等意图
- **THEN** 系统 SHALL 允许进入 `brainstorming`
- **AND** 该 skill SHALL 以分析、比较方案、澄清需求为主要职责

#### Scenario: 普通页面生成或普通修改不会因 creative work 自动进入 brainstorming
- **WHEN** 当前请求只是 page-builder 中的普通页面创建、普通迭代、repair、redo 或其他 workspace-specific controller 已能直接承接的任务
- **THEN** 系统 SHALL NOT 仅因该任务属于 creative work 就自动要求先进入 `brainstorming`
- **AND** 系统 SHALL NOT 把 `brainstorming` 描述为所有此类任务的强制前置 skill

### Requirement: Brainstorming MUST yield to workspace-specific controller flows
系统 SHALL 要求 `brainstorming` 在存在 workspace-specific controller 的场景中让位于该 controller；它可以作为显式进入的讨论辅助层存在，但不得覆盖该 workspace 的默认主控、不得接管专用确认流程，也不得阻断用户回到原有 controller 完成正式生成或修改。

#### Scenario: page-builder ordinary flow 不被 brainstorming 抢占主控
- **WHEN** 当前工作区存在明确的 ordinary controller，例如 `page-builder-guided-generation`
- **THEN** 系统 SHALL 要求 `brainstorming` 不覆盖该 ordinary controller 的默认控制权
- **AND** 系统 SHALL NOT 在未显式请求 brainstorm 时让 `brainstorming` 与该 controller 竞争主控

#### Scenario: 在 page-builder 中显式 brainstorm 后仍回到原 controller 执行
- **WHEN** 用户在 `page-builder` 中显式要求先 brainstorm 页面方向、内容结构或视觉路线
- **THEN** `brainstorming` MAY 参与该次讨论
- **AND** 讨论完成后，系统 SHALL 继续由 `page-builder-guided-generation` 承接正式的用户确认、页面生成或后续 ordinary 修改
- **AND** `brainstorming` SHALL NOT 直接接管 confirmed CMS apply 或普通页面写入流程
