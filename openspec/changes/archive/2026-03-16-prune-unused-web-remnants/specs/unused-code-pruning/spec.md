## ADDED Requirements

### Requirement: 无生产消费者的 renderer 代码必须被移除
系统 SHALL 删除当前 Web Agent 运行时中没有任何生产消费者、且引用仅剩自身、barrel export 或测试的 renderer 代码。

#### Scenario: 孤儿 renderer 组件
- **WHEN** 一个 renderer 组件在仓库中的引用只剩文件自身、barrel export 或测试文件
- **THEN** 系统 SHALL 将该组件及其对应的孤儿 export 一并移除，而不是继续保留在运行时代码树中

#### Scenario: 未使用的设置页 primitive
- **WHEN** 一个 settings primitive 不被当前设置页或其他生产组件引用
- **THEN** 系统 SHALL 将该 primitive 从代码库中删除，并同步收口相关 export surface

### Requirement: 活跃文件中的无消费者导出必须收口
系统 SHALL 在仍被运行时使用的文件中删除无消费者导出、状态面和兼容层定义，只保留当前 Web Agent 主链实际使用的接口。

#### Scenario: 活文件中的孤儿导出
- **WHEN** 一个活跃文件同时包含运行中接口和无消费者导出
- **THEN** 系统 SHALL 仅删除无消费者导出与其依赖定义，保留仍被当前运行时使用的部分

#### Scenario: 旧状态面残留
- **WHEN** 一个状态定义仅服务于已删除的 Team、旧高级参数或旧设置模型，且没有任何当前消费者
- **THEN** 系统 SHALL 将该状态定义从活跃状态文件中移除

### Requirement: 共享类型表面必须与当前产品边界一致
系统 SHALL 删除仅服务于已删除功能域、且当前 Web Agent main/renderer 没有消费者的 shared 类型与导出。

#### Scenario: 旧类型域没有消费者
- **WHEN** 一个 shared 类型域只对应已删除的 Chat/Channel 功能，且当前仓库没有运行时消费者
- **THEN** 系统 SHALL 删除该类型文件及其顶层导出，避免继续暴露历史兼容表面
