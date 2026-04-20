## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: 引导式专题页生成必须仅在关键歧义上做短澄清
系统 SHALL 仅在剩余歧义会阻断稳定成稿时继续发起澄清，并 SHALL 将澄清范围限制为当前最小必要决策；其中页面目标、目标受众与主要内容块 MUST 作为优先补齐的必问项，风格方向、设备重点、必须保留或避免的内容以及是否整页重做 SHALL 只在仍未明确且会明显影响结果时作为条件必问项补齐。

#### Scenario: 缺少必问项时一次只问一个最高优先级问题
- **WHEN** 当前页面简报仍缺少页面目标、目标受众或主要内容块中的任一必问项
- **THEN** 系统 SHALL 发起一个且仅一个聚焦最高优先级缺口的 `AskUserQuestion`
- **AND** 系统 SHALL NOT 在同一轮中同时追问多个不相关问题

#### Scenario: 条件项可安全默认时不继续追问
- **WHEN** 必问项已经明确，而剩余未定信息仅属于风格方向、设备重点、必须保留或避免的内容或整页重做判断中的条件项，且这些信息可以安全使用合理默认值
- **THEN** 系统 SHALL 停止继续发起额外澄清问题
- **AND** 系统 SHALL 使用合理默认值推进到确认阶段

### Requirement: 引导式专题页生成必须在达到可稳定成稿阈值后进行最终确认
系统 SHALL 在页面目标、目标受众和主要内容块已经明确，且风格方向、设备侧重、必须保留或避免的内容以及当前页面应继续迭代还是整页重做这些条件项也已经明确或可合理默认时，先汇总简报再请求用户确认，而不得直接开始写页面。

#### Scenario: 必问项明确且条件项已明确或可默认时先输出摘要再确认
- **WHEN** 页面生成所需的必问项已经明确，且剩余条件项已经明确或可合理默认
- **THEN** 系统 SHALL 先输出一段面向用户的简报摘要
- **AND** 系统 SHALL 随后通过 `AskUserQuestion` 请求最终确认
- **AND** 系统 SHALL NOT 在未确认前开始正式写入页面文件

#### Scenario: 用户要求由系统自行补足次要细节
- **WHEN** 用户明确表达“你帮我决定”或同等含义，且当前仅剩非关键条件项
- **THEN** 系统 SHALL 以合理默认值补足这些细节
- **AND** 系统 SHALL 仍然先向用户展示确认摘要后再开始生成

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

## REMOVED Requirements

### Requirement: 引导式专题页生成在产出 CMS 区块时必须优先使用 slot 内承载完整动态区域的组织方式
**Reason**: 新建或重绑 `cms-catalog` / `cms-content` 已收敛到“CMS 选择确认 -> 自动 handoff -> `cms-binding-apply` -> `mcp__cms__apply_cms_binding`”这条受控链路，普通专题页引导 flow 不再承担新的 CMS authoring 输出。

**Migration**: 当页面需要新增 CMS 驱动区块或把当前区块重绑到 CMS 数据时，先完成正式 CMS 选择，再由专用 CMS apply flow 负责生成或改写 `cms-*` 标签。
