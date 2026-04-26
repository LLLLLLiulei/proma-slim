## Purpose
定义普通用户在 `page-builder` 中从一句模糊网页需求出发，经由主控 skill 引导完成澄清、确认、单页专题页生成与后续轻量迭代的行为约束。

## Requirements

### Requirement: 引导式专题页生成必须通过 AskUserQuestion 动态收集关键需求
系统 SHALL 通过 `AskUserQuestion` 动态收集专题页生成所需的关键信息，而不是依赖固定问卷或长篇自由追问。

#### Scenario: 缺少关键页面信息时一次只问一个问题
- **WHEN** 当前专题页简报仍缺少会明显影响页面结构、内容编排或视觉方向的关键信息
- **THEN** 系统 SHALL 发起一个且仅一个 `AskUserQuestion`
- **AND** 该问题 SHALL 优先聚焦当前最关键的信息缺口
- **AND** 该问题 SHALL 提供 2 到 4 个选项以及自定义回答入口

#### Scenario: 多值信息使用多选模式
- **WHEN** 系统需要收集导航栏目、必备内容块或其他天然多值的信息
- **THEN** 系统 SHALL 使用 `AskUserQuestion` 的多选模式
- **AND** 系统 SHALL NOT 将单一决策问题错误建模为多选问题

#### Scenario: 面向普通用户的提问保持易懂并按需保留必要术语
- **WHEN** 系统向用户询问设备优先级、页面开头呈现方式或视觉感受等问题
- **THEN** 系统 SHALL 使用普通用户易懂的表达
- **AND** 系统 MAY 保留少量必要的网页相关术语
- **AND** 系统 SHALL 在保留术语时补充简短解释
- **AND** 系统 SHALL NOT 要求用户具备专业网页设计或前端开发知识

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

### Requirement: 引导式专题页生成必须仅在关键歧义上做短澄清
系统 SHALL 仅在剩余歧义会阻断稳定成稿时继续发起澄清，并 SHALL 将澄清范围限制为当前最小必要决策；其中页面目标、目标人群与主要内容块 MUST 作为优先补齐的必问项，整体感觉、设备侧重、必须保留或避免的内容以及当前页面应继续迭代还是整页重做 SHALL 只在仍未明确且会明显影响结果时作为条件必问项补齐。

#### Scenario: 缺少必问项时一次只问一个最高优先级问题
- **WHEN** 当前页面简报仍缺少页面目标、目标人群或主要内容块中的任一必问项
- **THEN** 系统 SHALL 发起一个且仅一个聚焦最高优先级缺口的 `AskUserQuestion`
- **AND** 系统 SHALL NOT 在同一轮中同时追问多个不相关问题

#### Scenario: 条件项可安全默认时不继续追问
- **WHEN** 必问项已经明确，而剩余未定信息仅属于整体感觉、设备重点、必须保留或避免的内容或整页重做判断中的条件项，且这些信息可以安全使用合理默认值
- **THEN** 系统 SHALL 停止继续发起额外澄清问题
- **AND** 系统 SHALL 使用合理默认值推进到确认阶段

### Requirement: 引导式专题页生成必须在达到可稳定成稿阈值后进行最终确认
系统 SHALL 在页面目标、目标人群和主要内容块已经明确，且整体感觉、设备侧重、必须保留或避免的内容以及当前页面应继续迭代还是整页重做这些条件项也已经明确或可合理默认时，先汇总简报再请求用户确认，而不得直接开始写页面。

#### Scenario: 必问项明确且条件项已明确或可默认时先输出摘要再确认
- **WHEN** 页面生成所需的必问项已经明确，且剩余条件项已经明确或可合理默认
- **THEN** 系统 SHALL 先输出一段面向用户的简报摘要
- **AND** 系统 SHALL 随后通过 `AskUserQuestion` 请求最终确认
- **AND** 系统 SHALL NOT 在未确认前开始正式写入页面文件

#### Scenario: 用户要求由系统自行补足次要细节
- **WHEN** 用户明确表达“你帮我决定”或同等含义，且当前仅剩非关键缺口
- **THEN** 系统 SHALL 以合理默认值补足这些细节
- **AND** 系统 SHALL 仍然先向用户展示确认摘要后再开始生成

### Requirement: 非空预览页整页重做前必须再次确认覆盖
系统 SHALL 在当前预览页已经存在非平凡内容且用户意图为整页重做时，先要求用户确认覆盖，再允许整页改写。

#### Scenario: 非空页面整页重做前要求确认覆盖
- **WHEN** `workspace-files/index.html` 已存在非平凡页面内容，且用户明确要求“重新做一版”“全部重来”或同等整页重做意图
- **THEN** 系统 SHALL 通过 `AskUserQuestion` 请求覆盖确认
- **AND** 系统 SHALL NOT 在确认前直接整页重写当前预览文件

#### Scenario: 用户拒绝覆盖时保留当前页面
- **WHEN** 系统已请求整页覆盖确认且用户未同意覆盖
- **THEN** 系统 SHALL 保留当前预览页
- **AND** 系统 SHALL NOT 执行整页改写

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

### Requirement: 引导式专题页生成必须将新 CMS 绑定意图路由到受控 CMS 选择与 apply 流程
系统 SHALL 将新建或重绑 `cms-catalog` / `cms-content` 视为普通引导式专题页生成链路之外的受控操作；当用户表达 CMS 绑定意图但尚未完成正式 CMS 选择时，`page-builder-guided-generation` MUST 保持在普通页面引导边界内，而不得直接生成新的 `cms-*` 标签。

#### Scenario: 仅表达 CMS 绑定意图但尚未选择数据时不直接生成 `cms-*`
- **WHEN** 用户在普通专题页引导过程中表达“这个区块要接 CMS 数据”或同类意图，但当前不存在已确认的 CMS 选择结果
- **THEN** 系统 SHALL NOT 直接生成新的 `cms-catalog` 或 `cms-content`
- **AND** 系统 SHALL 将该请求导向正式 CMS 选择流程，而不是在普通引导链路中继续猜测 authoring 写法

#### Scenario: 已确认 CMS 选择后的 apply 不再由 guided-generation 持有
- **WHEN** 某次 Builder 发送已经携带已确认 CMS 选择结果并显式进入 `cms-binding-apply`
- **THEN** 系统 SHALL NOT 继续由 `page-builder-guided-generation` 承接该次 CMS apply 决策
- **AND** 系统 SHALL 让专用 CMS apply flow 接管后续执行

### Requirement: 引导式专题页生成在处理已有 CMS 标签时必须遵守 canonical CMS authoring contract
系统 SHALL 仅在当前页面中已经存在 `cms-catalog` / `cms-content` 的前提下，让 `page-builder-guided-generation` 调整这些已有 CMS 区域的 slot 模板、内部结构或样式；在该路径中，系统 SHALL 将已有 CMS source tag 视为 source-atomic 的 authoring 边界，并遵守 canonical CMS authoring contract，而不得继续依赖过时示例、自由猜测 props 或把普通迭代静默升级为新的 CMS 绑定或重绑。

#### Scenario: 调整已有 CMS 区块时只使用 contract 中存在的 props 与字段
- **WHEN** 引导式专题页生成链路需要调整页面中已有的 `cms-catalog` 或 `cms-content` 区块
- **THEN** 系统 SHALL 仅使用 canonical contract 中存在的 props、slot scope 与字段
- **AND** 系统 SHALL 使用符合 Vue template 语法的 slot 模板结构
- **AND** 系统 SHALL NOT 引入 `item.link`、`item.url` 或其他未实现字段

#### Scenario: 调整已有 CMS source tag 时按 source-atomic 边界整体处理
- **WHEN** 当前选中的目标实际对应一个已经存在的 `cms-catalog` 或 `cms-content` source tag，或其预览渲染结果
- **THEN** 系统 SHALL 将该已有 CMS source tag 作为一个整体 authoring 单元处理
- **AND** 系统 SHALL NOT 逐个改写其渲染出来的子节点
- **AND** 系统 SHALL NOT 越过当前 CMS 区域去修改 sibling block 或 sibling CMS tag

#### Scenario: 普通迭代不得静默改写绑定属性或追加新的 CMS 标签
- **WHEN** 页面中已经存在 `cms-catalog` 或 `cms-content`，且当前任务只是普通引导式迭代
- **THEN** 系统 MAY 调整该已有 CMS 区域的 slot 模板、内部结构和样式
- **AND** 系统 SHALL NOT 静默改写 `site-id`、`catalog-id`、`ids`、`page-size` 或其他绑定查询属性
- **AND** 系统 SHALL NOT 在该普通迭代路径中追加新的 `cms-*` 标签

#### Scenario: 缺少稳定 authoring 依据时不猜测 CMS 写法
- **WHEN** 引导式专题页生成链路缺少编写或改写某个已有 CMS 区块所需的关键 authoring 信息
- **THEN** 系统 SHALL 发起短澄清或停止该 CMS 改写路径
- **AND** 系统 SHALL NOT 仅凭猜测写出新的 `cms-*` props 组合或非法模板结构

### Requirement: 引导式专题页生成使用的默认 CMS guidance 必须只引用当前 contract
系统 SHALL 让 `page-builder-guided-generation` 依赖的默认 CMS guidance 保持为最小必要边界说明，并且只引用当前 canonical contract；这些默认 guidance SHALL 用于约束普通迭代中的已有 CMS 区域，而不得继续把 superseded 的 CMS 文档、完整 apply checklist 或专用 CMS apply skill 细节当作普通默认参考。

#### Scenario: 默认 guidance 只保留当前 contract 与普通迭代边界
- **WHEN** 引导式专题页生成链路为模型加载默认 CMS guidance
- **THEN** 这些 guidance SHALL 只引用当前 canonical contract 与“普通迭代不得新建或重绑 `cms-*`”这类边界
- **AND** 系统 SHALL NOT 在普通默认 guidance 中重复整套 `cms-binding-apply` 的 apply checklist

#### Scenario: 默认 guidance 不再引用 superseded 的 CMS 示例
- **WHEN** 引导式专题页生成链路为模型加载默认 CMS guidance
- **THEN** 这些 guidance SHALL 只引用当前 canonical contract 对应的写法
- **AND** 系统 SHALL NOT 继续把已归档或标记为 superseded 的 CMS 文档作为默认引用内容

### Requirement: 引导式专题页生成必须保持普通页面作者态为 HTML-first
系统 SHALL 让 `page-builder-guided-generation` 在普通页面生成与普通页面迭代场景中保持作者态页面为 HTML-first：除当前已存在的 `cms-catalog` / `cms-content` source tag 内部 slot authoring 外，普通页面区域 MUST 使用普通 HTML/CSS/JS，而 MUST NOT 被升级成整页 Vue authoring。

#### Scenario: 普通页面创建或迭代时不自行引入 Vue runtime
- **WHEN** `page-builder-guided-generation` 在普通专题页创建、普通局部修改或普通风格迭代场景中生成或改写页面
- **THEN** 系统 SHALL NOT 让其为 CMS 渲染自行引入 Vue runtime、Vue CDN、Vue importmap 或作者态 bootstrap 脚本
- **AND** 系统 SHALL NOT 让其通过 `createApp`、`Vue.createApp` 或 page-wide `mount` 把整页改造成单一 Vue app

#### Scenario: 调整已有 CMS 区域时只在当前 source tag 内使用 Vue authoring
- **WHEN** `page-builder-guided-generation` 需要调整页面中某个已有的 `cms-catalog` 或 `cms-content` 区域
- **THEN** 系统 MAY 在该当前 CMS source tag 的 slot templates 中继续使用符合 contract 的 Vue template 语法
- **AND** 系统 SHALL NOT 在该 CMS source tag 外部的普通页面区域新增 `v-*`、`@*`、`:` 绑定或 `{{ ... }}` 这类 Vue authoring
- **AND** 系统 SHALL NOT 把 surrounding shell 或 sibling block 改造成新的 Vue root

#### Scenario: 普通页面动态表达诉求不通过非 CMS Vue authoring 实现
- **WHEN** 用户在普通页面 flow 中希望某个非 CMS 区块“看起来更动态”或“像列表一样变化”
- **THEN** 系统 SHALL 优先通过普通 HTML/CSS/JS 结构、草稿内容或受控 CMS flow 满足该诉求
- **AND** 系统 SHALL NOT 在非 CMS 区块上写入 `v-for`、`v-if`、`@click` 或 `{{ ... }}` 来模拟整页 Vue 行为

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

### Requirement: `page-builder-guided-generation` MUST keep its ordinary CMS section boundary-level and lightweight
系统 SHALL 让 `page-builder-guided-generation` 中与 CMS 相关的主文案只保留 ordinary flow 需要长期稳定生效的高层边界，而不得继续在该 skill 内堆叠完整的组件级字段表、confirmed apply checklist 或大段 component-specific 示例。

#### Scenario: 主控 skill 的 CMS 规则只保留 ordinary flow 高层边界
- **WHEN** 系统维护 `page-builder-guided-generation` 的主文案
- **THEN** 其中与 CMS 相关的内容 SHALL 只保留“不要 invent 新 `cms-*`”“不要整页引 Vue”“命中已有 CMS 区域先 consult guidance”“ordinary flow 不绕过 confirmed apply”这类高层边界
- **AND** 该主文案 SHALL NOT 继续内嵌完整的 component-specific props/field tables 或 confirmed apply 执行清单

#### Scenario: ordinary CMS 改写信息不足时不由主控 skill 猜测细节
- **WHEN** `page-builder-guided-generation` 在 ordinary flow 中缺少安全修改已有 CMS 区域所需的稳定 authoring 依据
- **THEN** 系统 SHALL 让其改为依赖专用 guidance、最小必要澄清或停止 CMS 改写路径
- **AND** 该主控 skill SHALL NOT 单独凭经验猜测字段、props 或模板结构

### Requirement: 引导式专题页生成在页面问题排查中必须按需升级到真实预览诊断
系统 SHALL 让 `page-builder-guided-generation` 在 ordinary repair、ordinary iteration、selected-block follow-up 与重复反馈场景中，先基于当前预览源码和上下文做静态排查；当静态证据仍不足以稳定解释页面问题，或用户在修复后再次反馈页面仍然存在样式、布局、渲染或交互问题时，系统 MUST 在当前 turn 已提供 Playwright MCP 与稳定浏览器预览地址的前提下，升级为真实预览诊断后再继续修复。

#### Scenario: 静态证据已足够时不提前升级到 Playwright
- **WHEN** 当前 ordinary 页面问题能够仅凭 `workspace-files`、当前选择上下文与已有运行时信息被稳定解释
- **THEN** 系统 SHALL 继续先执行静态排查与修复
- **AND** 系统 SHALL NOT 因为用户提到“有问题”就默认先调用 Playwright

#### Scenario: 静态排查无法稳定解释页面问题时升级到真实预览诊断
- **WHEN** 当前 ordinary 页面问题在静态排查后仍无法被稳定解释，且当前 turn 已提供 Playwright MCP 与稳定浏览器预览地址
- **THEN** 系统 SHALL 调用 Playwright MCP 检查真实预览结果后再继续修复
- **AND** 系统 SHALL 保持 `page-builder-guided-generation` 作为该次请求的 owner

#### Scenario: 用户再次反馈页面仍有问题时升级到真实预览诊断
- **WHEN** 系统已对某个 ordinary 页面问题执行过一次修复，但用户在后续 turn 中再次反馈页面仍然存在样式、布局、渲染或交互问题
- **THEN** 系统 SHALL 将该反馈视为升级到真实预览诊断的强信号
- **AND** 在当前 turn 已提供 Playwright MCP 与稳定浏览器预览地址时，系统 SHALL 调用 Playwright MCP 检查真实预览结果后再继续修复

#### Scenario: 使用完 Playwright 后主动关闭浏览器诊断会话
- **WHEN** 系统已经通过 Playwright MCP 获取了完成当前页面问题诊断所需的真实预览证据
- **THEN** 系统 SHALL 在继续后续修复或结束当前回合前主动关闭当前 Playwright 页面、标签或浏览器诊断会话
- **AND** 系统 SHALL NOT 让该次诊断用的 Playwright 资源持续悬挂

#### Scenario: 缺少稳定浏览器入口时不猜测 URL 或安装浏览器运行时
- **WHEN** 当前 ordinary 页面问题需要浏览器级排查，但当前 turn 未提供稳定浏览器预览地址或未提供可用的 Playwright MCP
- **THEN** 系统 SHALL NOT 猜测浏览器访问 URL
- **AND** 系统 SHALL NOT 回退到 `file://` 工作区文件路径或尝试自行安装浏览器运行时
