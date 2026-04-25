## MODIFIED Requirements

### Requirement: Builder 普通对话发送必须默认延续引导式专题页生成流程
系统 SHALL 在 `page-builder` 的 Builder 普通用户发送路径中，把 `page-builder-guided-generation` 作为唯一默认 ordinary controller；除 confirmed CMS apply 之外，首轮创建、普通迭代、repair、redo、selected-block follow-up，以及围绕已选 `cms-island` 的普通样式/slot 迭代，都 SHALL 先由该主控 skill 承接。系统 MAY 在同一轮额外 surfacing consult-only specialist guidance 或 target digest，但 SHALL NOT 把这些 guidance 升级为 ordinary flow 的并列 owner，也 SHALL NOT 要求用户手动输入 skill 调用指令。

#### Scenario: 用户在 builder 中发送普通消息时只默认注入单一主控 skill
- **WHEN** 用户在 `page-builder` 的 Builder 对话区提交一条普通页面创建、普通迭代、普通修复或普通 redo 消息
- **THEN** 系统 SHALL 在该次发送中显式装载 `page-builder-guided-generation`
- **AND** 系统 SHALL NOT 再额外追加另一个 ordinary controller skill
- **AND** 系统 SHALL NOT 要求用户手动输入 skill 调用指令

#### Scenario: 已选 CMS island 的普通 follow-up 仍保持单一主控
- **WHEN** 当前 Builder 发送已经带有已选 `cms-island` 或已有 CMS target context，但本轮诉求只是布局、样式、slot 内结构、文案呈现或同类 ordinary 迭代
- **THEN** 系统 SHALL 继续在该次发送中显式装载 `page-builder-guided-generation`
- **AND** 系统 MAY 额外 surfacing 该 target 的 CMS digest 或 consult-only guidance
- **AND** 系统 SHALL NOT 因命中已有 CMS target 就把 ordinary owner 切换成其他 skill

#### Scenario: 已确认 CMS apply 的程序化发送不被默认主控覆盖
- **WHEN** 某次 Builder 发送已经由宿主 workflow 写入 confirmed CMS selection、目标上下文和 apply 边界，并显式进入 `cms-binding-apply`
- **THEN** 系统 SHALL 保留该次发送原有的 `cms-binding-apply`
- **AND** 系统 SHALL NOT 再额外追加默认 `page-builder-guided-generation`
- **AND** 系统 SHALL NOT 把该次发送回退成 ordinary page flow
