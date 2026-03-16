## Purpose
定义当前 Agent Web 代码库在清理历史残留时的删除边界，确保仅保留真实运行链路需要的模块、导出与依赖。

## Requirements

### Requirement: 不可达 renderer 模块必须被清理
系统 SHALL 删除没有运行时入口的 renderer 壳层、占位模块、上下文和状态文件，而不是继续保留无效实现。

#### Scenario: 旧壳与占位模块被移除
- **WHEN** 本次清理完成并复核 renderer 引用关系
- **THEN** 代码库 SHALL 不再保留仅剩定义、测试或空实现的旧壳模块，例如已无运行时引用的模式切换、旧分栏容器、占位侧板和空上下文

#### Scenario: Chat 时代残留上下文被移除
- **WHEN** 当前产品只保留单一 Agent 交互模式
- **THEN** 代码库 SHALL 不再保留仅服务于已删除 Chat 流程的会话上下文和模式原子状态

### Requirement: 无引用主进程遗留模块必须被清理
系统 SHALL 删除未接入当前 Web 运行链路的主进程辅助模块。

#### Scenario: 遗留服务模块被移除
- **WHEN** 对主进程库做引用扫描并完成实现清理
- **THEN** 代码库 SHALL 不再保留未被当前入口、路由或编排链路引用的遗留模块

### Requirement: 共享导出面必须反映当前产品能力
系统 SHALL 删除已删除功能对应、且没有消费者的 shared 类型导出与相关路径助手。

#### Scenario: 旧功能域导出被收口
- **WHEN** `@proma/shared` 中某个功能域类型在当前仓库内已无消费者
- **THEN** 系统 SHALL 移除对应的 barrel export、类型文件或相关配置路径助手，并保留仍被 Agent Web 运行时使用的导出

### Requirement: 冗余依赖必须随源码一起收口
系统 SHALL 在删除已确认死代码后同步移除仅服务于这些代码的依赖与类型包。

#### Scenario: 删除源码后同步删除依赖
- **WHEN** 某个依赖只被已删除文件引用
- **THEN** 系统 SHALL 将该依赖及其配套类型包从 `package.json` 中移除，并更新锁文件

#### Scenario: 清理后通过类型校验
- **WHEN** 冗余模块和依赖已完成删除
- **THEN** 工程 SHALL 通过 workspace 级 typecheck，证明保留代码仍然自洽
