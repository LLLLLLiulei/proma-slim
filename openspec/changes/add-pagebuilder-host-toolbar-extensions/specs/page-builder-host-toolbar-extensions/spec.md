## ADDED Requirements

### Requirement: 宿主工具栏扩展按钮配置必须受控归一化
系统 SHALL 定义受控的 PageBuilder 宿主工具栏扩展按钮契约，并 SHALL 在渲染或转发前归一化按钮配置。按钮配置 MUST 只包含白名单 JSON 字段，系统 SHALL NOT 接受或渲染外部传入的 JavaScript、HTML、SVG 字符串、CSS style 对象或自动跳转 URL。

#### Scenario: 空配置不渲染扩展按钮
- **WHEN** Builder 没有收到宿主工具栏扩展按钮配置
- **THEN** 系统 SHALL 将扩展按钮列表归一化为空数组
- **AND** 左侧预览区顶部工具栏 SHALL 保持现有内置按钮行为

#### Scenario: 合法按钮配置被归一化
- **WHEN** 系统收到合法的宿主工具栏扩展按钮配置
- **THEN** 系统 SHALL 保留按钮的 `id`、`label`、`tooltip`、`icon`、`variant`、`disabled`、`busy`、`hidden`、`requiresPreview` 和 `order` 字段
- **AND** 系统 SHALL 按 `order` 和输入顺序得到稳定展示顺序

#### Scenario: 非法或危险字段不进入渲染
- **WHEN** 宿主工具栏扩展按钮配置包含非法 `id`、空 `label`、未知 `icon`、未知 `variant`、函数、HTML、SVG、CSS style 或 URL 动作字段
- **THEN** 系统 SHALL 拒绝该按钮或丢弃非法字段
- **AND** 系统 SHALL NOT 将危险字段透传给 React 渲染层、DOM 属性或消息回调

#### Scenario: 按钮数量和文案长度受限
- **WHEN** 宿主传入超过系统上限的按钮数量或过长的按钮文案
- **THEN** 系统 SHALL 只保留允许数量内的按钮
- **AND** 系统 SHALL 限制或截断可见文案，避免单个按钮撑破预览工具栏

#### Scenario: 重复按钮 ID 只保留一个
- **WHEN** 宿主传入多个相同 `id` 的扩展按钮
- **THEN** 系统 SHALL 只保留第一个合法按钮
- **AND** 后续同 ID 按钮 SHALL NOT 覆盖已归一化的按钮定义

### Requirement: Builder 预览工具栏必须渲染宿主扩展按钮
系统 SHALL 在 Builder 左侧预览区顶部工具栏中渲染归一化后的宿主扩展按钮，并 SHALL 保持内置工具栏动作的展示条件、顺序和行为语义不变。

#### Scenario: 扩展按钮显示在内置预览动作之后
- **WHEN** Builder 左侧预览区顶部工具栏同时存在内置动作和宿主扩展按钮
- **THEN** 系统 SHALL 先展示现有内置预览动作
- **AND** 系统 SHALL 在同一右侧动作组末尾展示宿主扩展按钮

#### Scenario: hidden 按钮不显示
- **WHEN** 某个归一化扩展按钮的 `hidden` 为 `true`
- **THEN** 系统 SHALL NOT 在工具栏中渲染该按钮
- **AND** 系统 SHALL NOT 允许用户触发该按钮点击事件

#### Scenario: disabled 和 busy 状态禁用点击
- **WHEN** 某个归一化扩展按钮的 `disabled` 或 `busy` 为 `true`
- **THEN** 系统 SHALL 在工具栏中展示不可点击状态
- **AND** 用户点击该按钮时系统 SHALL NOT 发送宿主按钮点击事件

#### Scenario: requiresPreview 在无预览时禁用按钮
- **WHEN** 某个归一化扩展按钮声明 `requiresPreview: true`
- **AND** 当前工作区没有可用预览 URL
- **THEN** 系统 SHALL 禁用该按钮
- **AND** 系统 SHALL NOT 因该按钮存在而生成或刷新预览

#### Scenario: 扩展按钮长文案不溢出工具栏
- **WHEN** 宿主扩展按钮的可见文案接近系统允许长度上限
- **THEN** 系统 SHALL 使按钮文案在按钮内部截断或受控换行
- **AND** 系统 SHALL NOT 让按钮文本覆盖相邻按钮或溢出预览工具栏容器

### Requirement: PageBuilder 必须通过独立宿主消息协议通知父页面
系统 SHALL 使用独立于内部 preview bridge 的宿主消息协议与 iframe 父页面通信。宿主协议 SHALL 只在 PageBuilder iframe 与其同源父页面之间传递 ready、扩展按钮点击和按钮状态确认类消息。

#### Scenario: Builder 准备好后通知父页面
- **WHEN** Builder 已完成项目上下文加载并挂载宿主工具栏扩展协议
- **THEN** PageBuilder iframe SHALL 向父页面发送 `ready` 消息
- **AND** 消息 SHALL 包含协议版本和 `toolbarExtensions` 能力标记

#### Scenario: 点击扩展按钮通知父页面
- **WHEN** 用户点击一个可用的宿主扩展按钮
- **THEN** PageBuilder iframe SHALL 向父页面发送 `toolbar-button-click` 消息
- **AND** 消息 SHALL 包含 `buttonId`、`workspaceId`、`sessionId` 和必要的非敏感 Builder 状态

#### Scenario: 点击扩展按钮不执行宿主业务逻辑
- **WHEN** 用户点击宿主扩展按钮
- **THEN** PageBuilder SHALL NOT 直接执行发布、送审、返回、跳转或外部 API 调用
- **AND** 宿主业务动作 SHALL 由 iframe 父页面在收到点击消息后自行处理

#### Scenario: 宿主消息不包含敏感凭据
- **WHEN** PageBuilder 发送 `ready` 或 `toolbar-button-click` 消息
- **THEN** 消息 SHALL NOT 包含 CMS Cookie、integration secret、Builder Access Cookie、edit lock credentials、handoffId 或 access token

### Requirement: 父页面必须能够更新宿主扩展按钮状态
系统 SHALL 允许同源 iframe 父页面通过宿主消息协议替换当前扩展按钮集合或更新单个扩展按钮状态，并 SHALL 对来自父页面的消息执行来源和字段校验。

#### Scenario: 父页面替换按钮集合
- **WHEN** 同源 iframe 父页面向 PageBuilder 发送合法的 `toolbar-buttons-set` 消息
- **THEN** 系统 SHALL 归一化消息中的按钮集合
- **AND** 系统 SHALL 使用归一化结果替换当前宿主扩展按钮状态

#### Scenario: 父页面更新单个按钮状态
- **WHEN** 同源 iframe 父页面向 PageBuilder 发送合法的 `toolbar-button-update` 消息
- **AND** 消息引用的 `buttonId` 已存在
- **THEN** 系统 SHALL 将允许的状态 patch 合并到该按钮
- **AND** 工具栏 SHALL 反映更新后的 `busy`、`disabled`、`hidden`、`label` 或 `tooltip` 状态

#### Scenario: 非父页面或非同源消息被忽略
- **WHEN** PageBuilder 收到宿主扩展协议消息
- **AND** 消息来源不是当前 iframe 父页面或消息 origin 不等于当前页面 origin
- **THEN** 系统 SHALL 忽略该消息
- **AND** 系统 SHALL NOT 更新按钮状态或发送点击事件

#### Scenario: 非法状态更新不破坏现有按钮
- **WHEN** 父页面发送的按钮状态更新包含未知字段、非法枚举值或不存在的 `buttonId`
- **THEN** 系统 SHALL 忽略非法更新
- **AND** 当前已渲染的合法按钮状态 SHALL 保持不变
