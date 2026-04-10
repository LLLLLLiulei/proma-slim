# page-builder-inline-text-editing Specification

## Purpose
定义 `page-builder` 预览中的内联文字编辑能力，包括已选区块内的可编辑文本热点、点击进入编辑、失焦自动保存，以及基于 `selector` 与 `textTargetDescriptor` 的安全回写约定。
## Requirements
### Requirement: 已选区块内必须只暴露可安全回写的简单文本热点
系统 SHALL 仅在当前已选区块内暴露可内联编辑的简单文本热点，并且这些热点必须能够稳定映射回 `workspace-files/index.html` 中的静态 HTML 文本内容。

#### Scenario: 已选区块内暴露多个简单文本热点
- **WHEN** 用户已在 Builder 预览中选中某个区块，且该区块内包含多个可稳定回写的简单文本宿主元素
- **THEN** 系统 SHALL 允许这些简单文本热点分别进入内联编辑
- **AND** 系统 SHALL 不要求用户只编辑单一“主文案”热点

#### Scenario: 未选中区块时不提供内联文字编辑
- **WHEN** 当前 Builder 预览中不存在已选中的区块
- **THEN** 系统 SHALL 不允许用户直接进入预览文字内联编辑
- **AND** 系统 SHALL 要求用户先建立当前目标区块

#### Scenario: 无法稳定回写的文本不进入编辑态
- **WHEN** 用户点击当前已选区块内某段文本，但该文本无法稳定映射回 `workspace-files/index.html` 的简单文本目标
- **THEN** 系统 SHALL 不进入该文本的内联编辑态
- **AND** 系统 SHALL 不把该文本视为受支持的编辑热点

### Requirement: 单击文本热点必须进入就地编辑并优先拦截原点击行为
系统 SHALL 在当前已选区块内通过单击进入文本热点的就地编辑态，并在热点位于链接或按钮文案中时优先拦截其原始点击行为。

#### Scenario: 单击简单文本热点进入编辑态
- **WHEN** 用户单击当前已选区块内某个受支持的简单文本热点
- **THEN** 系统 SHALL 使该热点进入就地编辑态
- **AND** 系统 SHALL 仅让该热点对应的文本宿主进入可编辑状态，而不是让整个区块进入可编辑状态

#### Scenario: 单击链接文字或按钮文案时优先编辑
- **WHEN** 用户单击当前已选区块内某个受支持的链接文字或按钮文案热点
- **THEN** 系统 SHALL 优先进入该热点的就地编辑态
- **AND** 系统 SHALL 不继续执行该链接跳转、按钮提交或其他默认点击行为

#### Scenario: 同一时刻仅允许一个活动编辑热点
- **WHEN** 当前已经存在一个活动中的文本热点编辑态，且用户尝试激活另一个受支持文本热点
- **THEN** 系统 SHALL 先结束当前活动编辑态
- **AND** 系统 SHALL 不同时保留多个文本热点处于可编辑状态

### Requirement: 文本热点失焦后必须自动保存到 workspace-files
系统 SHALL 在文本热点失去焦点后自动保存其内容，将变更写回当前工作区的 `workspace-files/index.html`，并使预览与持久化内容保持一致。

#### Scenario: 失焦后保存修改过的文本
- **WHEN** 用户修改了活动文本热点的内容并使其失去焦点
- **THEN** 系统 SHALL 自动发起保存
- **AND** 系统 SHALL 将更新后的文本写回当前工作区的 `workspace-files/index.html`

#### Scenario: 保存成功后保留当前区块编辑作用域
- **WHEN** 用户完成一次文本热点保存且保存成功
- **THEN** 系统 SHALL 结束当前热点的编辑态
- **AND** 系统 SHALL 继续保留当前已选区块作为后续文本热点编辑的作用域
- **AND** 系统 SHALL 不要求用户为了继续编辑同一区块内其他受支持文本而重新选中该区块

#### Scenario: 保存失败时不伪造成功状态
- **WHEN** 文本热点失焦后触发的保存失败
- **THEN** 系统 SHALL 向用户展示保存失败反馈
- **AND** 系统 SHALL 保持 `workspace-files/index.html` 中的已持久化内容不变
- **AND** 系统 SHALL 不将本次失败的编辑显示为已成功保存

### Requirement: 保存请求必须使用可判定的文本目标描述符
系统 SHALL 通过区块 `selector` 与可判定的 `textTargetDescriptor` 来标识当前保存目标，而不是仅依赖块级 `selector` 或纯文本内容反查。

#### Scenario: 保存请求包含区块选择器与文本目标描述符
- **WHEN** 系统为某个文本热点发起保存请求
- **THEN** 系统 SHALL 在保存请求中包含当前区块的 `selector`
- **AND** 系统 SHALL 在保存请求中包含能在该区块内唯一定位热点的 `textTargetDescriptor`

#### Scenario: 文本目标描述符无法解析时拒绝写入
- **WHEN** 主进程收到某次文本保存请求，但无法根据 `selector` 与 `textTargetDescriptor` 解析出唯一保存目标
- **THEN** 系统 SHALL 拒绝本次文件写入
- **AND** 系统 SHALL 向调用方返回失败结果，而不是写入不确定的文本目标
