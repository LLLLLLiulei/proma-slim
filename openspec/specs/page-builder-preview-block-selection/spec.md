## Purpose
定义 `page-builder` Builder 页中预览工具栏区块选择入口、预览区块 hover/selected 高亮、iframe 选区桥接与下一条消息一次性选区上下文注入的行为边界。
## Requirements
### Requirement: Builder 预览工具栏必须提供区块选择入口
系统 SHALL 在 `page-builder` Builder 页左侧预览工具栏中提供区块选择入口，使用户可以直接在预览上下文内进入、退出和取消页面区块选择模式，而不需要再到右侧对话输入区查找该入口。

#### Scenario: 预览工具栏显示唯一的可见区块选择入口
- **WHEN** 用户进入 Builder 页且左侧预览工具栏完成渲染
- **THEN** 系统 SHALL 在 `PC / Mobile` 预览模式控制附近显示一个区块选择入口
- **AND** 系统 SHALL 不再在右侧对话输入区显示一个重复的可见区块选择主入口

#### Scenario: 点击入口后进入页面区块选择模式
- **WHEN** Builder 页处于默认状态，且用户点击预览工具栏中的区块选择入口
- **THEN** 系统 SHALL 使当前 Builder 页进入页面区块选择模式
- **AND** 系统 SHALL 让左侧预览准备接收页面区块 hover 与 click 选择操作
- **AND** 系统 SHALL 使该入口显示为已激活状态

#### Scenario: 选中区块后入口继续展示选中态
- **WHEN** 用户已通过预览工具栏入口进入页面区块选择模式并成功选中某个区块
- **THEN** 系统 SHALL 保持该入口处于激活状态
- **AND** 系统 SHALL 保留当前选中的区块供后续区块工具条和下一条消息使用

#### Scenario: 再次点击激活入口时退出选区并清空当前目标
- **WHEN** 区块选择入口当前处于已激活状态，且用户再次点击该入口
- **THEN** 系统 SHALL 退出页面区块选择模式
- **AND** 系统 SHALL 清除当前 hover 高亮、选中高亮与已选 `selector`
- **AND** 系统 SHALL 使页面恢复为不可选择状态

#### Scenario: Agent 处理中入口不可切换
- **WHEN** 当前 Builder 会话中的 agent 正在处理用户请求
- **THEN** 系统 SHALL 禁用预览工具栏中的区块选择入口
- **AND** 系统 SHALL 不允许用户在该阶段切换区块选择模式

#### Scenario: 单次选择仅保留一个当前目标
- **WHEN** 用户在同一轮发送前先后选择了多个页面区块
- **THEN** 系统 SHALL 仅保留最近一次选择的区块作为当前目标
- **AND** 系统 SHALL 不同时维护多个已选区块

### Requirement: 预览区必须在选区模式下提供 hover 与选中高亮
系统 SHALL 在 Builder 页左侧预览中，仅于页面区块选择模式启用时提供页面选择目标的 hover 高亮与 click 选中高亮，使用户能够明确感知当前将要修改的目标区域；当预览页面包含 CMS rendering islands 时，桥接层 MUST 等待 islands 首次挂载完成后的稳定 DOM，再启动相关观察与选区同步；当当前已选目标是普通静态区块且其中存在受支持的文本热点时，系统 MUST 允许后续围绕该已选区块开展内联文字编辑；当当前命中的是 CMS island 渲染区域时，系统 MUST 将该 CMS island 作为不可下钻的整体选择单元。

#### Scenario: hover 到可选区块时显示预高亮
- **WHEN** 用户已进入页面区块选择模式，且鼠标移动到预览中的某个可选区块上
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

#### Scenario: 已选区块内点击受支持文本热点时保持当前选区
- **WHEN** 用户已经选中某个预览区块，且单击该区块内某个受支持的文本热点
- **THEN** 系统 SHALL 保持当前已选区块的 `selector` 不变
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

#### Scenario: 内联文字编辑不伪造用户消息
- **WHEN** 用户在当前已选区块内进行预览文字内联编辑但尚未发送新的聊天消息
- **THEN** 系统 SHALL 不向消息列表注入伪造的用户消息
- **AND** 系统 SHALL 保留该已选区块继续作为下一条消息的隐藏上下文候选

#### Scenario: 发送成功后自动清除当前选区
- **WHEN** 一条带有已选区块上下文的消息发送成功
- **THEN** 系统 SHALL 清除当前页面区块选择状态与高亮
- **AND** 系统 SHALL 使该选区不再继续作用于后续下一条以上的消息

#### Scenario: 发送失败时保留当前选区以便重试
- **WHEN** 一条带有已选区块上下文的消息发送失败
- **THEN** 系统 SHALL 保留当前已选区块及其高亮状态
- **AND** 系统 SHALL 允许用户在不重新选区的情况下重试发送

### Requirement: 预览刷新或重载后必须使当前选区失效
系统 SHALL 在预览刷新、重载或重建后立即使当前页面区块选择状态失效，并清除相关 hover 与选中高亮，而不尝试恢复之前的选中结果；若当前存在活动中的内联文字编辑，则系统 MUST 一并结束该编辑态。对于不需要触发完整预览重载的成功内联文字保存，系统 MAY 保留当前选区和区块编辑作用域。

#### Scenario: 手动刷新预览后清除选区
- **WHEN** 用户在 Builder 页手动刷新左侧预览
- **THEN** 系统 SHALL 清除当前页面区块选择状态、hover 高亮和选中高亮

#### Scenario: 预览因内容更新而重载后不恢复高亮
- **WHEN** 左侧预览因 `workspace-files` 内容变化而自动重载
- **THEN** 系统 SHALL 不尝试恢复重载前的 `selector`、hover 高亮或选中高亮

#### Scenario: 退出选区模式时清除高亮
- **WHEN** 当前页面区块选择模式被关闭或失效
- **THEN** 系统 SHALL 清除预览中的 hover 高亮和选中高亮

#### Scenario: 真正的预览重载会结束活动中的内联编辑
- **WHEN** 当前存在活动中的预览文字内联编辑，且系统执行了真实的预览刷新、重载或重建
- **THEN** 系统 SHALL 结束当前内联编辑态
- **AND** 系统 SHALL 不继续把该编辑态保留到新的预览文档实例中

#### Scenario: 成功保存内联文字且无需完整重载时保留当前选区
- **WHEN** 用户完成一次预览文字内联保存且系统无需执行完整 iframe 重载
- **THEN** 系统 SHALL 保留当前已选区块及其高亮状态
- **AND** 系统 SHALL 允许用户继续在该区块内编辑其他受支持的文本热点

### Requirement: 已选区块必须定义区块内内联文字编辑作用域
系统 SHALL 将当前已选区块同时作为预览内联文字编辑的作用域，使区块内文字编辑只在当前目标区块中启用，并在选区切换时随之更新。

#### Scenario: 仅当前已选区块内允许内联文字编辑
- **WHEN** 用户已在 Builder 预览中选中某个区块
- **THEN** 系统 SHALL 仅在该已选区块内启用后续内联文字编辑能力
- **AND** 系统 SHALL 不在未选中的其他区块内同时启用相同编辑作用域

#### Scenario: 切换选中区块后编辑作用域跟随更新
- **WHEN** 用户重新选中另一个预览区块
- **THEN** 系统 SHALL 将内联文字编辑作用域切换到最新选中的区块
- **AND** 系统 SHALL 不继续让上一轮已选区块保留活动中的编辑作用域

### Requirement: CMS island 的隐藏选区上下文必须保留稳定 runtime locator identity
系统 SHALL 在为已选 `cms-island` 注入下一条消息的隐藏选区上下文时，保留稳定 runtime locator identity 与兼容 selector 信息，使后续链路能够围绕同一个源 CMS 标签工作，而不是仅保留渲染态命中的结构位置。

#### Scenario: runtime locator 被写入 CMS island 隐藏上下文
- **WHEN** 用户已选中某个 `cms-island`
- **THEN** 系统 SHALL 在隐藏上下文中的 `targetSelection` 保留该目标的 `htmlPath`、源 CMS 标签 selector、所属 `parentBlockSelector`、组件类型和 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 要求该上下文继续携带作者态 `sourceId`

#### Scenario: 旧页面缺少 `sourceId` 时仍保留 CMS island 语义
- **WHEN** 用户已选中某个来自旧页面的 `cms-island`，其源 CMS 标签作者态源码中没有 `sourceId`
- **THEN** 系统 SHALL 继续传递 `kind: cms-island`
- **AND** 系统 SHALL 继续传递 `htmlPath`、源 CMS 标签 selector、所属 `parentBlockSelector` 与 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 因作者态 `sourceId` 缺失而将该目标退化为普通 block 目标

### Requirement: CMS island 的下一条消息上下文必须显式声明 source-first 写入限制
系统 SHALL 在为已选 `cms-island` 构造下一条消息的隐藏上下文时，显式声明 source-first 写入限制，使普通选区消息链路与受控 CMS 自动 apply 链路在目标边界上保持一致。

#### Scenario: 隐藏上下文声明不得写入渲染子节点或其他 block
- **WHEN** 系统为一次已选 `cms-island` 的普通消息准备隐藏上下文
- **THEN** 系统 SHALL 明确声明后续修改必须整体更新该源 CMS 标签
- **AND** 系统 SHALL 明确声明不得直接把渲染态子节点当作独立源码目标写回
- **AND** 系统 SHALL 明确声明不得修改 sibling block 或在旁边追加新的 `cms-*` 组件

#### Scenario: 隐藏上下文声明不得向 CMS slot 注入危险标签
- **WHEN** 系统为一次已选 `cms-island` 的普通消息准备隐藏上下文
- **THEN** 系统 SHALL 明确声明不得在 `cms-catalog` / `cms-content` 的 slot 中写入 `<script>` 或 `<style>`

### Requirement: 选区消息发送后不得保留隐藏 follow-up target context
系统 SHALL 在一条携带 `targetSelection` 的消息发送成功后清除当前可见选区与高亮，并 SHALL NOT 在宿主侧继续保留一个隐藏的 follow-up target context。后续普通消息如果仍需附着 `targetSelection`，必须来自新的显式选区或其他结构化工作流状态，而不能来自宿主对自由文本 continuation 的猜测。

#### Scenario: 选区消息发送成功后清除可见选区且不保留隐藏 target
- **WHEN** 一条携带 `targetSelection` 的消息发送成功
- **THEN** 系统 SHALL 清除当前可见页面区块选择状态与高亮
- **AND** 系统 SHALL NOT 为该任务保留隐藏的 active follow-up target context

#### Scenario: 未重新选区的后续消息不得自动复用旧 target
- **WHEN** 用户已经完成一次带 `targetSelection` 的发送，随后未重新选区就继续发送普通消息
- **THEN** 系统 SHALL NOT 在该次发送的隐藏上下文中继续附着上一条消息的 `targetSelection`
- **AND** 系统 SHALL 将该次发送视为无显式 target 的 ordinary message，除非存在其他结构化 workflow state 明确要求不同处理

#### Scenario: 新 selection 才能带来新的 targetSelection
- **WHEN** 用户重新选择了新的预览目标
- **THEN** 系统 SHALL 在下一次发送中附着这个新的显式 `targetSelection`
- **AND** 系统 SHALL NOT 再继续复用之前发送过的旧目标

#### Scenario: 宿主不得通过自由文本重建旧 target
- **WHEN** 用户发送“继续”“再改一下”“把整个页面重做一版”或其他任意自然语言消息，但当前没有显式选区也没有专用 workflow state
- **THEN** 系统 SHALL NOT 仅凭这些自由文本内容去恢复、延续、清空或改写旧的 `targetSelection`

### Requirement: 当前已选目标必须在右侧对话输入区提供可见提示
系统 SHALL 在 `page-builder` Builder 页右侧对话输入框上方为当前已选目标提供高亮可见提示，作为隐藏 `targetSelection` 上下文的补充反馈；该提示 SHALL 反映当前有效选区的最新目标标识，并 SHALL NOT 被写入消息列表正文或伪造成新的用户消息。

#### Scenario: 选中普通 block 后显示预览可见标签
- **WHEN** 用户在 Builder 预览中选中一个普通静态 block
- **THEN** 系统 SHALL 在右侧对话输入框上方显示与预览选中框一致的标签文案
- **AND** 系统 SHALL NOT 默认展示该 block 的原始 `selector`
- **AND** 该提示 SHALL 表示当前消息将围绕这个 block 工作

#### Scenario: 选中 CMS island 后显示预览可见标签
- **WHEN** 用户在 Builder 预览中选中一个 `cms-island`
- **THEN** 系统 SHALL 在右侧对话输入框上方显示与预览选中框一致的组件标签文案
- **AND** 系统 SHALL NOT 默认展示该目标的 `sourceSelector`、`parentBlockSelector` 或 `htmlPath`
- **AND** 系统 SHALL NOT 使用其他英文固定前缀标签如 `Target`

#### Scenario: 用户可以从 notice 直接取消当前选中
- **WHEN** 右侧对话输入框上方已经显示当前已选目标提示
- **AND** 用户点击提示末尾的取消图标
- **THEN** 系统 SHALL 清除当前有效选区
- **AND** 系统 SHALL 隐藏该提示
- **AND** 系统 SHALL 不再把刚才的目标继续作为下一条消息的活动目标

#### Scenario: 切换选中目标后提示更新为最新目标
- **WHEN** 用户在同一轮发送前重新选择了另一个 block 或 `cms-island`
- **THEN** 系统 SHALL 将右侧对话输入框上方的提示更新为最新选中的预览标签文案
- **AND** 系统 SHALL NOT 同时展示多个目标提示

#### Scenario: 当前选区失效后隐藏提示
- **WHEN** 当前已选目标因为取消选区、发送成功、预览重载、预览刷新或其他选区失效原因被清除
- **THEN** 系统 SHALL 隐藏右侧对话输入框上方的当前目标提示
- **AND** 系统 SHALL 不再把该提示继续显示为活动目标

#### Scenario: 发送失败保留选区时继续保留提示
- **WHEN** 一条携带已选目标上下文的消息发送失败，且系统仍保留当前选区以便重试
- **THEN** 系统 SHALL 继续显示右侧对话输入框上方的当前目标提示
- **AND** 该提示 SHALL 继续与保留中的当前选区一致

#### Scenario: 可见提示不写入消息列表
- **WHEN** 系统在右侧对话输入区展示当前已选目标提示
- **THEN** 系统 SHALL NOT 为此在消息列表中追加新的系统消息、用户消息或占位消息
- **AND** 系统 SHALL 继续保持用户消息正文只反映用户实际输入的文本
