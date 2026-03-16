## Purpose
定义删减遗留 UI 与代理管理表面后仍需保留的代理注入能力，确保 Claude Agent 运行时继续按已有配置和系统代理正常出网。

## Requirements

### Requirement: Agent 运行时代理注入
系统 SHALL 在删减遗留代码后继续为 Claude Agent 运行时解析并注入生效代理配置。

#### Scenario: 手动代理配置仍然生效
- **WHEN** 已持久化的代理配置启用手动模式且存在有效 `manualUrl`
- **THEN** 系统 SHALL 在启动 Agent 查询前将该地址写入 `HTTP_PROXY` 和 `HTTPS_PROXY`

#### Scenario: 系统代理模式仍然生效
- **WHEN** 已持久化的代理配置启用系统模式且系统代理探测返回代理地址
- **THEN** 系统 SHALL 在启动 Agent 查询前将探测到的代理地址写入 `HTTP_PROXY` 和 `HTTPS_PROXY`

### Requirement: 代理清理不得破坏无 UI 配置路径
系统 SHALL 允许在没有前端代理设置入口的情况下继续读取已有代理配置并支持系统探测。

#### Scenario: 前端不提供代理设置入口
- **WHEN** 用户打开设置界面
- **THEN** 界面 SHALL 不展示代理配置入口，且运行时仍可根据已有配置文件和系统环境决定是否使用代理

#### Scenario: 没有应用内写入代理配置能力
- **WHEN** 应用构建完成并运行
- **THEN** 系统 SHALL 不依赖 renderer 侧代理设置 API 包装才能完成代理解析与 Agent 启动

### Requirement: 无调用代理管理表面可被移除
系统 SHALL 允许删除未被 Web UI 调用的代理设置包装与管理表面，只要运行时代理能力未受影响。

#### Scenario: 删除 renderer 代理请求包装
- **WHEN** 工程完成本次清理
- **THEN** renderer 侧 SHALL 不再保留仅用于 `/api/proxy-settings` 的无调用请求方法

#### Scenario: 删除废弃代理管理入口后仍可启动会话
- **WHEN** 用户在清理后的应用中创建并发送 Agent 会话
- **THEN** 系统 SHALL 继续正常启动对话，并在需要代理时使用生效代理配置
