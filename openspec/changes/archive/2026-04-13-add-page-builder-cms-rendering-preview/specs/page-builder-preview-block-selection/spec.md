## MODIFIED Requirements

### Requirement: 预览区必须在选区模式下提供 hover 与选中高亮
系统 SHALL 在 Builder 页左侧预览中，仅于页面区块选择模式启用时提供页面区块 hover 高亮与 click 选中高亮，使用户能够明确感知当前将要修改的目标区域；当预览页面包含 CMS rendering islands 时，桥接层 MUST 等待 islands 首次挂载完成后的稳定 DOM，再启动相关观察与选区同步。

#### Scenario: hover 到可选区块时显示预高亮
- **WHEN** 用户已进入页面区块选择模式，且鼠标移动到预览中的某个可选区块上
- **THEN** 系统 SHALL 在预览中为该区块显示 hover 高亮边框
- **AND** 系统 SHALL 使用直角边框而不是圆角描边
- **AND** 系统 SHALL 在高亮框左上角展示当前区块名称标签

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

#### Scenario: 点击区块后显示选中高亮
- **WHEN** 用户已进入页面区块选择模式，且在预览中点击某个可选区块
- **THEN** 系统 SHALL 在预览中为该区块显示持续的选中高亮边框
- **AND** 系统 SHALL 将该区块解析为可供后续消息使用的 `selector`
- **AND** 系统 SHALL 在选中高亮左上角继续展示该区块名称标签

#### Scenario: 已选区块内点击受支持文本热点时保持当前选区
- **WHEN** 用户已经选中某个预览区块，且单击该区块内某个受支持的文本热点
- **THEN** 系统 SHALL 保持当前已选区块的 `selector` 不变
- **AND** 系统 SHALL 不把当前选区替换为更内层的文本热点节点
- **AND** 系统 SHALL 允许后续围绕当前已选区块继续进行内联文字编辑

#### Scenario: 未进入选区模式时不触发区块高亮选择
- **WHEN** 用户未处于页面区块选择模式
- **THEN** 系统 SHALL 不因普通鼠标移动或点击而触发页面区块 hover 高亮或选中高亮
