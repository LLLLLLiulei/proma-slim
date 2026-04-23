## Purpose

定义 `page-builder` 工作区根级 `CLAUDE.md`、普通页面生成主控 skill 与确认后 CMS apply skill 的职责分层与默认路由。

## Requirements

### Requirement: page-builder 根级 `CLAUDE.md` 必须收敛为全局约束与场景路由层
系统 SHALL 将 page-builder 工作区根级 `CLAUDE.md` 维持为共享的全局约束与场景路由层，只承载工作区输出规则、普通用户交互硬边界、默认 skill 路由和 CMS 全局边界，而不得继续在其中重复 skill 内部的提问 contract、确认细则或详细 CMS authoring 示例。

#### Scenario: 初始化 page-builder 工作区时写入全局约束与路由型 `CLAUDE.md`
- **WHEN** 系统为一个新的 `page-builder` 工作区初始化根级 `CLAUDE.md`
- **THEN** 该文件 SHALL 约束预览产物写入 `workspace-files`
- **AND** 该文件 SHALL 约束普通用户确认使用 `AskUserQuestion`
- **AND** 该文件 SHALL 明确 ordinary page-builder flow 与 confirmed CMS apply flow 的默认路由

#### Scenario: skill 内部执行细节不在根级 `CLAUDE.md` 中重复
- **WHEN** 系统为 page-builder 工作区维护或刷新根级 `CLAUDE.md`
- **THEN** 该文件 SHALL NOT 重复 `page-builder-guided-generation` 的详细提问阈值、briefing checklist 或覆盖确认流程
- **AND** 该文件 SHALL NOT 重复 `cms-binding-apply` 的详细 apply payload checklist、slot scope 或字段级 authoring contract

### Requirement: ordinary page-builder 请求必须由 `page-builder-guided-generation` 统一承接
系统 SHALL 将普通用户在 `page-builder` 中发起的专题页创建与后续普通迭代请求统一路由到 `page-builder-guided-generation`，并 SHALL 让用户侧 briefing、关键澄清、最终确认与普通迭代持续由该主控 skill 承接，除非当前请求已经进入更专用的受控流程。

#### Scenario: 首轮专题页需求默认进入 guided-generation
- **WHEN** 用户在 `page-builder` 中发起一条普通专题页创建需求，且当前发送未显式进入专用 CMS apply 流程
- **THEN** 系统 SHALL 将该请求路由到 `page-builder-guided-generation`
- **AND** 系统 SHALL 让该主控 skill 负责后续的 briefing、澄清与确认

#### Scenario: 已有页面的普通修改仍沿用 guided-generation
- **WHEN** 当前页面已经生成，且用户继续提出配色、文案、区块顺序、风格微调或其他普通迭代请求
- **THEN** 系统 SHALL 继续将该请求路由到 `page-builder-guided-generation`
- **AND** 系统 SHALL NOT 因页面中存在 CMS 区域就自动改走确认 CMS apply 流程

### Requirement: CMS 相关请求必须按“预选择”与“已确认 apply”两个场景分流
系统 SHALL 将 page-builder 中与 CMS 相关的请求明确分流为“用户尚未完成 CMS 选择的预选择场景”和“已拥有确认选择结果的 apply 场景”；普通引导 flow MUST NOT 越过 CMS 选择阶段直接新建或重绑 `cms-*` 标签，而 confirmed CMS selection MUST 进入 `cms-binding-apply`、机器可读 decision 与正式 apply 链路。

#### Scenario: 尚未确认 CMS 选择时不直接新建或重绑 `cms-*`
- **WHEN** 用户表达某个区块需要接 CMS 数据，但当前并不存在已确认的 CMS 选择结果与目标上下文
- **THEN** 系统 SHALL 将该请求视为 CMS 预选择场景
- **AND** 系统 SHALL NOT 直接新建或重绑 `cms-catalog` / `cms-content`
- **AND** 系统 SHALL 要求先进入正式 CMS 选择流程

#### Scenario: 已确认 CMS 选择后进入 decision-backed confirmed apply flow
- **WHEN** 系统已经拥有一次确认完成的 CMS 选择结果、目标选择上下文和 Phase 1A apply 边界
- **THEN** 系统 SHALL 将后续决策路由到 `cms-binding-apply`
- **AND** 系统 SHALL 要求 confirmed CMS apply 先物化机器可读 decision，再继续正式 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL NOT 继续让 `page-builder-guided-generation` 持有该次确认后的 CMS apply 执行权

### Requirement: Selected `cms-island` follow-up messages must distinguish style iteration from binding re-entry
系统 SHALL 在用户选中一个已存在的 `cms-island` 后，对后续普通消息做意图分流：样式/slot 迭代继续走 ordinary `page-builder-guided-generation`，但任何会改变 binding identity 的请求 MUST 回到 CMS browser confirm 与 decision/apply chain，而不能继续停留在 ordinary flow。

#### Scenario: Style-only follow-up on a selected CMS island stays in ordinary iteration with source-atomic semantics
- **WHEN** 用户选中一个 `cms-island`，并提出布局、样式、图片比例、slot 内结构或等价的视觉调整请求
- **THEN** 系统 SHALL 继续将该消息路由到 `page-builder-guided-generation`
- **AND** 系统 SHALL 保留 `source-atomic`、`replace-whole-source-component` 与禁止 rendered-child writes 的选择语义

#### Scenario: Binding-identity changes on a selected CMS island return to the controlled CMS flow
- **WHEN** 用户选中一个 `cms-island`，并提出更换栏目、重新选择 CMS 内容、改变 `site-id`、`catalog-id`、`ids`、`page-size`、`take` 或等价 binding identity 的请求
- **THEN** 系统 SHALL 将该请求重新路由回 CMS browser confirm 与 decision-backed confirmed apply flow
- **AND** 系统 SHALL NOT 仅通过 ordinary `page-builder-guided-generation` 直接修改已有 `cms-*` 的 query props

### Requirement: page-builder 根级 `CLAUDE.md` 必须声明 CMS islands 的 HTML-first 作者态模型
系统 SHALL 在 page-builder 工作区根级 `CLAUDE.md` 中明确声明作者态页面是 HTML-first 的：`cms-catalog` / `cms-content` 是宿主管理的 CMS source tags，Vue template 语法只属于这些 CMS source tags 的 slot authoring，而普通页面区域 MUST 保持普通 HTML/CSS/JS。

#### Scenario: 初始化根级模板时写入 CMS islands 作者态模型
- **WHEN** 系统为新的或已有的 page-builder 工作区初始化、回填或刷新根级 `CLAUDE.md`
- **THEN** 该文件 SHALL 明确说明 `cms-catalog` / `cms-content` 是宿主管理的 CMS islands source tags
- **AND** 该文件 SHALL 明确说明 Vue template 语法只应出现在这些 CMS source tags 的 slot authoring 中
- **AND** 该文件 SHALL 明确说明 `cms-*` 之外的页面区域保持普通 HTML/CSS/JS

#### Scenario: 根级模板禁止作者自管 Vue runtime 与整页 mount
- **WHEN** 根级 `CLAUDE.md` 描述 page-builder 的 CMS 全局边界
- **THEN** 该文件 SHALL 明确禁止 Agent 为 CMS 渲染自行引入 Vue runtime、Vue CDN、Vue importmap 或自定义 bootstrap
- **AND** 该文件 SHALL 明确禁止 Agent 通过 page-wide `createApp` / `mount` 把整页改造成单一 Vue app
- **AND** 该文件 SHALL 将新的 CMS source tag authoring 继续路由到受控 CMS flow，而不是 generic Vue authoring

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
