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
系统 SHALL 让 `page-builder-guided-generation` 持续掌握普通用户侧的需求收集、关键澄清、最终确认和覆盖确认，而不得把这些步骤转交给其他元流程 skill。

#### Scenario: 用户侧 briefing 不转交给其他元流程 skill
- **WHEN** 系统仍在收集需求、澄清关键歧义、请求最终确认或请求整页覆盖确认
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 完成这些用户侧步骤
- **AND** 系统 SHALL NOT 将这些步骤转交给 `brainstorming` 或其他元流程 skill

#### Scenario: 下游 skill 仅在确认后参与生产执行
- **WHEN** 页面简报已经确认完毕，系统准备开始生成或提质页面
- **THEN** 系统 MAY 调用下游生产型 skill
- **AND** 系统 SHALL NOT 让下游 skill 重新接管普通用户侧的需求收集与确认流程

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

### Requirement: 引导式专题页生成必须以单页专题页为默认目标并显式驱动设计 skill
系统 SHALL 在用户确认专题页简报后，以单页专题页作为默认生成目标，并 SHALL 显式驱动现有设计 skill 来完成页面生成与必要提质。

#### Scenario: 确认后使用 design-taste-frontend 生成单页专题页
- **WHEN** 用户已确认专题页简报，且当前为空白页面或已完成覆盖确认
- **THEN** 系统 SHALL 显式使用 `design-taste-frontend`
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

#### Scenario: 需要额外提质时使用 redesign-existing-projects
- **WHEN** 系统决定在首版页面基础上追加一轮提质
- **THEN** 系统 SHALL 显式使用 `redesign-existing-projects`
- **AND** 系统 SHALL 保持已确认的单页专题页目标与主要内容不变

### Requirement: 页面生成后后续请求必须进入轻量迭代模式
系统 SHALL 在专题页已经生成后，将后续普通修改请求视为对当前预览页的轻量迭代，而不是重新发起完整的需求收集流程。

#### Scenario: 已有页面时对局部修改直接迭代
- **WHEN** 当前预览页已存在生成结果，且用户提出颜色、内容顺序、区块增减或风格微调等后续修改
- **THEN** 系统 SHALL 直接基于当前预览页继续修改
- **AND** 系统 SHALL NOT 重新发起完整需求收集流程

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
