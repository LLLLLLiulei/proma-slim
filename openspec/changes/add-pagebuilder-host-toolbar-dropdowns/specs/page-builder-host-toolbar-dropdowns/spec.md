## ADDED Requirements

### Requirement: 宿主工具栏扩展必须支持受控下拉按钮配置
系统 SHALL 在现有 `toolbarExtensions.buttons` 数组内支持受控下拉按钮配置。未声明 `type` 的既有扩展按钮 SHALL 继续按普通按钮处理；声明 `type: "dropdown"` 的入口 MUST 包含合法下拉项列表。

#### Scenario: 既有普通按钮保持兼容
- **WHEN** 宿主工具栏扩展按钮未声明 `type`
- **THEN** 系统 SHALL 将该入口按普通按钮归一化
- **AND** 既有普通按钮字段、排序、隐藏、禁用和点击语义 SHALL 保持不变

#### Scenario: 合法下拉按钮被归一化
- **WHEN** 宿主工具栏扩展配置包含 `type: "dropdown"`、合法顶层按钮字段和合法 `items`
- **THEN** 系统 SHALL 保留顶层入口的安全展示字段和状态字段
- **AND** 系统 SHALL 保留下拉项的 `id`、`label`、`tooltip`、`icon`、`disabled`、`hidden` 和 `requiresPreview` 字段
- **AND** 系统 SHALL 按顶层入口的 `order` 与输入顺序决定该下拉按钮在工具栏中的位置

#### Scenario: 下拉项字段受白名单限制
- **WHEN** 下拉项包含 JavaScript、HTML、SVG、CSS style、外部 URL、任意 payload、token、Cookie、未知 icon 或其他非白名单字段
- **THEN** 系统 SHALL NOT 将这些字段透传给 React 渲染层、DOM、postMessage 或持久化记录
- **AND** 严格校验场景 SHALL 拒绝非法下拉配置，宽松归一化场景 SHALL 丢弃非法字段或非法下拉项

#### Scenario: 下拉按钮和下拉项数量受限
- **WHEN** 宿主传入超过系统上限的顶层工具栏入口或下拉项数量
- **THEN** 严格校验场景 SHALL 拒绝该配置
- **AND** 宽松归一化场景 SHALL 只保留允许数量内的合法入口和合法下拉项

#### Scenario: 下拉项 ID 必须稳定且不重复
- **WHEN** 同一个下拉按钮内存在空 `id`、非法 `id` 或重复 `id` 的下拉项
- **THEN** 严格校验场景 SHALL 拒绝该配置
- **AND** 宽松归一化场景 SHALL 丢弃非法项并只保留第一个重复 ID 对应的合法项

### Requirement: Builder 预览工具栏必须渲染宿主下拉按钮
系统 SHALL 在 Builder 左侧预览区顶部工具栏中渲染归一化后的宿主下拉按钮和菜单项，并 SHALL 保持现有内置动作和普通宿主按钮行为不变。

#### Scenario: 下拉按钮显示在宿主扩展入口位置
- **WHEN** Builder 左侧预览工具栏同时存在内置动作、普通宿主按钮和宿主下拉按钮
- **THEN** 系统 SHALL 先展示现有内置预览动作
- **AND** 系统 SHALL 在同一宿主扩展区域按归一化顺序展示普通按钮和下拉按钮

#### Scenario: 顶层下拉按钮不可用时不可打开菜单
- **WHEN** 下拉按钮的 `disabled` 或 `busy` 为 `true`
- **OR** 下拉按钮声明 `requiresPreview: true` 且当前没有可用预览 URL
- **THEN** 系统 SHALL 在工具栏中展示不可用状态
- **AND** 用户 SHALL NOT 能打开该下拉菜单或触发任何下拉项点击事件

#### Scenario: hidden 下拉按钮不渲染
- **WHEN** 下拉按钮的 `hidden` 为 `true`
- **THEN** 系统 SHALL NOT 在工具栏中渲染该下拉按钮
- **AND** 系统 SHALL NOT 允许用户触发该下拉按钮或其下拉项点击事件

#### Scenario: 下拉菜单只展示可见菜单项
- **WHEN** 用户打开一个可用下拉按钮
- **THEN** 系统 SHALL 展示归一化后的下拉项列表
- **AND** `hidden: true` 的下拉项 SHALL NOT 出现在菜单中

#### Scenario: 下拉项禁用状态阻止点击
- **WHEN** 某个下拉项的 `disabled` 为 `true`
- **OR** 某个下拉项声明 `requiresPreview: true` 且当前没有可用预览 URL
- **THEN** 系统 SHALL 在菜单中展示该项不可用状态
- **AND** 点击该项 SHALL NOT 发送宿主工具栏点击消息

### Requirement: 下拉项点击必须通过宿主消息协议通知父页面
系统 SHALL 使用现有独立宿主消息协议通知同源 iframe 父页面下拉项点击事件。PageBuilder MUST NOT 根据下拉按钮或下拉项 ID 直接执行宿主业务动作。

#### Scenario: ready 消息声明下拉能力
- **WHEN** Builder 已完成项目上下文加载并挂载宿主工具栏扩展协议
- **THEN** PageBuilder iframe SHALL 向父页面发送 `ready` 消息
- **AND** 消息 SHALL 包含既有 `toolbarExtensions.v1` 能力标记
- **AND** 消息 SHALL 包含表示支持下拉按钮的能力标记

#### Scenario: 点击可用下拉项发送 itemId
- **WHEN** 用户点击一个可用的宿主下拉项
- **THEN** PageBuilder iframe SHALL 向同源父页面发送 `toolbar-button-click` 消息
- **AND** 消息 SHALL 包含顶层 `buttonId` 和下拉项 `itemId`
- **AND** 消息 SHALL 包含 `workspaceId`、`sessionId`、可选 `projectId` 和必要的非敏感 Builder 状态

#### Scenario: 普通按钮点击消息保持兼容
- **WHEN** 用户点击一个可用的普通宿主按钮
- **THEN** PageBuilder iframe SHALL 继续发送不包含 `itemId` 的 `toolbar-button-click` 消息
- **AND** 既有父页面普通按钮监听逻辑 SHALL 继续可用

#### Scenario: 点击下拉项不执行宿主业务逻辑
- **WHEN** 用户点击宿主下拉菜单项
- **THEN** PageBuilder SHALL NOT 直接执行发布、送审、返回、跳转、打开 URL 或外部 API 调用
- **AND** 宿主业务动作 SHALL 由 iframe 父页面在收到 `buttonId` 和 `itemId` 后自行处理

#### Scenario: 下拉点击消息不包含敏感凭据
- **WHEN** PageBuilder 发送下拉项点击消息
- **THEN** 消息 SHALL NOT 包含 CMS Cookie、integration secret、Builder Access Cookie、edit lock credentials、handoffId、access token、宿主业务 token 或未归一化原始配置

### Requirement: 父页面必须能够动态替换包含下拉按钮的工具栏集合
系统 SHALL 允许同源 iframe 父页面通过现有 `toolbar-buttons-set` 消息替换包含普通按钮和下拉按钮的宿主工具栏集合，并 SHALL 保持 `toolbar-button-update` 只更新顶层入口状态。

#### Scenario: 父页面替换包含下拉按钮的集合
- **WHEN** 同源 iframe 父页面向 PageBuilder 发送合法的 `toolbar-buttons-set` 消息，且消息包含普通按钮和下拉按钮
- **THEN** 系统 SHALL 归一化消息中的按钮集合
- **AND** 系统 SHALL 使用归一化结果替换当前宿主工具栏扩展状态

#### Scenario: 父页面更新顶层下拉按钮状态
- **WHEN** 同源 iframe 父页面向 PageBuilder 发送合法的 `toolbar-button-update` 消息，且 `buttonId` 指向一个已存在的下拉按钮
- **THEN** 系统 SHALL 将允许的顶层状态 patch 合并到该下拉按钮
- **AND** 工具栏 SHALL 反映更新后的顶层 `label`、`tooltip`、`busy`、`disabled` 或 `hidden` 状态

#### Scenario: 单项下拉项 patch 不作为第一版能力
- **WHEN** 父页面需要新增、删除、禁用或重命名某个下拉项
- **THEN** 父页面 SHALL 使用 `toolbar-buttons-set` 替换当前按钮集合
- **AND** 系统 SHALL NOT 要求支持通过 `toolbar-button-update` 增量 patch 单个下拉项

#### Scenario: 非同源或非父页面消息被忽略
- **WHEN** PageBuilder 收到宿主工具栏消息
- **AND** 消息来源不是当前 iframe 父页面或消息 origin 不等于当前页面 origin
- **THEN** 系统 SHALL 忽略该消息
- **AND** 系统 SHALL NOT 更新普通按钮、下拉按钮或下拉项状态
