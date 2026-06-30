## MODIFIED Requirements

### Requirement: 默认运行镜像必须以 Bun 为基线并最小化额外运行时依赖
系统 SHALL 以 Bun 作为 page builder 部署的默认构建基线，并 SHALL 让 `server` 服务继续使用当前 Bun 运行基线；`web` 服务生产运行镜像 SHALL 使用轻量 Node.js runtime 提供 page builder 前端入口与 `/api` 代理能力，以降低 Web 入口对 Bun runtime 与宿主内核兼容性的依赖。

#### Scenario: 默认 app 运行镜像在缺少 Node.js 时仍可启动基础 page builder 后端
- **WHEN** 默认 `@ai-page-builder/app` 运行镜像包含 Bun 与 Git，但未额外安装 Node.js
- **THEN** 系统 SHALL 仍可启动 `@ai-page-builder/app` 服务
- **AND** 系统 SHALL 暴露 page builder 所需的 HTTP API 与流式接口

#### Scenario: 默认 page builder Web 运行镜像使用轻量 Node.js 提供前端入口
- **WHEN** 默认 page builder Web 运行镜像启动
- **THEN** 系统 SHALL 使用轻量 Node.js runtime 提供 page builder 的静态前端入口与 `/api` 代理能力
- **AND** 系统 SHALL NOT 要求该 Web 入口在生产运行阶段安装或调用 Bun CLI

#### Scenario: Web 镜像构建阶段仍可使用 Bun
- **WHEN** 系统构建默认 page builder Web 镜像
- **THEN** 构建阶段 MAY 使用 Bun 安装依赖、执行 Vite 构建和生成 Node 目标入口产物
- **AND** runtime stage SHALL 只复制运行 Web 入口所需的构建产物，而不是依赖构建阶段的 Bun runtime 启动服务

#### Scenario: 本地验证 Web 镜像可启动
- **WHEN** 开发者完成 page builder Web runtime 改造
- **THEN** 系统 SHALL 能在本地构建默认 Web 镜像并运行容器
- **AND** 容器 SHALL 使用 Node.js 启动并监听配置端口
