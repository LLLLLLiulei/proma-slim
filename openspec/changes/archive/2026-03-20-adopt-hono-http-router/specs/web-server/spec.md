## ADDED Requirements

### Requirement: 路由重构期间必须保持既有 HTTP API 契约
系统 SHALL 在重构后端 HTTP 路由实现时保持现有 REST 路径、方法和 SSE 交互契约稳定，避免要求 renderer 侧改写既有调用入口。

#### Scenario: 既有 REST 端点保持可用
- **WHEN** 前端继续调用现有的 `/api/status`、`/api/settings`、`/api/user-profile`、`/api/sessions` 和 `/api/workspaces` 相关端点
- **THEN** 系统 SHALL 继续以既有 HTTP 方法和响应语义处理这些请求，而不要求前端修改请求路径或协议

#### Scenario: SSE 发送端点保持兼容
- **WHEN** 前端继续向 `POST /api/sessions/:id/send` 发送消息
- **THEN** 系统 SHALL 继续返回可被现有 SSE 读取逻辑消费的流式响应，并保持 `event: <type>\ndata: <json>\n\n` 事件格式

#### Scenario: API 未命中仍返回 JSON 错误
- **WHEN** 请求命中未知的 `/api/*` 路径
- **THEN** 系统 SHALL 返回 JSON 错误响应，而不是返回前端静态资源或 HTML 回退文档

### Requirement: HTTP 服务必须通过模块化应用层组织路由
系统 SHALL 通过一个共享的 HTTP 应用层来组合 REST 路由、中间件和静态资源处理边界，而不是继续依赖单文件内联分发器。

#### Scenario: 路由按资源域拆分
- **WHEN** 系统初始化 HTTP 服务
- **THEN** 会话、工作区、状态和用户资料等处理逻辑 SHALL 以独立路由组形式挂载到共享应用入口，而不是全部堆叠在单个条件分支文件中

#### Scenario: 共享中间件处理资源预加载和错误映射
- **WHEN** 某个 HTTP 端点依赖会话或工作区资源存在，或在处理期间抛出可预期的 HTTP 错误
- **THEN** 系统 SHALL 通过共享应用层中间件完成资源预加载或错误响应映射，而不是在每个端点内重复编写相同分支

#### Scenario: 静态资源回退与 API 路由边界分离
- **WHEN** 生产模式下收到非 `/api/*` 请求
- **THEN** 系统 SHALL 通过共享应用层中的静态资源处理逻辑返回命中的构建产物或 SPA 回退文档，而不是与 API 路由分发逻辑耦合在同一分支实现中
