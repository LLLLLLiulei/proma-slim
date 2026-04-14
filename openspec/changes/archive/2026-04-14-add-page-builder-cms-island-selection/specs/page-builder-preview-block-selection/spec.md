## RENAMED Requirements

- FROM: `### Requirement: 已选区块必须仅作为下一条消息的隐藏上下文参与发送`
- TO: `### Requirement: 已选目标必须仅作为下一条消息的隐藏上下文参与发送`

## MODIFIED Requirements

### Requirement: 预览区必须在选区模式下提供 hover 与选中高亮
系统 SHALL 在 Builder 页左侧预览中，仅于页面区块选择模式启用时提供页面选择目标的 hover 高亮与 click 选中高亮，使用户能够明确感知当前将要修改的目标区域；当预览页面包含 CMS rendering islands 时，桥接层 MUST 等待 islands 首次挂载完成后的稳定 DOM，再启动相关观察与选区同步；当当前已选目标是普通静态区块且其中存在受支持的文本热点时，系统 MUST 允许后续围绕该已选区块开展内联文字编辑；当当前命中的是 CMS island 渲染区域时，系统 MUST 将该 CMS island 作为不可下钻的整体选择单元。

#### Scenario: hover 到可选静态区块时显示预高亮
- **WHEN** 用户已进入页面区块选择模式，且鼠标移动到预览中的某个可选静态区块上
- **THEN** 系统 SHALL 在预览中为该区块显示 hover 高亮边框
- **AND** 系统 SHALL 使用直角边框而不是圆角描边
- **AND** 系统 SHALL 在高亮框左上角展示当前区块名称标签

#### Scenario: hover 到 CMS island 渲染区域时显示整块虚线框
- **WHEN** 用户已进入页面区块选择模式，且鼠标移动到某个 `cms-catalog` 或 `cms-content` 渲染结果中的任意子节点上
- **THEN** 系统 SHALL 将整个 CMS island 作为当前 hover 目标
- **AND** 系统 SHALL 使用整块虚线边框高亮该 CMS island 的渲染区域
- **AND** 系统 SHALL 在高亮框右上角展示真实组件名称标签
- **AND** 系统 SHALL NOT 将同一 parent block 内的静态兄弟节点自动并入该 CMS island 高亮范围

#### Scenario: 非 CMS 页面通过外部桥接资源立即启用选区能力
- **WHEN** 系统为 `template: 'page-builder'` 的 HTML 预览响应启用区块选择能力，且该页面不包含 CMS rendering islands
- **THEN** 系统 SHALL 通过运行时注入的外部桥接脚本资源加载该能力
- **AND** bridge SHALL 在页面就绪后立即初始化选区观察
- **AND** 系统 SHALL 不直接改写用户工作区中的原始网页文件内容

#### Scenario: CMS rendering 页面在 islands ready 后启用选区能力
- **WHEN** 系统为 `template: 'page-builder'` 的 HTML 预览响应启用区块选择能力，且该页面包含 CMS rendering islands
- **THEN** 系统 SHALL 通过运行时注入的外部桥接脚本资源加载该能力
- **AND** bridge SHALL 在收到 `proma:cms-rendering-ready` 前不启动选区观察或就绪通告
- **AND** 系统 SHALL 不直接改写用户工作区中的原始网页文件内容

#### Scenario: 点击静态区块后显示选中高亮
- **WHEN** 用户已进入页面区块选择模式，且在预览中点击某个可选静态区块
- **THEN** 系统 SHALL 在预览中为该区块显示持续的选中高亮边框
- **AND** 系统 SHALL 将该区块解析为可供后续消息使用的选择目标
- **AND** 系统 SHALL 在选中高亮左上角继续展示该区块名称标签

#### Scenario: 点击 CMS 渲染子节点后选中整个 CMS island
- **WHEN** 用户已进入页面区块选择模式，且在预览中点击某个 CMS island 渲染结果中的任意子节点
- **THEN** 系统 SHALL 将整个 CMS island 解析为单一选择目标
- **AND** 系统 SHALL 为该 CMS island 显示持续的整块虚线选中高亮
- **AND** 系统 SHALL 在选中高亮右上角展示该 CMS island 的组件名称标签
- **AND** 系统 SHALL 解析出该 CMS island 对应的源 CMS 标签选择器，而不是将当前点击的渲染子节点作为后续写入目标

#### Scenario: 已选静态区块内点击受支持文本热点时保持当前选区
- **WHEN** 用户已经选中某个普通静态预览区块，且单击该区块内某个受支持的文本热点
- **THEN** 系统 SHALL 保持当前已选区块的选择目标不变
- **AND** 系统 SHALL 不把当前选区替换为更内层的文本热点节点
- **AND** 系统 SHALL 允许后续围绕当前已选区块继续进行内联文字编辑

#### Scenario: 已选 CMS island 内点击渲染子节点时不得下钻
- **WHEN** 用户已经选中某个 CMS island，且再次点击该 CMS island 渲染结果中的任意子节点
- **THEN** 系统 SHALL 保持当前已选 CMS island 目标不变
- **AND** 系统 SHALL NOT 将该次点击解析为更内层的独立选择目标
- **AND** 系统 SHALL NOT 因该次点击进入内联文字编辑

#### Scenario: 未进入选区模式时不触发区块高亮选择
- **WHEN** 用户未处于页面区块选择模式
- **THEN** 系统 SHALL 不因普通鼠标移动或点击而触发页面区块 hover 高亮或选中高亮

### Requirement: 已选目标必须仅作为下一条消息的隐藏上下文参与发送
系统 SHALL 将当前已选目标统一序列化为结构化 `targetSelection`，并将其作为下一条用户消息的隐藏上下文主入口；对于普通静态区块，系统 MUST 传递 `targetSelection.kind: block`、对应源选择器和 `editBoundary: block`，并 MAY 继续提供 `targetBlock` 作为兼容上下文；对于 `cms-island`，该隐藏上下文 MUST 显式包含目标类型、源 CMS 标签选择器、所属 block 上下文、组件名称以及 `editBoundary: source-atomic` 所表达的整体组件边界说明；系统 SHALL 不改写用户在消息列表中可见的正文内容。

#### Scenario: 发送消息时注入静态区块的隐藏上下文
- **WHEN** 用户已选中某个普通页面区块并发送下一条消息
- **THEN** 系统 SHALL 在隐藏上下文中传递 `targetSelection.kind: block`
- **AND** 系统 SHALL 传递该 block 的源选择器与 `editBoundary: block`
- **AND** 系统 MAY 同时传递 `targetBlock.selector` 作为兼容上下文
- **AND** 系统 SHALL 保持消息列表中用户可见正文仍为用户原始输入文本

#### Scenario: 发送消息时注入 CMS island 的结构化边界信息
- **WHEN** 用户已选中某个 CMS island 并发送下一条消息
- **THEN** 系统 SHALL 在隐藏上下文中明确声明 `kind: cms-island`
- **AND** 系统 SHALL 传递该 CMS island 的源 CMS 标签选择器、所属 `parentBlockSelector` 与组件名称
- **AND** 系统 SHALL 传递 `editBoundary: source-atomic`
- **AND** 系统 SHALL 明确告知该目标对应预览中的 CMS 渲染结果，而源码中必须整体更新该 CMS 标签边界
- **AND** 系统 SHALL NOT 仅传递某个渲染子节点的普通 DOM 选择器

#### Scenario: 隐藏上下文不包含额外页面片段
- **WHEN** 系统为带选区的消息准备发送上下文
- **THEN** 系统 SHALL 不额外注入完整 HTML 片段、渲染后的 CMS 列表项片段、截图或其他未被用户确认的页面结构化负载

#### Scenario: 发送成功后自动清除当前选区
- **WHEN** 一条带有已选目标上下文的消息发送成功
- **THEN** 系统 SHALL 清除当前页面区块选择状态与高亮
- **AND** 系统 SHALL 使该选区不再继续作用于后续下一条以上的消息

#### Scenario: 发送失败时保留当前选区以便重试
- **WHEN** 一条带有已选目标上下文的消息发送失败
- **THEN** 系统 SHALL 保留当前已选目标及其高亮状态
- **AND** 系统 SHALL 允许用户在不重新选区的情况下重试发送
