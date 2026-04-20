## MODIFIED Requirements

### Requirement: 删除目标必须是当前已选中的源选择目标本身
系统 SHALL 将当前删除目标定义为用户当前已选中的源选择目标本身，并基于该目标的唯一源定位信息执行删除，而不是自动上提到父级容器或其他推断目标；当当前目标是 `cms-island` 时，系统 MUST 基于该目标的 runtime locator 删除源 HTML 中对应的 CMS 标签本身，而不得删除整个 parent block 或其静态兄弟节点。

#### Scenario: 确认删除后移除当前已选静态目标
- **WHEN** 用户确认删除某个当前已选中的普通预览区块
- **THEN** 系统 SHALL 向后端发送当前已选目标的唯一源 `selector`
- **AND** 后端 SHALL 从 `workspace-files/index.html` 中移除该 `selector` 唯一命中的元素节点

#### Scenario: 确认删除 CMS island 时只移除源 CMS 标签
- **WHEN** 用户确认删除某个当前已选中的 CMS island
- **THEN** 系统 SHALL 向后端发送该 CMS island 对应源 CMS 标签的 runtime locator，包括 `htmlPath`、`sourceSelector`、`parentBlockSelector` 与组件类型
- **AND** 后端 SHALL 仅移除该 locator 唯一命中的源 CMS 标签节点本身
- **AND** 后端 SHALL NOT 删除该 CMS 标签所在的整个 parent block
- **AND** 后端 SHALL NOT 删除同一 parent block 内的静态兄弟节点

#### Scenario: locator 无法唯一定位时拒绝删除
- **WHEN** 后端收到某次 CMS island 删除请求，但当前 runtime locator 无法定位到唯一元素、组件不匹配或 parent block 校验失败
- **THEN** 系统 SHALL 拒绝本次 HTML 回写
- **AND** 系统 SHALL 向调用方返回失败结果，而不是删除不确定的目标
