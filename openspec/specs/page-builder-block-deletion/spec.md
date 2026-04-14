## Purpose
定义 `page-builder` Builder 页区块删除能力的行为边界，包括删除确认、删除目标判定，以及删除结果与预览选区状态的同步规则。

## Requirements

### Requirement: 删除当前区块必须先经过显式二次确认
系统 SHALL 在用户从区块工具条触发删除操作后，先要求用户进行显式确认，再执行当前区块删除。

#### Scenario: 点击删除后打开确认弹框
- **WHEN** 用户已经选中某个预览区块，并点击工具条中的 `删除`
- **THEN** 系统 SHALL 打开删除确认弹框
- **AND** 系统 SHALL 不在用户确认前直接修改当前页面 HTML

#### Scenario: 取消确认时不触发删除
- **WHEN** 用户已经打开删除确认弹框，但选择 `取消` 或关闭弹框
- **THEN** 系统 SHALL 不发起删除请求
- **AND** 系统 SHALL 保留当前已选区块与工具条状态

### Requirement: 删除目标必须是当前已选中的源选择目标本身
系统 SHALL 将当前删除目标定义为用户当前已选中的源选择目标本身，并基于该目标的唯一源 `selector` 执行删除，而不是自动上提到父级容器或其他推断目标；当当前目标是 `cms-island` 时，系统 MUST 删除源 HTML 中对应的 CMS 标签本身，而不得删除整个 parent block 或其静态兄弟节点。

#### Scenario: 确认删除后移除当前已选静态目标
- **WHEN** 用户确认删除某个当前已选中的普通预览区块
- **THEN** 系统 SHALL 向后端发送当前已选目标的唯一源 `selector`
- **AND** 后端 SHALL 从 `workspace-files/index.html` 中移除该 `selector` 唯一命中的元素节点

#### Scenario: 确认删除 CMS island 时只移除源 CMS 标签
- **WHEN** 用户确认删除某个当前已选中的 CMS island
- **THEN** 系统 SHALL 向后端发送该 CMS island 对应源 CMS 标签的唯一 `selector`
- **AND** 后端 SHALL 仅移除该源 CMS 标签节点本身
- **AND** 后端 SHALL NOT 删除该 CMS 标签所在的整个 parent block
- **AND** 后端 SHALL NOT 删除同一 parent block 内的静态兄弟节点

#### Scenario: selector 无法唯一定位时拒绝删除
- **WHEN** 后端收到某次删除请求，但当前源 `selector` 无法定位到唯一元素
- **THEN** 系统 SHALL 拒绝本次 HTML 回写
- **AND** 系统 SHALL 向调用方返回失败结果，而不是删除不确定的目标

### Requirement: 删除结果必须同步到预览并正确处理选区状态
系统 SHALL 在删除成功后通过现有 preview revision 刷新 Builder 预览，并在失败时保持当前选区供用户重试。

#### Scenario: 删除成功后刷新预览并清空选区
- **WHEN** 一次区块删除请求成功完成 HTML 回写
- **THEN** 系统 SHALL 使当前工作区预览状态产生新的 `revision`
- **AND** 系统 SHALL 清空当前已选区块与工具条状态
- **AND** 系统 SHALL 让 Builder 预览后续显示删除后的页面结果

#### Scenario: 删除失败后保留当前选区
- **WHEN** 一次区块删除请求失败
- **THEN** 系统 SHALL 向用户展示删除失败反馈
- **AND** 系统 SHALL 保留当前已选区块状态，以便用户重试或执行其他操作
