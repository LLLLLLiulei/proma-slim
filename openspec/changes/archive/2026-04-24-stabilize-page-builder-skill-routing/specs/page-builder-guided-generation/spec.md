## MODIFIED Requirements

### Requirement: 引导式专题页生成必须保持主控 skill 对用户侧问答的所有权
系统 SHALL 让 `page-builder-guided-generation` 持续掌握 ordinary page-builder flow 与 `existing-cms-region-ordinary-edit` scene 的用户侧需求收集、关键澄清、最终确认，以及 create / iterate / repair / redo / selected-block follow-up 等控制权；这些 ordinary 场景不得转交给 `brainstorming` 或其他元流程 skill。下游 consult-only 与 execute-only skills 仅可在该主控 skill 判定后参与，而不得接管普通用户侧问答。

#### Scenario: 用户侧 briefing 不转交给其他元流程 skill
- **WHEN** 系统仍在收集需求、澄清关键歧义、请求最终确认或请求整页覆盖确认
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 完成这些用户侧步骤
- **AND** 系统 SHALL NOT 将这些步骤转交给 `brainstorming` 或其他元流程 skill

#### Scenario: ordinary repair 与 selected-block follow-up 仍由主控 skill 承接
- **WHEN** 当前页面已存在结果，且用户提出“修一下这块”“继续改刚才选中的区块”“把这一屏重做一版但保持整体任务”或同类 ordinary follow-up
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 承接该次用户侧控制
- **AND** 系统 SHALL NOT 因该请求属于 repair、redo 或 follow-up 就升级为 `brainstorming`

#### Scenario: 显式 existing CMS target ordinary edit 仍由主控 skill 承接
- **WHEN** 当前 follow-up turn 已明确命中一个已有 `cms-island` 或 source CMS tag target，且任务是在该 target 内做 ordinary CMS authoring
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 保持该次请求的 owner
- **AND** 系统 SHALL 在进入编辑前 consult `page-builder-cms-region-authoring-guidance`

#### Scenario: 下游 skill 仅在主控决策后参与生产执行
- **WHEN** 页面简报已经确认完毕，或当前 ordinary iteration 已经明确需要高质量生成、改版、提质或 CMS 组件级约束理解
- **THEN** `page-builder-guided-generation` MAY 调用下游 consult-only 或 execute-only skill
- **AND** 系统 SHALL NOT 让下游 skill 重新接管普通用户侧的澄清与确认流程

### Requirement: 引导式专题页生成必须按任务阶段显式驱动 canonical visual workers
系统 SHALL 在用户确认专题页简报后，以单页专题页作为默认生成目标，并 SHALL 按任务阶段显式驱动 canonical visual worker skills 来完成页面生成与必要提质；`taste-skill` 负责首轮视觉执行，包括首版整页生成与首轮 block 级明显视觉重设计，`redesign-skill` 只负责已有结果基础上的第二阶段提质、升级或精修。

#### Scenario: 确认后使用 taste-skill 生成单页专题页
- **WHEN** 用户已确认专题页简报，且当前为空白页面或已完成覆盖确认
- **THEN** 系统 SHALL 显式使用 `taste-skill`
- **AND** 系统 SHALL 将输出写入 `workspace-files/index.html` 及其关联预览资源
- **AND** 系统 SHALL 以单页专题页作为默认页面结构，而不是多页面站点

#### Scenario: 首轮 block 级明显视觉重设计使用 taste-skill
- **WHEN** 当前页面或当前已选 block 需要进入第一轮明显视觉重设计，而不是在已有设计方向上做二次提质
- **THEN** 系统 SHALL 显式使用 `taste-skill`
- **AND** 系统 SHALL NOT 仅因目标是局部 block 就默认切换到 `redesign-skill`

#### Scenario: 强事实缺失时使用草稿占位而非编造真实信息
- **WHEN** 页面结构需要展示时间、价格、电话、数据等强事实信息，但用户尚未提供这些内容
- **THEN** 系统 SHALL NOT 编造看似最终可用的真实信息
- **AND** 系统 SHALL 使用明确标注的草稿占位或待确认文案，或者在不破坏整体结构的前提下暂不展示该内容

#### Scenario: 单页导航默认使用页内锚点结构
- **WHEN** 系统为专题页生成导航栏目
- **THEN** 系统 SHALL 默认生成指向当前单页不同区块的导航结构
- **AND** 系统 SHALL NOT 默认扩展为多页面路由跳转

#### Scenario: 需要第二阶段提质或升级时使用 redesign-skill
- **WHEN** 系统决定在已有页面或已有 block 基础上追加一轮提质、升级或精修，而当前已有设计方向应被保留
- **THEN** 系统 SHALL 显式使用 `redesign-skill`
- **AND** 系统 SHALL 保持已确认的单页专题页目标与主要内容不变

### Requirement: 页面生成后后续请求必须进入轻量迭代模式
系统 SHALL 在专题页已经生成后，将后续 ordinary 修改请求视为对当前预览页的轻量迭代，并继续由 `page-builder-guided-generation` 统一承接；其中局部修改、repair、selected-block follow-up、局部 redo 与 explicit existing CMS region ordinary edit MUST 继续停留在该 owner 的迭代路径中。只有明确整页重做、confirmed CMS apply，或宿主明确发起新的 owner handoff 时，系统才 SHALL 离开该当前 owner 路径。

#### Scenario: 已有页面时对局部修改直接迭代
- **WHEN** 当前预览页已存在生成结果，且用户提出颜色、内容顺序、区块增减或风格微调等后续修改
- **THEN** 系统 SHALL 直接基于当前预览页继续修改
- **AND** 系统 SHALL NOT 重新发起完整需求收集流程

#### Scenario: 已有页面的 repair 或局部 redo 继续留在 ordinary iteration
- **WHEN** 当前预览页已存在生成结果，且用户提出修复布局、替换当前区块样式、重做某个已选 block 或同类局部 redo
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 在当前页面上迭代
- **AND** 系统 SHALL NOT 重新发起完整需求收集流程

#### Scenario: 显式 existing CMS target ordinary edit 继续由当前 owner 承接
- **WHEN** 当前 follow-up turn 已明确命中一个已有 `cms-island` 或 source CMS tag target，且任务是在该 target 内做 ordinary CMS authoring
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 承接该次请求
- **AND** 系统 SHALL 先 consult `page-builder-cms-region-authoring-guidance`
- **AND** 系统 SHALL NOT 将 owner 切换到 `page-builder-cms-region-authoring-guidance`

#### Scenario: 明确要求重做时回到覆盖确认与引导生成链路
- **WHEN** 当前预览页已存在生成结果，且用户明确要求整页重做
- **THEN** 系统 SHALL 回到整页覆盖确认与引导生成链路
- **AND** 系统 SHALL NOT 将该请求误判为普通局部修改

### Requirement: `page-builder-guided-generation` MUST consult existing CMS region guidance while retaining owner control
系统 SHALL 让 `page-builder-guided-generation` 在 ordinary page-builder flow 中保留高层 CMS 边界与 current turn owner 权限；当宿主已经识别出明确的 existing `cms-catalog`、`cms-content` 或 `cms-island` target 且任务仍属于 ordinary authoring 时，系统 MUST 向该 owner 提供专用的 `page-builder-cms-region-authoring-guidance` 与 target digest 作为 consult-only guidance，而不是继续由主控边读边猜。若用户实际想改变 binding identity，`page-builder-guided-generation` MUST 请求宿主升级回 confirmed CMS browser / handoff / decision / apply 流程，而不是直接修改已有 `cms-*` 的 query props。

#### Scenario: 页面含 CMS 但本轮未命中具体 target 时仅保留高层边界
- **WHEN** 当前页面已经包含 `cms-catalog` 或 `cms-content`，但本轮 ordinary 请求未明确命中某个具体已有 CMS target
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 承接该 ordinary 请求
- **AND** 系统 SHALL 只向其提供高层 CMS 边界，而不是额外赋予组件级 guidance digest

#### Scenario: 显式 existing CMS target turn 先 consult 再执行
- **WHEN** 宿主已识别当前 ordinary 请求明确命中一个已有 `cms-island` 或 source CMS tag target
- **THEN** 系统 SHALL 继续让 `page-builder-guided-generation` 作为该次请求的唯一 owner
- **AND** 系统 SHALL 提供 `page-builder-cms-region-authoring-guidance` 与当前目标 digest 供其先 consult 再执行

#### Scenario: binding identity 变更升级回 confirmed CMS apply
- **WHEN** 用户提出更换栏目、重新选择 CMS 内容、改变 `site-id`、`catalog-id`、`ids`、`page-size`、`take` 或等价 binding identity 的请求
- **THEN** `page-builder-guided-generation` SHALL 请求宿主升级回 confirmed CMS browser / handoff / decision / apply 流程
- **AND** 系统 SHALL NOT 继续由 ordinary owner 或 consult-only guidance 直接修改已有 `cms-*` 的 query props
