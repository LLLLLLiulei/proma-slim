## MODIFIED Requirements

### Requirement: 默认运行镜像必须以 Bun 为基线并最小化额外运行时依赖
系统 SHALL 以 Bun 作为 page builder 部署的默认构建基线，并 SHALL 让 `server` 与 `web` 服务的生产运行镜像使用轻量 Node.js runtime 提供 page builder 后端、前端入口与 `/api` 代理能力，以降低生产运行阶段对 Bun runtime 与宿主内核兼容性的依赖。

#### Scenario: 默认 app 运行镜像使用轻量 Node.js 提供 page builder 后端
- **WHEN** 默认 `@ai-page-builder/app` 运行镜像启动
- **THEN** 系统 SHALL 使用轻量 Node.js runtime 启动 `@ai-page-builder/app` HTTP 服务
- **AND** 系统 SHALL 暴露 page builder 所需的 HTTP API、SSE、Agent、workspace preview 与导出下载能力
- **AND** 系统 SHALL NOT 要求该后端服务在生产运行阶段安装或调用 Bun CLI

#### Scenario: 默认 page builder Web 运行镜像使用轻量 Node.js 提供前端入口
- **WHEN** 默认 page builder Web 运行镜像启动
- **THEN** 系统 SHALL 使用轻量 Node.js runtime 提供 page builder 的静态前端入口与 `/api` 代理能力
- **AND** 系统 SHALL NOT 要求该 Web 入口在生产运行阶段安装或调用 Bun CLI

#### Scenario: server 镜像构建阶段仍可使用 Bun
- **WHEN** 系统构建默认 page builder server 镜像
- **THEN** 构建阶段 MAY 使用 Bun 安装依赖、执行 Vite 构建和生成 Node 目标 server 入口产物
- **AND** runtime stage SHALL 只使用 Node.js 启动 server 入口，而不是依赖构建阶段的 Bun runtime 启动服务

#### Scenario: Web 镜像构建阶段仍可使用 Bun
- **WHEN** 系统构建默认 page builder Web 镜像
- **THEN** 构建阶段 MAY 使用 Bun 安装依赖、执行 Vite 构建和生成 Node 目标入口产物
- **AND** runtime stage SHALL 只复制运行 Web 入口所需的构建产物，而不是依赖构建阶段的 Bun runtime 启动服务

#### Scenario: 本地验证 server 镜像可启动
- **WHEN** 开发者完成 page builder server runtime 改造
- **THEN** 系统 SHALL 能在本地构建默认 server 镜像并运行容器
- **AND** 容器 SHALL 使用 Node.js 启动并监听配置端口
- **AND** 容器 SHALL 能返回 `/api/status` 响应并报告 Agent SDK CLI 可发现状态

#### Scenario: 本地验证 Web 镜像可启动
- **WHEN** 开发者完成 page builder Web runtime 改造
- **THEN** 系统 SHALL 能在本地构建默认 Web 镜像并运行容器
- **AND** 容器 SHALL 使用 Node.js 启动并监听配置端口

## ADDED Requirements

### Requirement: server Node runtime 必须保持 Docker 部署输入与持久化路径兼容
系统 SHALL 在将 `server` 生产运行镜像切换到 Node.js runtime 后保持现有 Docker compose 服务名称、镜像名称、端口、环境变量边界和持久化目录语义，避免要求操作者迁移历史工作区数据或重写部署配置。

#### Scenario: server 数据卷路径保持兼容
- **WHEN** 默认 compose 或 release compose 启动 Node runtime 版 `server` 服务
- **THEN** 系统 SHALL 继续将宿主机 page-builder 运行时目录挂载到容器内 `/home/bun/.ai-page-builder`
- **AND** `server` SHALL 继续使用该目录作为 `AI_PAGE_BUILDER_CONFIG_DIR` 默认值
- **AND** 系统 SHALL NOT 因 runtime 从 Bun 改为 Node 而要求迁移既有工作区、会话、CMS runtime store 或 SDK 配置目录

#### Scenario: server 环境变量边界保持兼容
- **WHEN** 操作者查看默认 compose 与 release compose 中的 `server.environment`
- **THEN** 系统 SHALL 继续声明现有 `AI_PAGE_BUILDER_*` 部署变量与 Agent SDK env 白名单
- **AND** 系统 SHALL NOT 为 Node runtime 迁移引入新的必填密钥变量或 `env_file` 注入方式

#### Scenario: server 内置资源路径在 Node runtime 下可解析
- **WHEN** Node runtime 版 `server` 容器启动
- **THEN** 系统 SHALL 能读取内置 default skills、workspace templates、preview bridge 资产和 CMS rendering preview 资产
- **AND** 这些资源路径 SHALL NOT 依赖 Bun runtime 源码执行时的隐式相对路径

#### Scenario: release 镜像命名保持不变
- **WHEN** 操作者使用 release compose 拉取并启动 page-builder 服务
- **THEN** `server` 服务 SHALL 继续使用 `page-builder-server` 镜像命名约定
- **AND** `web` 服务 SHALL 继续使用 `page-builder-web` 镜像命名约定
- **AND** runtime 切换 SHALL NOT 改变 compose 服务间的内部网络访问地址
