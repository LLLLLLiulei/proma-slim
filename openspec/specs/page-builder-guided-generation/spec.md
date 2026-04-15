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
系统 SHALL 仅在剩余歧义会阻断稳定成稿时继续发起澄清，并 SHALL 将澄清范围限制为当前最小必要决策。

#### Scenario: 存在阻断性歧义时发起短澄清
- **WHEN** 当前用户输入存在一个会明显影响页面结构、主视觉方向或核心内容排序的关键歧义
- **THEN** 系统 SHALL 发起一个聚焦该歧义的 `AskUserQuestion`
- **AND** 系统 SHALL NOT 在同一轮中同时追问多个不相关问题

#### Scenario: 仅剩非关键缺口时不继续追问
- **WHEN** 当前仅剩不会阻断页面成稿的次要缺口
- **THEN** 系统 SHALL 停止继续发起额外澄清问题
- **AND** 系统 SHALL 使用合理默认值推进到确认阶段

### Requirement: 引导式专题页生成必须在达到可稳定成稿阈值后进行最终确认
系统 SHALL 在页面用途、目标人群、主要内容、整体感觉、设备侧重以及必须保留或避免的内容已经明确或可合理默认时，先汇总简报再请求用户确认，而不得直接开始写页面。

#### Scenario: 达到可稳定成稿阈值时先输出摘要再确认
- **WHEN** 页面生成所需的关键维度已经明确或可合理默认
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

### Requirement: 引导式专题页生成在产出 CMS 区块时必须优先使用 slot 内承载完整动态区域的组织方式
系统 SHALL 在 `page-builder-guided-generation` 产出 CMS 相关 HTML 时，优先使用 `cms-catalog` / `cms-content` 作为动态区域源码根节点的组织方式，并 SHALL 将与该 CMS 数据直接相关的主要 HTML 壳子尽量写入 `default / empty / error` slot 中。

#### Scenario: 生成 CMS 导航区块时将主要导航容器放入 `cms-catalog` slot
- **WHEN** 引导式专题页生成链路决定创建一个 CMS 驱动的导航、栏目入口或栏目列表区块
- **THEN** 系统 SHALL 优先生成以 `cms-catalog` 作为动态区域源码根节点的结构
- **AND** 系统 SHALL 将 `ul`、`nav`、`li` 等与该导航数据直接相关的主要 HTML 结构写入 slot，而不是把主要导航容器留在组件外部

#### Scenario: 生成 CMS 内容列表区块时将主要列表容器放入 `cms-content` slot
- **WHEN** 引导式专题页生成链路决定创建一个 CMS 驱动的内容列表、卡片列表或图文列表区块
- **THEN** 系统 SHALL 优先生成以 `cms-content` 作为动态区域源码根节点的结构
- **AND** 系统 SHALL 将 `section`、`article`、`div.grid`、empty / error fallback 等与该内容数据直接相关的结构写入 slot

#### Scenario: 页面级静态外壳可保留在外，但主要动态容器不得默认外置
- **WHEN** 某个 CMS 区块同时需要页面级静态外层布局壳子
- **THEN** 系统 MAY 保留与 CMS 数据无直接关系的页面级静态壳子在组件外部
- **AND** 系统 SHALL NOT 默认生成“主要动态容器在组件外、slot 内只剩条目级节点”的结构
