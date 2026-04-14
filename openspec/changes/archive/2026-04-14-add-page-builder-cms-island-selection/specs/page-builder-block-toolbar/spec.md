## MODIFIED Requirements

### Requirement: 已选区块下方必须显示锚定的区块工具条
系统 SHALL 在用户选中预览目标后，于该目标附近显示一个锚定的浮动工具条，并在选区失效时将其移除；当当前目标是 `cms-island` 时，工具条 MUST 锚定到该 CMS island 的渲染区域，而不得自动锚定到整个 parent block。

#### Scenario: 选中静态区块后显示工具条
- **WHEN** 用户通过现有选区流程成功选中某个普通预览区块
- **THEN** 系统 SHALL 在该区块下方或可视范围内紧邻该区块的位置显示浮动工具条
- **AND** 系统 SHALL 使该工具条明确对应当前已选区块

#### Scenario: 选中 CMS island 后工具条锚定到该 island
- **WHEN** 用户通过现有选区流程成功选中某个 CMS island
- **THEN** 系统 SHALL 在该 CMS island 的渲染区域附近显示浮动工具条
- **AND** 系统 SHALL NOT 因该 CMS island 位于某个 parent block 内而自动把工具条锚定到整个 parent block

#### Scenario: 选区失效后隐藏工具条
- **WHEN** 当前选区被清空、退出选区模式、预览重载，或预览桥接报告当前选中目标已失效
- **THEN** 系统 SHALL 隐藏区块工具条
- **AND** 系统 SHALL 不继续显示上一轮选区对应的锚定位置

#### Scenario: 切换选中目标后工具条跟随更新
- **WHEN** 用户在同一轮中重新选中另一个预览目标
- **THEN** 系统 SHALL 将工具条重新锚定到最新选中的目标附近
- **AND** 系统 SHALL 不同时为多个目标显示多个工具条

### Requirement: 区块工具条必须提供“从 CMS 选择数据”操作
系统 SHALL 在区块工具条中继续提供 `从 CMS 选择数据` 操作；当当前已选目标是 `cms-island` 时，系统 MUST 将该 `cms-island` 的源选择语义传给 CMS 浏览弹框，并在后续重绑时只替换该源 CMS 标签本身。

#### Scenario: 点击工具条按钮后打开现有 CMS 弹框
- **WHEN** 用户点击已选目标工具条中的 `从 CMS 选择数据` 按钮
- **THEN** 系统 SHALL 打开当前 Builder 页已有的 CMS 浏览弹框
- **AND** 系统 SHALL 保留当前已选目标状态，以便后续流程继续围绕该目标展开

#### Scenario: 选中 CMS island 时打开弹框携带 source-atomic 目标
- **WHEN** 用户当前已选目标是某个 CMS island，且点击 `从 CMS 选择数据`
- **THEN** 系统 SHALL 向 CMS 浏览弹框请求上下文中传递该 `cms-island` 的源选择器、所属 `parentBlockSelector` 与组件类型
- **AND** 系统 SHALL 将该目标标记为 source-atomic 的重绑边界
- **AND** 后续确认选择时 SHALL 仅替换该源 CMS 标签本身

#### Scenario: 打开 CMS 弹框不会自动触发内容应用
- **WHEN** 用户通过区块工具条打开 CMS 浏览弹框
- **THEN** 系统 SHALL 仅执行“打开弹框”这一动作
- **AND** 系统 SHALL 不在本能力中自动应用 CMS 数据、自动发送消息或自动触发页面修改

### Requirement: 工具条动作必须根据当前已选区块能力动态变化
系统 SHALL 根据当前已选目标声明的能力动态决定区块工具条中展示哪些动作，而不是始终展示固定动作集合；当当前目标是 `cms-island` 时，系统 SHALL 禁止暴露依赖静态 HTML 子节点可回写性的能力。

#### Scenario: 支持图片替换的静态区块显示附加动作
- **WHEN** 用户当前已选中的普通预览区块声明支持图片替换
- **THEN** 系统 SHALL 在该区块的锚定工具条中显示 `替换图片` 动作
- **AND** 系统 SHALL 保持该动作与当前已选区块绑定

#### Scenario: 已选 CMS island 不显示替换图片动作
- **WHEN** 用户当前已选目标是某个 CMS island，且其渲染结果中包含图片
- **THEN** 系统 SHALL 不在该目标的锚定工具条中显示 `替换图片`
- **AND** 系统 SHALL 不把渲染出的 CMS 图片视为可安全回写的静态图片目标

#### Scenario: 选区失效后移除能力相关动作
- **WHEN** 当前目标选区被清空、预览重载，或工具条对应的选区失效
- **THEN** 系统 SHALL 隐藏与该选区能力相关的附加动作
- **AND** 系统 SHALL 不继续保留上一轮选区的能力入口

