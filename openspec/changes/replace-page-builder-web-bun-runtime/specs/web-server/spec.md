## ADDED Requirements

### Requirement: PageBuilder Web 生产入口必须在 Node/Hono runtime 下保持网关语义
系统 SHALL 让 PageBuilder Web 生产入口通过 Node.js runtime 与 Hono Node server 启动，并 SHALL 在不依赖 Bun runtime API 的前提下保持既有静态资源、SPA fallback、runtime config 注入、public base path 兼容和 `/api/*` 代理行为。

#### Scenario: Node/Hono 启动生产 Web 服务
- **WHEN** PageBuilder Web 生产入口启动
- **THEN** 系统 SHALL 通过 Node.js runtime 启动 Hono Node server 并监听配置端口
- **AND** 系统 SHALL NOT 在该生产运行路径中调用 `Bun.serve()`

#### Scenario: 普通静态资源由 Node 兼容静态服务提供
- **WHEN** 浏览器请求 PageBuilder Web 构建产物中的普通静态资源
- **THEN** 系统 SHALL 使用 Node.js 兼容的静态服务能力返回对应文件
- **AND** 响应 SHALL 包含适用于该资源类型的内容类型
- **AND** 系统 SHALL NOT 在该生产运行路径中调用 `Bun.file()`

#### Scenario: index HTML 继续注入运行时配置
- **WHEN** PageBuilder Web 在生产模式下返回 `index.html` 或 SPA fallback
- **THEN** 系统 SHALL 继续注入运行时 `base href` 与 `window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__`
- **AND** 普通静态资源响应 SHALL NOT 被注入 HTML runtime config

#### Scenario: API 代理语义保持不变
- **WHEN** PageBuilder Web 收到根路径或 public base path 下的 `/api/*` 请求
- **THEN** 系统 SHALL 按既有 public base path 剥离规则将请求代理到 PageBuilder Server
- **AND** 上游请求 SHALL 继续保留浏览器侧 forwarded host 与 proto 信息

#### Scenario: SPA fallback 与静态资源 404 语义保持不变
- **WHEN** PageBuilder Web 收到非静态前端路由请求
- **THEN** 系统 SHALL 返回 PageBuilder SPA shell
- **AND** 当请求路径是缺失的带扩展名静态资源时，系统 SHALL 返回 404 而不是 SPA fallback
