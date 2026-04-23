## ADDED Requirements

### Requirement: page-builder prompt layering MUST surface canonical CMS guidance discovery before ordinary existing-region edits
系统 SHALL 在 page-builder 的 prompt layering 中把“命中宿主管理 CMS 构造时先 consult canonical guidance”提升为稳定规则，并 SHALL 在 ordinary flow 明确命中已有 CMS 区域时，把新的已有 CMS 区域 guidance capability 与最小 digest 一起顶到当前请求前面；当当前页面已经存在宿主管理 CMS 区域但本轮尚未显式命中某个具体 CMS target 时，系统 SHALL 至少提供轻量 page-level CMS guidance notice，引导模型先进入正确 CMS authoring 语境，而不是继续完全依赖模型自行决定是否需要读 skill。

#### Scenario: 根级约束声明命中 CMS 构造时先 consult canonical guidance
- **WHEN** 系统初始化、刷新或复制 page-builder 工作区的根级 `CLAUDE.md`
- **THEN** 该文件 SHALL 明确声明 `cms-catalog` / `cms-content` 是宿主管理 CMS constructs
- **AND** 该文件 SHALL 明确声明命中已有 CMS 构造时必须先 consult canonical guidance，再决定 ordinary edit 还是 controlled flow

#### Scenario: ordinary flow 命中已有 CMS 区域时 co-load region guidance 与最小 digest
- **WHEN** 一次 ordinary page-builder 请求明确命中已有 `cms-island` 或其他已知 CMS source target
- **THEN** 系统 SHALL 继续保留 `page-builder-guided-generation` 作为 ordinary controller
- **AND** 系统 SHALL 在同一轮 prompt layering 中额外提供新的已有 CMS 区域 guidance capability 与当前目标的最小 digest
- **AND** 系统 SHALL NOT 仅靠 `page-builder-guided-generation` 的默认 CMS 边界文案承担全部组件级理解任务

#### Scenario: 当前页面已含 CMS 区域但本轮未显式命中 target 时注入轻量 page-level notice
- **WHEN** 一次 ordinary page-builder 请求所在的当前页面已经包含已有 `cms-catalog` / `cms-content` 区域，但本轮没有显式命中某个具体 `cms-island`
- **THEN** 系统 SHALL 通过宿主控制的方式注入轻量 page-level CMS guidance notice，并 surfacing 既有 CMS 区域 guidance capability
- **AND** 该 notice SHALL 只负责提醒模型当前页面存在 host-managed CMS regions、不要 invent `cms-*`、不要猜 binding props、不要引入 page-wide Vue runtime
- **AND** 系统 SHALL NOT 在该场景默认注入某个具体 CMS target 的 authoring digest

#### Scenario: 既有 CMS 区域 guidance 通过宿主显式 surfacing 提供
- **WHEN** ordinary flow 命中已有 CMS 区域并需要新的 guidance capability
- **THEN** 系统 SHALL 通过宿主控制的 skill surfacing 机制显式提供该 capability，例如 `mentionedSkills`、`bootstrappedSkills` 或等价运行时注入
- **AND** 系统 SHALL NOT 仅依赖 skill 文件存在于 workspace 或模型自行发现 skill 来完成该次 guidance 激活

#### Scenario: 未命中具体 CMS target 的 ordinary turn 不额外注入 target-scoped digest
- **WHEN** 一次 ordinary page-builder 请求未明确命中已有 CMS 区域 target
- **THEN** 系统 SHALL NOT 为该次请求额外注入与当前目标无关的 CMS authoring digest
- **AND** 如果当前页面本身也不包含已有 CMS 区域，系统 SHALL NOT 额外 surfacing 新的已有 CMS 区域 guidance capability
- **AND** 系统 SHALL 避免把与当前目标无关的 target-scoped CMS guidance 作为普通默认噪音注入

#### Scenario: confirmed apply 仍使用专用 controller 而不是 ordinary CMS guidance layering
- **WHEN** 当前 workflow 已进入确认完成的 CMS apply 场景
- **THEN** 系统 SHALL 继续将该次请求路由到 `cms-binding-apply`
- **AND** 系统 SHALL NOT 让 ordinary existing-region guidance layering 替代 confirmed apply 的 controller
