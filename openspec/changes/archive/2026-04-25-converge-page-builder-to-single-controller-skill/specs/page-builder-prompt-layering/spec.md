## MODIFIED Requirements

### Requirement: page-builder 根级 `CLAUDE.md` 必须收敛为全局约束与场景路由层
系统 SHALL 将 page-builder 工作区根级 `CLAUDE.md` 维持为共享的全局约束与场景路由层，只承载工作区输出规则、普通用户交互硬边界、默认 skill 路由和 CMS 全局边界；该文件还 SHALL 明确 ordinary page-builder flow 只有一个默认 controller，并将已有 CMS 区域 guidance 与 visual skills 描述为 consult / worker 层，而不得继续在其中重复 skill 内部的提问 contract、确认细则或详细 CMS authoring 示例。

#### Scenario: 初始化 page-builder 工作区时写入单主控路由型 `CLAUDE.md`
- **WHEN** 系统为一个新的 `page-builder` 工作区初始化根级 `CLAUDE.md`
- **THEN** 该文件 SHALL 约束预览产物写入 `workspace-files`
- **AND** 该文件 SHALL 约束普通用户确认使用 `AskUserQuestion`
- **AND** 该文件 SHALL 明确 ordinary page-builder flow 默认路由到 `page-builder-guided-generation`
- **AND** 该文件 SHALL 明确已有 CMS 区域 guidance 只作为 consult-only specialist
- **AND** 该文件 SHALL 明确 confirmed CMS apply 默认路由到 `cms-binding-apply`

#### Scenario: skill 内部执行细节不在根级 `CLAUDE.md` 中重复
- **WHEN** 系统为 page-builder 工作区维护或刷新根级 `CLAUDE.md`
- **THEN** 该文件 SHALL NOT 重复 `page-builder-guided-generation` 的详细提问阈值、briefing checklist 或覆盖确认流程
- **AND** 该文件 SHALL NOT 重复 `page-builder-cms-region-authoring-guidance` 的组件级 contract digest、字段表或 authoring 细则
- **AND** 该文件 SHALL NOT 重复 `cms-binding-apply` 的详细 apply payload checklist、slot scope 或字段级 authoring contract

### Requirement: ordinary page-builder 请求必须由 `page-builder-guided-generation` 统一承接
系统 SHALL 将普通用户在 `page-builder` 中发起的专题页创建、普通迭代、repair、redo 和 selected-block follow-up 统一路由到 `page-builder-guided-generation`，并 SHALL 让用户侧 briefing、关键澄清、最终确认与 ordinary edit 持续由该主控 skill 承接；已有 CMS 区域 guidance 只可作为 consult-only specialist 被 surfacing，而不得成为 ordinary flow 的并列 owner。

#### Scenario: 首轮专题页需求默认进入 guided-generation
- **WHEN** 用户在 `page-builder` 中发起一条普通专题页创建需求，且当前发送未显式进入专用 CMS apply 流程
- **THEN** 系统 SHALL 将该请求路由到 `page-builder-guided-generation`
- **AND** 系统 SHALL 让该主控 skill 负责后续的 briefing、澄清与确认

#### Scenario: 已有页面的普通修改仍沿用 guided-generation
- **WHEN** 当前页面已经生成，且用户继续提出配色、文案、区块顺序、风格微调、普通修复或其他 ordinary 迭代请求
- **THEN** 系统 SHALL 继续将该请求路由到 `page-builder-guided-generation`
- **AND** 系统 SHALL NOT 因页面中存在 CMS 区域就自动改走 confirmed CMS apply 流程

#### Scenario: 已选 CMS island 的 ordinary follow-up 仍保持 guided-generation 为 owner
- **WHEN** 当前请求已经命中一个已有 `cms-island`，但任务仍属于样式、slot 结构、普通文案呈现或同类 ordinary follow-up
- **THEN** 系统 SHALL 继续将该请求路由到 `page-builder-guided-generation`
- **AND** 系统 MAY 额外 surfacing 当前 target 的 CMS digest 与 consult-only guidance
- **AND** 系统 SHALL NOT 把 `page-builder-cms-region-authoring-guidance` 提升为该轮并列 owner

### Requirement: page-builder prompt layering MUST distinguish workspace-visible skills from turn-promoted skills
系统 SHALL 区分“某个 skill 在当前 workspace 中可见”与“某个 skill 在当前 turn 被默认提升”的两个层级。所有相关 skills MAY 继续出现在 workspace 能力面中，但 ordinary page-builder turn 的默认 promotion / bootstrap MUST 只围绕单一 ordinary controller `page-builder-guided-generation` 展开；`page-builder-cms-region-authoring-guidance` 只在命中已有 CMS 区域时作为 consult-only specialist 被 surfacing，`brainstorming` SHALL NOT 作为 ordinary page-builder turn 的默认 promoted competitor。

#### Scenario: skills 可以继续可见但 ordinary turn 只默认提升单主控
- **WHEN** 系统为一次 ordinary page-builder turn 构建最终 prompt
- **THEN** 系统 MAY 继续保留多个 page-builder 相关 skills 在 workspace `Skills:` 列表中可见
- **AND** 系统 SHALL 只默认提升 `page-builder-guided-generation` 作为 ordinary controller
- **AND** 系统 SHALL NOT 在同一 ordinary turn 中默认并列提升另一个 controller competitor

#### Scenario: brainstorming 不作为 ordinary page-builder turn 的默认 promoted competitor
- **WHEN** 系统为一次 ordinary page-builder turn 构建最终 prompt，且用户并未显式要求 brainstorm、方案比较或先讨论再做
- **THEN** 系统 SHALL NOT 默认提升 `brainstorming` 作为当前 turn 的优先 skill 候选
- **AND** 系统 SHALL NOT 让 `brainstorming` 与 `page-builder-guided-generation` 竞争 ordinary flow 的主控权

#### Scenario: 命中已有 CMS 区域时只额外 surfacing consult guidance
- **WHEN** 一次 ordinary page-builder turn 明确命中已有 `cms-island` 或其他已知 CMS source target
- **THEN** 系统 SHALL 继续保留 `page-builder-guided-generation` 作为 ordinary controller
- **AND** 系统 SHALL 额外 surfacing 当前 target 的最小 CMS digest 与 `page-builder-cms-region-authoring-guidance`
- **AND** 系统 SHALL 将该 CMS guidance 视为 consult-only specialist，而不是额外的普通 owner

### Requirement: page-builder prompt layering MUST surface canonical CMS guidance discovery before ordinary existing-region edits
系统 SHALL 在 page-builder 的 prompt layering 中把“命中宿主管理 CMS 构造时先 consult canonical guidance”提升为稳定规则，并 SHALL 在 ordinary flow 明确命中已有 CMS 区域时，把当前 target 的最小 digest 与 consult-only CMS guidance 一起顶到当前请求前面；当当前页面已经存在宿主管理 CMS 区域但本轮尚未显式命中某个具体 CMS target 时，系统 SHALL 至少提供轻量 page-level CMS guidance notice，引导模型先进入正确 CMS authoring 语境，而不是继续完全依赖模型自行决定是否需要读 skill。

#### Scenario: 根级约束声明命中 CMS 构造时先 consult canonical guidance
- **WHEN** 系统初始化、刷新或复制 page-builder 工作区的根级 `CLAUDE.md`
- **THEN** 该文件 SHALL 明确声明 `cms-catalog` / `cms-content` 是宿主管理 CMS constructs
- **AND** 该文件 SHALL 明确声明命中已有 CMS 构造时必须先 consult canonical guidance，再决定 ordinary edit 还是 controlled flow

#### Scenario: ordinary flow 命中已有 CMS 区域时 co-load consult guidance 与最小 digest
- **WHEN** 一次 ordinary page-builder 请求明确命中已有 `cms-island` 或其他已知 CMS source target
- **THEN** 系统 SHALL 继续保留 `page-builder-guided-generation` 作为 ordinary controller
- **AND** 系统 SHALL 在同一轮 prompt layering 中额外提供当前 target 的最小 CMS digest 与 `page-builder-cms-region-authoring-guidance`
- **AND** 系统 SHALL NOT 仅靠 `page-builder-guided-generation` 的默认 CMS 边界文案承担全部组件级理解任务

#### Scenario: 当前页面已含 CMS 区域但本轮未显式命中 target 时注入轻量 page-level notice
- **WHEN** 一次 ordinary page-builder 请求所在的当前页面已经包含已有 `cms-catalog` / `cms-content` 区域，但本轮没有显式命中某个具体 `cms-island`
- **THEN** 系统 SHALL 通过宿主控制的方式注入轻量 page-level CMS guidance notice
- **AND** 该 notice SHALL 只负责提醒模型当前页面存在 host-managed CMS regions、不要 invent `cms-*`、不要猜 binding props、不要引入 page-wide Vue runtime
- **AND** 系统 SHALL NOT 在该场景默认注入某个具体 CMS target 的 authoring digest

#### Scenario: confirmed apply 仍使用专用 controller 而不是 ordinary CMS guidance layering
- **WHEN** 当前 workflow 已进入确认完成的 CMS apply 场景
- **THEN** 系统 SHALL 继续将该次请求路由到 `cms-binding-apply`
- **AND** 系统 SHALL NOT 让 ordinary existing-region guidance layering 替代 confirmed apply 的 controller
