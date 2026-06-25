## Purpose
定义 `page-builder` Builder 页中区块级 CMS 主入口、已选区块锚定工具条以及该工具条与现有 CMS 浏览弹框之间的行为边界。

## Requirements

### Requirement: 手动 CMS 主入口必须绑定到已选区块而不是 composer
系统 SHALL 将 `page-builder` Builder 页中的手动 CMS 主入口迁移为区块级入口，而不是继续在右侧对话输入区动作区域提供独立的 `浏览 CMS` 主入口。

#### Scenario: 未选中区块时不展示手动 CMS 主入口
- **WHEN** 用户进入 Builder 页且当前没有已选中的预览区块
- **THEN** 系统 SHALL 不在预览区显示区块级 CMS 工具条
- **AND** 系统 SHALL 不在对话输入区动作区域显示独立的 `浏览 CMS` 主入口

#### Scenario: 预览工具栏中的区块选择入口继续作为进入主流程的前置步骤
- **WHEN** 用户尚未选中任何预览区块
- **THEN** 系统 SHALL 在预览工具栏中继续提供区块选择入口
- **AND** 系统 SHALL 要求用户先通过该入口选中目标区块，之后才可使用手动 CMS 主入口
- **AND** 系统 SHALL 不要求用户回到对话输入区查找该入口

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
- **WHEN** 当前选区被清空、退出选区模式、预览重载，或预览桥接报告当前选中区块已失效
- **THEN** 系统 SHALL 隐藏区块工具条
- **AND** 系统 SHALL 不继续显示上一轮选区对应的锚定位置

#### Scenario: 切换选中区块后工具条跟随更新
- **WHEN** 用户在同一轮中重新选中另一个预览区块
- **THEN** 系统 SHALL 将工具条重新锚定到最新选中的区块附近
- **AND** 系统 SHALL 不同时为多个区块显示多个工具条

### Requirement: 区块工具条必须提供“从 CMS 选择数据”操作
系统 SHALL 在区块工具条中继续提供 `从 CMS 选择数据` 操作；当当前已选目标是 `cms-island` 时，系统 MUST 将该 `cms-island` 的源选择语义传给 CMS 浏览弹框，并在后续重绑时只替换该源 CMS 标签本身。

#### Scenario: 点击工具条按钮后打开现有 CMS 弹框
- **WHEN** 用户点击已选区块工具条中的 `从 CMS 选择数据` 按钮
- **THEN** 系统 SHALL 打开当前 Builder 页已有的 CMS 浏览弹框
- **AND** 系统 SHALL 保留当前已选区块状态，以便后续流程继续围绕该区块展开

#### Scenario: 选中 CMS island 时打开弹框携带 source-atomic 目标
- **WHEN** 用户当前已选目标是某个 CMS island，且点击 `从 CMS 选择数据`
- **THEN** 系统 SHALL 向 CMS 浏览弹框请求上下文中传递该 `cms-island` 的源选择器、所属 `parentBlockSelector` 与组件类型
- **AND** 系统 SHALL 将该目标标记为 source-atomic 的重绑边界
- **AND** 后续确认选择时 SHALL 仅替换该源 CMS 标签本身

#### Scenario: 打开 CMS 弹框不会自动触发内容应用
- **WHEN** 用户通过区块工具条打开 CMS 浏览弹框
- **THEN** 系统 SHALL 仅执行“打开弹框”这一动作
- **AND** 系统 SHALL 不在本能力中自动应用 CMS 数据、自动发送消息或自动触发页面修改

#### Scenario: 支持图片替换的区块同时显示 CMS 与图片替换操作
- **WHEN** 用户当前已选中的预览区块声明支持图片替换
- **THEN** 系统 SHALL 在同一个锚定工具条中继续显示 `从 CMS 选择数据`
- **AND** 系统 SHALL 同时显示 `替换图片`
- **AND** 系统 SHALL 不因为显示图片替换入口而移除既有 CMS 入口

### Requirement: 工具条动作必须根据当前已选区块能力动态变化
系统 SHALL 根据当前已选目标声明的能力动态决定区块工具条中展示哪些动作，而不是始终展示固定动作集合；当当前目标是 `cms-island` 时，系统 SHALL 禁止暴露依赖静态 HTML 子节点可回写性的能力。

#### Scenario: 支持图片替换的区块显示附加动作
- **WHEN** 用户当前已选中的预览区块声明支持图片替换
- **THEN** 系统 SHALL 在该区块的锚定工具条中显示 `替换图片` 动作
- **AND** 系统 SHALL 保持该动作与当前已选区块绑定

#### Scenario: 不支持图片替换的区块不显示附加动作
- **WHEN** 用户当前已选中的预览区块未声明支持图片替换
- **THEN** 系统 SHALL 不在该区块的锚定工具条中显示 `替换图片` 动作
- **AND** 系统 SHALL 不为不支持的区块展示误导性的图片替换入口

#### Scenario: 已选 CMS island 不显示替换图片动作
- **WHEN** 用户当前已选目标是某个 CMS island，且其渲染结果中包含图片
- **THEN** 系统 SHALL 不在该目标的锚定工具条中显示 `替换图片`
- **AND** 系统 SHALL 不把渲染出的 CMS 图片视为可安全回写的静态图片目标

#### Scenario: 选区失效后移除能力相关动作
- **WHEN** 当前区块选区被清空、预览重载，或工具条对应的选区失效
- **THEN** 系统 SHALL 隐藏与该选区能力相关的附加动作
- **AND** 系统 SHALL 不继续保留上一轮选区的 `替换图片` 入口

### Requirement: 区块工具条必须提供带确认的删除操作
系统 SHALL 在当前存在已选区块时提供 `删除` 操作，并要求用户先完成确认，再真正执行删除。

#### Scenario: 已选区块工具条显示删除操作
- **WHEN** 用户已经选中某个预览区块并显示工具条
- **THEN** 系统 SHALL 在该工具条中显示 `删除` 操作
- **AND** 系统 SHALL 将该操作作为破坏性动作样式展示

#### Scenario: 删除操作通过确认弹框完成最终确认
- **WHEN** 用户点击区块工具条中的 `删除`
- **THEN** 系统 SHALL 打开删除确认弹框
- **AND** 系统 SHALL 仅在用户确认后才继续执行删除流程

#### Scenario: 删除成功后工具条不保留旧选区入口
- **WHEN** 用户确认删除并且删除流程成功
- **THEN** 系统 SHALL 隐藏当前区块工具条
- **AND** 系统 SHALL 不继续保留已被删除区块对应的 `删除` 入口

### Requirement: 工具条锚定位置必须随已选区块位置变化而更新
系统 SHALL 在当前已选区块因预览滚动、尺寸变化或页面布局变化而移动时，同步更新区块工具条的位置，使其持续锚定到当前选中的区块。

#### Scenario: 预览滚动后工具条保持锚定
- **WHEN** 用户已选中某个预览区块，且该区块因预览内部滚动而改变可视位置
- **THEN** 系统 SHALL 更新区块工具条的位置
- **AND** 系统 SHALL 继续使该工具条锚定到当前已选区块附近

#### Scenario: 预览尺寸或布局变化后工具条保持锚定
- **WHEN** 用户已选中某个预览区块，且该区块因预览窗口尺寸变化或页面布局变化而改变位置
- **THEN** 系统 SHALL 更新区块工具条的位置
- **AND** 系统 SHALL 避免继续展示失效的旧锚定位置

### Requirement: 已选区块工具条必须提供选区层级控制
系统 SHALL 在当前存在已选预览目标时，于锚定区块工具条中提供 `选择上一级` 操作，使用户可以把当前选中的卡片、图片、文本容器或 CMS island 提升为更外层的可选目标；该操作 SHALL 由 preview bridge 在 iframe 内重新解析目标，父页面 SHALL NOT 直接猜测 iframe DOM 父级。

#### Scenario: 已选普通 block 时显示选择上一级操作
- **WHEN** 用户已经选中普通 block 目标并显示锚定区块工具条
- **THEN** 系统 SHALL 在该工具条中显示 `选择上一级` 操作
- **AND** 该操作 SHALL 与当前已选目标绑定

#### Scenario: 已选 CMS island 时显示选择上一级操作
- **WHEN** 用户已经选中 `cms-island` 目标并显示锚定区块工具条
- **THEN** 系统 SHALL 在该工具条中显示 `选择上一级` 操作
- **AND** 该操作 SHALL 触发 preview bridge 将该 CMS island 提升到所属 parent block，而不是打开 CMS 浏览弹框或修改 CMS 数据

#### Scenario: 点击选择上一级后工具条跟随新选区更新
- **WHEN** 用户点击锚定工具条中的 `选择上一级`
- **AND** preview bridge 成功解析出父级可选目标
- **THEN** 系统 SHALL 将工具条重新锚定到新的父级目标附近
- **AND** 系统 SHALL 使用新的目标 label、rect 和能力信息刷新工具条动作
- **AND** 系统 SHALL NOT 同时保留旧子目标工具条

#### Scenario: 无法提升父级时工具条保持当前选区
- **WHEN** 用户点击 `选择上一级`
- **AND** 当前目标没有可用父级目标或父级解析失败
- **THEN** 系统 SHALL 保持工具条锚定到当前已选目标
- **AND** 系统 SHALL NOT 清空当前选区、隐藏工具条或产生错误提示

#### Scenario: 交互禁用时选择上一级不可触发
- **WHEN** 当前 Builder 因 Agent 处理中、编辑锁失效或其他既有交互锁定原因禁用区块工具条动作
- **THEN** 系统 SHALL 同步禁用 `选择上一级` 操作
- **AND** 系统 SHALL NOT 向 preview iframe 发送父级选择命令

### Requirement: 已选区块工具条必须提供取消选择操作
系统 SHALL 在当前存在已选预览目标时，于锚定区块工具条中提供 `取消选择` 操作，使用户可以在预览区域直接清空当前选区；取消选择 SHALL 同步清理 preview iframe 状态和父页面状态，并 SHALL 隐藏该工具条。

#### Scenario: 已选目标时显示取消选择操作
- **WHEN** 用户已经选中普通 block 或 `cms-island` 目标并显示锚定区块工具条
- **THEN** 系统 SHALL 在该工具条中显示 `取消选择` 操作
- **AND** 该操作 SHALL 与当前已选目标绑定

#### Scenario: 点击取消选择后隐藏工具条
- **WHEN** 用户点击锚定工具条中的 `取消选择`
- **THEN** 系统 SHALL 清空当前选区
- **AND** 系统 SHALL 隐藏锚定区块工具条
- **AND** 系统 SHALL 隐藏右侧对话输入区上方的当前选中提示
- **AND** 后续下一条消息 SHALL NOT 继续携带刚才的 `targetSelection`

#### Scenario: 取消选择向 iframe 同步 clear 命令
- **WHEN** 用户点击锚定工具条中的 `取消选择`
- **THEN** 父页面 SHALL 向 preview iframe 发送现有 `selection-clear` 命令
- **AND** preview iframe SHALL 清除 selected overlay、hover overlay 和活动中的内联文字编辑状态

#### Scenario: 交互禁用时取消选择不可触发
- **WHEN** 当前 Builder 因 Agent 处理中、编辑锁失效或其他既有交互锁定原因禁用区块工具条动作
- **THEN** 系统 SHALL 同步禁用 `取消选择` 操作
- **AND** 系统 SHALL NOT 清空当前选区或向 preview iframe 发送 clear 命令

### Requirement: 新增工具条动作不得改变既有区块动作语义
系统 SHALL 在新增 `选择上一级` 和 `取消选择` 后继续保留既有区块工具条动作的展示条件和行为边界；新增动作 SHALL NOT 改变 `从 CMS 选择数据`、`替换图片`、`删除` 的能力判断、确认流程或目标边界。

#### Scenario: 既有动作展示条件保持不变
- **WHEN** 当前已选目标支持 `从 CMS 选择数据`、`替换图片` 或 `删除` 中的任一既有动作
- **THEN** 系统 SHALL 按原有能力规则继续显示对应动作
- **AND** 系统 SHALL NOT 因新增 `选择上一级` 或 `取消选择` 而隐藏、强制显示或重排为错误目标

#### Scenario: 父级提升后既有动作基于新目标重新计算
- **WHEN** 用户通过 `选择上一级` 成功切换到父级目标
- **THEN** 系统 SHALL 基于父级目标的最新能力信息重新决定是否显示 `从 CMS 选择数据`、`替换图片` 和 `删除`
- **AND** 系统 SHALL NOT 继续复用旧子目标的能力信息执行后续动作
