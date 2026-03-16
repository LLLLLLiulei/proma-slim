## ADDED Requirements

### Requirement: 清理过程必须保留当前 Web Agent 运行主链
系统 SHALL 在删除无用代码时保留当前 Bun Web Agent 的核心运行能力，包括会话 CRUD、SSE 消息流、Permission/AskUser、消息持久化、运行时初始化和代理注入链路。

#### Scenario: 删除无用代码后保持会话与消息主链可用
- **WHEN** 清理完成并重新执行当前 Web Agent 主流程验证
- **THEN** 系统 SHALL 继续支持页面加载、会话创建与切换、消息发送、流式响应、权限响应和 AskUser 响应

#### Scenario: 删除无用代码后保持代理注入链路可用
- **WHEN** main 侧无消费者管理表面被移除
- **THEN** 系统 SHALL 继续保留用于判断和注入出网代理的内部能力，而不是连同运行时代理链路一并删除

### Requirement: 无消费者管理表面可以被移除
系统 SHALL 删除没有 renderer 消费者、也不参与当前运行主链的 HTTP 管理接口、API 包装和 helper。

#### Scenario: 无消费者 HTTP 管理接口
- **WHEN** 一个 HTTP 路由没有任何 renderer API 包装或生产调用者，且不参与当前会话、消息流、权限或代理注入主链
- **THEN** 系统 SHALL 将该路由和仅服务于该路由的无调用 helper 一并删除

#### Scenario: 无消费者 renderer API 包装
- **WHEN** 一个 renderer API 方法对应的后端能力在当前 UI 中没有任何调用者
- **THEN** 系统 SHALL 删除该 API 包装，避免继续暴露无入口管理表面

### Requirement: 高风险且证据不足的资源不在本轮裁剪范围内
系统 SHALL 将无法通过静态消费者证据证明无用、且运行时由数据驱动匹配的资源排除在本轮无用代码清理之外。

#### Scenario: 数据驱动模型资源
- **WHEN** 一个模型图标或类似资源仍通过运行时字符串匹配参与展示，但静态搜索无法证明其永远无用
- **THEN** 系统 SHALL 将该资源排除在本轮清理范围外，并在设计文档中明确延后处理
