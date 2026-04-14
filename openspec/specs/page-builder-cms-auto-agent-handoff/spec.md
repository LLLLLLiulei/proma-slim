## Purpose

定义 `page-builder` 中 CMS 选择确认后的自动 Agent handoff 行为，约束当前 Builder 会话如何自动发起一轮专用决策消息、如何注入统一结构化 payload 与 skill，以及 busy / 失败场景下如何保持用户现场。

## Requirements

### Requirement: CMS 确认选择后必须自动发起当前 Builder 会话的 Agent 回合
系统 SHALL 在用户于 `page-builder` 的 CMS 选择器中确认一次有效选择后，自动发起一轮新的 Agent 消息，并 SHALL 复用当前 Builder 正在使用的会话，而不得要求用户再手动补发一条消息。

#### Scenario: 确认选择后自动触发 handoff
- **WHEN** 用户在当前 Builder 页中确认一个有效的 `PageBuilderCmsSelectionResult`
- **THEN** 系统 SHALL 自动开始一次新的 Agent 发送
- **AND** 系统 SHALL 不要求用户再通过右侧 composer 手动点击发送

#### Scenario: 自动 handoff 复用当前 Builder 会话
- **WHEN** 系统为一次 CMS 确认结果发起自动 handoff
- **THEN** 系统 SHALL 复用当前 Builder 的 `sessionId` 与 `workspaceId`
- **AND** 系统 SHALL NOT 为该次 handoff 创建新的 Agent 会话或独立对话线程

### Requirement: CMS 自动 handoff 必须组装统一的 `PageBuilderCmsApplySkillInput`
系统 SHALL 在发起 CMS 自动 handoff 前，将确认结果组装为统一的 `PageBuilderCmsApplySkillInput`，并 SHALL 为第一阶段填入稳定的默认运行边界，而不得将关键字段留给模型自行从自由文本中反推；该输入 MUST 以 `targetSelection` 作为规范化目标入口，并 SHALL 在需要时保留 `targetBlock` 作为 parent block 上下文。

#### Scenario: handoff 输入使用 selection-scoped Phase 1A 默认值
- **WHEN** 系统为一次 CMS 确认结果构建 handoff 输入
- **THEN** 系统 SHALL 生成新的 contract `version`
- **AND** 系统 SHALL 生成 `entryPoint: 'cms-browser-confirm'`
- **AND** 系统 SHALL 生成 `applyIntent: 'replace-current'`
- **AND** 系统 SHALL 生成 `workspacePolicy.scope: 'target-selection-only'`
- **AND** 系统 SHALL 生成 `workspacePolicy.allowPageRewrite: false`
- **AND** 系统 SHALL 生成 `workspacePolicy.allowCrossBlockMutation: false`
- **AND** 系统 SHALL 生成 `workspacePolicy.outputTarget: 'workspace-files/index.html'`
- **AND** 系统 SHALL 保留原始 `selection`
- **AND** 系统 SHALL 保留 `targetSelection`

#### Scenario: CMS island handoff 输入显式声明 source-atomic 边界
- **WHEN** 系统为某个 `cms-island` 目标构建 handoff 输入
- **THEN** 系统 SHALL 在输入中保留该 `cms-island` 的源 CMS 标签选择器、所属 `parentBlockSelector` 与组件类型
- **AND** 系统 SHALL 在 `targetSelection` 中保留 `editBoundary: source-atomic`
- **AND** 系统 SHALL 明确声明该目标的编辑边界为整体 CMS 组件
- **AND** 系统 SHALL NOT 将预览中命中的渲染子节点选择器当作 handoff 的唯一事实目标

#### Scenario: 缺少稳定提示时不伪造可选字段
- **WHEN** 系统在 handoff 时没有稳定来源可判断 `blockTypeHint`、`blockLabel` 或 `snapshotAvailable`
- **THEN** 系统 SHALL 允许这些字段缺失
- **AND** 系统 SHALL NOT 仅依据 `selector` 字符串伪造这些字段

### Requirement: CMS 自动 handoff 必须分离可见消息、隐藏结构化 payload 与强制 skill 注入
系统 SHALL 将自动 handoff 的可见时间线文本、隐藏运行时 payload 与 skill 装载指令分离处理，以保证用户可读性与运行时稳定性同时成立；当目标是 `cms-island` 时，隐藏 payload MUST 显式表达该目标的 source-atomic 组件语义。

#### Scenario: 自动 handoff 写入短可见消息并携带隐藏 payload
- **WHEN** 系统发起一次 CMS 自动 handoff
- **THEN** 系统 SHALL 向当前会话写入一条简短的用户可见触发消息
- **AND** 系统 SHALL 通过 `composedUserMessage` 传递机器可读的结构化 handoff payload
- **AND** 系统 SHALL NOT 仅依赖用户可见消息中的自然语言来表达完整输入

#### Scenario: CMS island handoff payload 显式声明整体更新规则
- **WHEN** 系统为某个 `cms-island` 目标发送自动 handoff 消息
- **THEN** `composedUserMessage` 中的结构化 payload SHALL 显式声明该目标对应源 CMS 标签边界
- **AND** payload SHALL 显式包含 `targetSelection.editBoundary: source-atomic`
- **AND** payload SHALL 明确要求后续 agent 以整体组件级别更新该目标
- **AND** payload SHALL NOT 将渲染子节点描述为可独立写回的静态源码目标

#### Scenario: 自动 handoff 显式强制注入 `cms-binding-apply`
- **WHEN** 系统发送 CMS 自动 handoff 消息
- **THEN** 系统 SHALL 通过 `mentionedSkills` 显式指定 `cms-binding-apply`
- **AND** 系统 SHALL NOT 仅依赖用户可见消息中的 `/skill:cms-binding-apply` 文本来触发 skill 装载

### Requirement: CMS 自动 handoff 不得消费当前 composer 草稿或待发送附件
系统 SHALL 将 CMS 自动 handoff 视为独立的 programmatic send，而不得把它当作一次普通的 composer 提交，从而破坏用户当前正在编辑的草稿或待发送附件。

#### Scenario: 自动 handoff 保留当前草稿与附件
- **WHEN** 用户确认 CMS 选择时，右侧 composer 中已经存在未发送草稿或待发送附件
- **THEN** 系统 SHALL 仅发送本次自动 handoff 的短触发消息
- **AND** 系统 SHALL 保留当前 composer 草稿文本
- **AND** 系统 SHALL 保留当前待发送附件

#### Scenario: 自动 handoff 仍在当前时间线中可见
- **WHEN** 系统开始一次 CMS 自动 handoff
- **THEN** 系统 SHALL 在当前会话时间线中展示本次自动 handoff 的可见触发消息
- **AND** 系统 SHALL 不要求用户等到整轮流式完成后才看见该次触发

### Requirement: CMS 自动 handoff 在 busy 与失败场景下必须阻断或保留现场
系统 SHALL 在当前会话不适合继续发送时阻断新的 CMS 自动 handoff，并 SHALL 在失败时保留弹框与选择现场，以支持用户理解原因并重试。

#### Scenario: 会话忙碌时阻断新的自动 handoff
- **WHEN** 当前 Agent 会话正在 streaming，或当前已经存在一个未完成的 CMS handoff 请求
- **THEN** 系统 SHALL 阻断新的自动 handoff 发送
- **AND** 系统 SHALL 保持 CMS 弹框打开
- **AND** 系统 SHALL 向用户提供当前会话忙碌的明确反馈

#### Scenario: 自动 handoff 成功后关闭弹框但保留区块选中态
- **WHEN** 一次 CMS 自动 handoff 发送成功开始执行
- **THEN** 系统 SHALL 关闭 CMS 弹框
- **AND** 系统 SHALL 保留当前页面区块的选中态

#### Scenario: 自动 handoff 发送失败后保留选择结果
- **WHEN** 一次 CMS 自动 handoff 在发送阶段失败
- **THEN** 系统 SHALL 保持 CMS 弹框打开
- **AND** 系统 SHALL 保留当前已选栏目或内容结果
- **AND** 系统 SHALL 保留当前页面区块的选中态
- **AND** 系统 SHALL 允许用户在原地重试
