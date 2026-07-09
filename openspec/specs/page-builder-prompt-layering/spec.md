## Purpose

定义 `page-builder` 工作区根级 `CLAUDE.md`、普通页面生成主控 skill 与确认后 CMS apply skill 的职责分层与默认路由。

## Requirements

### Requirement: page-builder 根级 `CLAUDE.md` 必须收敛为全局约束与角色路由层
系统 SHALL 将 page-builder 工作区根级 `CLAUDE.md` 维持为共享的全局约束与角色路由层，只承载工作区输出规则、普通用户交互硬边界、scene routing、owner / consult / discussion / execute 的角色分层，以及 CMS 全局边界；该文件 SHALL NOT 重复 skill 内部的提问 contract、确认细则或详细 CMS authoring 示例。

#### Scenario: 初始化 page-builder 工作区时写入全局约束与角色路由型 `CLAUDE.md`
- **WHEN** 系统为一个新的 `page-builder` 工作区初始化根级 `CLAUDE.md`
- **THEN** 该文件 SHALL 约束预览产物写入 `workspace-files`
- **AND** 该文件 SHALL 约束普通用户确认优先使用 `AskUserQuestion`
- **AND** 该文件 SHALL 明确 `ordinary-page-flow` 与 `existing-cms-region-ordinary-edit` 默认由 `page-builder-guided-generation` 主控
- **AND** 该文件 SHALL 明确 `page-builder-cms-region-authoring-guidance` 仅为 consult-only guidance
- **AND** 该文件 SHALL 明确 confirmed CMS apply 默认路由到 `cms-binding-apply`
- **AND** 该文件 SHALL 明确 `brainstorming` 仅为 discussion-only，`topic-page-style`、`taste-skill` 与 `redesign-skill` 仅作为 execute-only visual workers

#### Scenario: skill 内部执行细节不在根级 `CLAUDE.md` 中重复
- **WHEN** 系统为 page-builder 工作区维护或刷新根级 `CLAUDE.md`
- **THEN** 该文件 SHALL NOT 重复 `page-builder-guided-generation` 的详细提问阈值、briefing checklist 或覆盖确认流程
- **AND** 该文件 SHALL NOT 重复 `page-builder-cms-region-authoring-guidance` 的组件级 contract digest、字段表或 authoring 细则
- **AND** 该文件 SHALL NOT 重复 `cms-binding-apply` 的详细 apply payload checklist、slot scope 或字段级 authoring contract

### Requirement: page-builder ordinary turn MUST use host-selected owner routing metadata
系统 SHALL 让 page-builder 的 ordinary turn 由宿主先完成 scene 分类、owner 选择与 owner lock，再把这些事实作为 routing metadata 注入 prompt；`ordinary-page-flow` 与 `existing-cms-region-ordinary-edit` 都 SHALL 使用 `page-builder-guided-generation` 作为唯一 owner，`confirmed-cms-apply` SHALL 使用 `cms-binding-apply` 作为唯一 owner。系统 SHALL NOT 仅凭技能文件暴露或消息文本 pattern，让模型在同一轮里自行切换到另一个 owner-controller。

#### Scenario: 首轮专题页需求默认进入 guided-generation owner
- **WHEN** 用户在 `page-builder` 中发起一条普通专题页创建需求，且当前发送未显式进入 confirmed CMS apply，也未命中已有 CMS target
- **THEN** 系统 SHALL 注入 `page-builder-guided-generation` 作为当前 turn 的唯一 owner
- **AND** 系统 SHALL 注入当前 `sceneKind`、`ownerSkill` 与 `ownerLockedForTurn` 等 routing metadata

#### Scenario: 显式 existing CMS target ordinary edit 仍保持 guided-generation owner
- **WHEN** 当前页面已经存在 `cms-catalog`、`cms-content` 或 `cms-island`，且当前请求明确命中某个已有 CMS target，但任务仍属于 ordinary authoring
- **THEN** 系统 SHALL 继续将该请求的 owner 设为 `page-builder-guided-generation`
- **AND** 系统 SHALL NOT 将 `page-builder-cms-region-authoring-guidance` 升级为新的 owner

#### Scenario: confirmed CMS apply 使用专用 owner
- **WHEN** 当前 workflow 已进入确认完成的 CMS apply 场景
- **THEN** 系统 SHALL 注入 `cms-binding-apply` 作为该次 turn 的唯一 owner
- **AND** 系统 SHALL NOT 让普通 page-builder owner 或 consult-only guidance 替代 confirmed apply controller

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

### Requirement: Selected `cms-island` sends must rely on explicit current target instead of continuation text guessing
系统 SHALL 在用户显式选中一个已存在的 `cms-island` 后，把该次发送视为 `existing-cms-region-ordinary-edit` scene，并由 `page-builder-guided-generation` 作为唯一 owner 承接，同时 consult `page-builder-cms-region-authoring-guidance`。任何会改变 binding identity 的请求 MUST 回到 CMS browser confirm 与 decision/apply chain，而不能继续停留在 ordinary flow 或 existing-region ordinary edit。宿主 SHALL 只依据当前显式 target 与 workflow 边界元数据决定是否进入该 scene，SHALL NOT 通过“继续”“再改一下”之类的自由文本去延续、重建或清空旧的 CMS target。

#### Scenario: Style-only follow-up on a selected CMS island keeps guided-generation owner
- **WHEN** 用户选中一个 `cms-island`，并提出布局、样式、图片比例、slot 内结构或等价的视觉调整请求
- **THEN** 系统 SHALL 将该消息路由到 `existing-cms-region-ordinary-edit` scene
- **AND** 系统 SHALL 保持 `page-builder-guided-generation` 作为唯一 owner
- **AND** 系统 SHALL 提供 `page-builder-cms-region-authoring-guidance` 供其 consult

#### Scenario: 没有显式 CMS target 的后续消息不会被宿主自动恢复到 CMS-island route
- **WHEN** 用户此前编辑过某个 `cms-island`，但当前发送已经没有新的显式 CMS target，也没有 confirmed CMS workflow state
- **THEN** 系统 SHALL NOT 仅凭 continuation 文本把该请求恢复为 `existing-cms-region-ordinary-edit` scene
- **AND** 系统 SHALL 让当前 owner 按 ordinary flow 处理该条消息，必要时再由 owner 自己澄清用户意图

#### Scenario: Binding-identity changes on a selected CMS island return to the controlled CMS flow
- **WHEN** 用户选中一个 `cms-island`，并提出更换栏目、重新选择 CMS 内容、改变 `site-id`、`catalog-id`、`ids`、`page-size`、`take` 或等价 binding identity 的请求
- **THEN** 系统 SHALL 将该请求重新路由回 CMS browser confirm 与 decision-backed confirmed apply flow
- **AND** 系统 SHALL NOT 仅通过 ordinary owner 或 consult-only guidance 直接修改已有 `cms-*` 的 query props

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

### Requirement: page-builder prompt layering MUST separate page-level CMS notice from target-scoped consult guidance
系统 SHALL 在 page-builder 的 prompt layering 中把 `page-level CMS notice`、turn-level routing metadata 与 `target-scoped existing-CMS guidance` 明确分层：当当前页面包含已有 CMS 区域但本轮未显式命中具体 target 时，系统 SHALL 只注入轻量 advisory notice；只有当本轮通过宿主结构化 target 上下文明确命中已有 CMS region target，且任务仍属于 ordinary authoring 时，系统 SHALL 在保持 `page-builder-guided-generation` owner 不变的前提下，显式 surface `page-builder-cms-region-authoring-guidance` 与当前目标的最小 digest；confirmed CMS apply 仍 SHALL 继续由 `cms-binding-apply` 独占。系统 SHALL NOT 再用纯文本 pattern 或正则，把一个已经由宿主结构化上下文确定的 scene 重新分流到别的 owner。

#### Scenario: explicit existing CMS target turn 加载 consult guidance 与最小 digest
- **WHEN** 一次 Builder 请求明确命中已有 `cms-island` 或其他已知 CMS source target，且该请求仍属于 ordinary authoring
- **THEN** 系统 SHALL 保持 `page-builder-guided-generation` 为该次请求的唯一 owner
- **AND** 系统 SHALL 为该次请求显式提供 `page-builder-cms-region-authoring-guidance` 与当前目标的最小 digest
- **AND** 系统 SHALL NOT 仅靠 page-level notice 承担组件级理解任务

#### Scenario: 当前页面已含 CMS 区域但本轮未显式命中 target 时仅注入 advisory notice
- **WHEN** 一次 ordinary page-builder 请求所在的当前页面已经包含已有 `cms-catalog` 或 `cms-content` 区域，但本轮没有显式命中某个具体 `cms-island`
- **THEN** 系统 SHALL 通过宿主控制的方式注入轻量 page-level CMS guidance notice
- **AND** 该 notice SHALL 只负责提醒模型当前页面存在 host-managed CMS regions、不要 invent `cms-*`、不要猜 binding props、不要引入 page-wide Vue runtime
- **AND** 系统 SHALL NOT 在该场景额外 surfacing `page-builder-cms-region-authoring-guidance` 或某个具体 target 的 authoring digest

#### Scenario: 无 CMS 页面不注入额外 CMS notice 或 existing-region guidance
- **WHEN** 一次 ordinary page-builder 请求所在页面本身不包含已有 `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL NOT 额外注入 page-level CMS guidance notice
- **AND** 系统 SHALL NOT surfacing `page-builder-cms-region-authoring-guidance`

#### Scenario: 既有 CMS 区域 guidance 通过宿主显式 surfacing 提供
- **WHEN** explicit existing CMS target turn 需要新的已有 CMS 区域 guidance capability
- **THEN** 系统 SHALL 通过宿主控制的 skill surfacing 机制显式提供该 capability，例如 `mentionedSkills`、`bootstrappedSkills` 或等价运行时注入
- **AND** 系统 SHALL NOT 仅依赖 skill 文件存在于 workspace 或模型自行发现 skill 来完成该次 guidance 激活

### Requirement: page-builder 默认 turn-level skill surfacing MUST 以当前 owner 为中心并限制竞争面
系统 SHALL 让 page-builder 工作区在默认 turn-level prompt surfacing 中只主动提升当前路由批准的 owner-controller 与当前 scene 可用的 secondary skills，以减少 owner 竞争和命名漂移。ordinary turn 的 bootstrapped owner MUST 为 `page-builder-guided-generation`；confirmed apply turn 的 bootstrapped owner MUST 为 `cms-binding-apply`；`page-builder-cms-region-authoring-guidance` 只 MAY 在 explicit existing CMS target ordinary edit 时按需 surfacing；`topic-page-style`、`taste-skill` 与 `redesign-skill` MAY 作为 execute-only visual workers 被当前 owner 按阶段调度，但不得作为平级 owner controller 参与默认竞争。系统 SHALL NOT 在 page-builder 默认 turn-level surfacing 中继续并列提升 `brainstorming`、`soft-skill` 或其他会与 owner 争抢主控权的 meta-planning / creativity skills。

#### Scenario: ordinary turn 只提升当前 owner 与允许的二级 skills
- **WHEN** 系统为一次 ordinary page-builder turn 构建最终 prompt
- **THEN** 系统 SHALL 提升 `page-builder-guided-generation` 作为 bootstrapped owner
- **AND** 系统 MAY 按当前 scene 需要提升 `page-builder-cms-region-authoring-guidance`
- **AND** 系统 MAY 由当前 owner 在确认后按任务阶段显式调度 `topic-page-style`、`taste-skill` 或 `redesign-skill`
- **AND** 系统 SHALL NOT 把 `brainstorming` 或 `soft-skill` 作为 page-builder 默认 turn-level 竞争面的一部分一并提升

#### Scenario: confirmed apply turn 只提升 apply owner
- **WHEN** 系统为一次 confirmed CMS apply turn 构建最终 prompt
- **THEN** 系统 SHALL 提升 `cms-binding-apply` 作为 bootstrapped owner
- **AND** 系统 SHALL NOT 并列提升 `page-builder-guided-generation` 作为另一套 owner

#### Scenario: 其他非竞争型 skills 可以保留但不进入默认主控竞争面
- **WHEN** page-builder 工作区中还存在其他非竞争型、手动启用或仅供显式调用的 skills
- **THEN** 系统 MAY 继续保留这些 skills 在工作区中
- **AND** 系统 SHALL NOT 默认把它们提升为当前 page-builder turn 的平级 controller 候选

#### Scenario: prompt 与 skill 文案统一使用 canonical worker 名称
- **WHEN** page-builder prompt notices、skill 文档或 runtime skill 引用需要指向 visual worker
- **THEN** 系统 SHALL 使用 `topic-page-style`、`taste-skill` 与 `redesign-skill` 这些 canonical runtime 名称
- **AND** 系统 SHALL 将 `topic-page-style` 作为默认首轮专题页视觉执行 worker
- **AND** 系统 SHALL NOT 继续以 `design-taste-frontend` 或 `redesign-existing-projects` 作为当前默认调用名
