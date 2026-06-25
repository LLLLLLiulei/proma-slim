## ADDED Requirements

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
