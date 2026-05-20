## MODIFIED Requirements

### Requirement: 编辑操作必须恢复或补建可编辑会话
系统 SHALL 在用户点击历史项目卡片的 `编辑` 按钮时进入该项目的 builder 页面；若该工作区下已经存在仍在执行的 active Agent 会话，则系统 SHALL 优先恢复该 active 会话；若该工作区当前没有 active 会话但存在可用的最近会话，则系统 SHALL 进入该最近会话对应的 builder 页面；若该工作区当前没有可用会话，则系统 SHALL 自动创建一个新会话后再进入 builder。Builder 页面 SHALL 自行完成编辑锁获取、续约和冲突反馈。

#### Scenario: 工作区存在 active 会话时恢复该会话
- **WHEN** 用户点击某个历史项目卡片上的 `编辑` 按钮，且该工作区下存在仍在执行的 active Agent 会话
- **THEN** 系统 SHALL 优先进入该 active 会话对应的 builder 页面

#### Scenario: active 会话不存在时回退到最近会话
- **WHEN** 用户点击某个历史项目卡片上的 `编辑` 按钮，且该工作区下没有 active Agent 会话但存在最近一次会话
- **THEN** 系统 SHALL 进入该工作区最近一次会话对应的 builder 页面

#### Scenario: 已有锁上下文时由 builder 继续续约
- **WHEN** 用户从上一轮 builder 刷新后返回同一个工作区的 builder 页面，且浏览器保留了该页面实例的锁上下文
- **THEN** 系统 SHALL 继续复用原有 `lockId` 与 `holderId` 进行续约
- **AND** 系统 SHALL NOT 为续约生成新的 holder

#### Scenario: 工作区缺少会话时自动补建新会话
- **WHEN** 用户点击某个当前没有可用会话的历史项目卡片上的 `编辑` 按钮
- **THEN** 系统 SHALL 先为该工作区创建一个新会话
- **AND** 系统 SHALL 再进入该新会话对应的 builder 页面
