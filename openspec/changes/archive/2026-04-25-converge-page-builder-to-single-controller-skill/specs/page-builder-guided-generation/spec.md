## MODIFIED Requirements

### Requirement: 引导式专题页生成必须保持主控 skill 对用户侧问答的所有权
系统 SHALL 让 `page-builder-guided-generation` 持续掌握 ordinary page-builder flow 的用户侧需求收集、关键澄清、最终确认，以及 create / iterate / repair / redo / selected-block follow-up 等普通页面控制权；这些 ordinary 场景不得转交给 `brainstorming` 或其他元流程 skill。下游 specialist skills 只可在该主控 skill 判断后参与 consult 或生产执行，而不得接管普通用户侧问答。

#### Scenario: 用户侧 briefing 不转交给其他元流程 skill
- **WHEN** 系统仍在收集需求、澄清关键歧义、请求最终确认或请求整页覆盖确认
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 完成这些用户侧步骤
- **AND** 系统 SHALL NOT 将这些步骤转交给 `brainstorming` 或其他元流程 skill

#### Scenario: ordinary repair、redo 与 selected-block follow-up 仍由主控 skill 承接
- **WHEN** 当前页面已存在结果，且用户提出“修一下这块”“继续改刚才选中的区块”“把这一屏重做一版但保持当前任务”或同类 ordinary follow-up
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 承接该次用户侧控制
- **AND** 系统 SHALL NOT 因该请求属于 repair、redo 或 follow-up 就升级为 `brainstorming`

#### Scenario: 下游 skill 仅在主控决策后参与 consult 或生产执行
- **WHEN** 页面简报已经确认完毕，或当前 ordinary iteration 已经明确需要额外的视觉生成、提质或 CMS guidance consult
- **THEN** `page-builder-guided-generation` MAY 调用下游 specialist skill
- **AND** 系统 SHALL NOT 让下游 skill 重新接管普通用户侧的澄清与确认流程

### Requirement: 引导式专题页生成必须以单页专题页为默认目标并显式驱动设计 skill
系统 SHALL 在用户确认专题页简报后，以单页专题页作为默认生成目标，并 SHALL 显式驱动 canonical visual worker skills 来完成页面生成与必要提质；首版生成默认使用 `taste-skill`，而对已有页面或已有 block 的明显改版、升级或精修默认使用 `redesign-skill`。

#### Scenario: 确认后使用 taste-skill 生成单页专题页
- **WHEN** 用户已确认专题页简报，且当前为空白页面或已完成覆盖确认
- **THEN** 系统 SHALL 显式使用 `taste-skill`
- **AND** 系统 SHALL 将输出写入 `workspace-files/index.html` 及其关联预览资源
- **AND** 系统 SHALL 以单页专题页作为默认页面结构，而不是多页面站点

#### Scenario: 强事实缺失时使用草稿占位而非编造真实信息
- **WHEN** 页面结构需要展示时间、价格、电话、数据等强事实信息，但用户尚未提供这些内容
- **THEN** 系统 SHALL NOT 编造看似最终可用的真实信息
- **AND** 系统 SHALL 使用明确标注的草稿占位或待确认文案，或者在不破坏整体结构的前提下暂不展示该内容

#### Scenario: 单页导航默认使用页内锚点结构
- **WHEN** 系统为专题页生成导航栏目
- **THEN** 系统 SHALL 默认生成指向当前单页不同区块的导航结构
- **AND** 系统 SHALL NOT 默认扩展为多页面路由跳转

#### Scenario: 需要额外提质或明显改版时使用 redesign-skill
- **WHEN** 系统决定在已有页面或已有 block 基础上追加一轮明显改版、升级或精修
- **THEN** 系统 SHALL 显式使用 `redesign-skill`
- **AND** 系统 SHALL 保持已确认的单页专题页目标与主要内容不变

### Requirement: `page-builder-guided-generation` MUST delegate existing CMS region literacy to dedicated guidance
系统 SHALL 让 `page-builder-guided-generation` 在 ordinary page-builder flow 中继续承担用户侧控制与高层 CMS 边界，但在命中已有 `cms-catalog` / `cms-content` / `cms-island` target 时，系统 MUST 让它先 consult 当前 target 的 digest 与 `page-builder-cms-region-authoring-guidance`，再决定具体 authoring；该 guidance 是 consult-only specialist，不接管当前 turn 的 owner。任何会改变 binding identity 的诉求 MUST 升级回正式 CMS 选择与 confirmed apply 链路，而不得由 ordinary controller 直接修改绑定查询属性。

#### Scenario: 命中已有 CMS 区域时主控 skill 先 consult guidance 再修改
- **WHEN** ordinary page-builder flow 中的当前目标已经是一个已有 `cms-catalog`、`cms-content` 或 `cms-island`
- **THEN** `page-builder-guided-generation` SHALL 先依据宿主提供的 target digest 与 `page-builder-cms-region-authoring-guidance` 理解该区域
- **AND** 系统 SHALL 将该已有 CMS source tag 视为 source-atomic 的作者态边界
- **AND** 系统 SHALL NOT 把该 guidance 直接升格为当前 turn 的并列 owner

#### Scenario: 已有 CMS 区域的样式与 slot 迭代仍停留在 ordinary controller 下
- **WHEN** 用户要修改的是已有 CMS 区域的布局、样式、slot 结构、呈现方式或兼容 shell，而不是数据来源本身
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 保持该次 ordinary turn 的控制权
- **AND** 系统 SHALL 让相关 CMS authoring 细节由 consult-only guidance 提供
- **AND** 系统 SHALL NOT 直接绕过 guidance 凭经验改写 `cms-*`

#### Scenario: 绑定身份变更需求升级回正式 CMS 选择与 apply
- **WHEN** 用户在 ordinary flow 中要求更换栏目、重新选择 CMS 内容、改变 `site-id`、`catalog-id`、`ids`、`page-size`、`take` 或等价 binding identity
- **THEN** 系统 SHALL 将该请求升级回正式 CMS 选择流程与 confirmed apply 链路
- **AND** 系统 SHALL NOT 由 `page-builder-guided-generation` 直接修改已有 `cms-*` 的绑定查询属性
