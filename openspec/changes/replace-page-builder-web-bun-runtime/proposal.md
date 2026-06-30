## Why

当前生产部署中 `page-builder-web` 使用 Bun runtime 提供静态入口和 `/api` 代理；在 CentOS 7 / Linux kernel 3.10 环境下，即使升级 Docker 后仍出现 Bun 执行入口文件失败，导致 Web 容器持续重启。需要先将 Web 容器运行时从 Bun 迁移到轻量 Node.js，以验证并降低生产部署对 Bun runtime 与宿主内核兼容性的依赖。

## What Changes

- 将 `page-builder-web` 生产运行时从 `oven/bun` 切换为轻量 Node.js 镜像，构建阶段仍可继续使用 Bun/Vite。
- 将 PageBuilder Web 生产入口改为 Hono + `@hono/node-server` 承载，避免运行时依赖 `Bun.serve()`。
- 普通静态资源优先使用 Hono Node 静态服务能力；`index.html` runtime config 注入、SPA fallback、public base path 兼容和 `/api/*` 代理保持现有语义。
- 移除 Web 生产运行路径对 `Bun.file()` 的依赖，并确保静态资源响应具有正确内容类型。
- 本地完成 Web 镜像构建与容器启动验证，证明 Node runtime 版 Web 容器可独立启动并监听端口。
- 不在本变更中迁移 `server` 容器运行时；后端仍保持现状。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-docker-deployment`: Web 服务生产镜像运行基线从 Bun runtime 调整为轻量 Node.js runtime，构建阶段仍允许使用 Bun，并要求本地镜像构建和运行验证。
- `web-server`: PageBuilder Web 生产服务在 Node/Hono runtime 下继续提供静态资源、SPA fallback、runtime config 注入、public base path 兼容和 `/api/*` 代理行为。

## Impact

- 影响 `apps/page-builder/src/server/prod-server.ts` 的生产服务启动与静态资源响应实现。
- 影响 `apps/page-builder/package.json` 与 lockfile 依赖，需要引入 Hono Node server 相关依赖。
- 影响 `build/Dockerfile.page-builder-web` 的 runtime stage、打包 target 与启动命令。
- 影响 `build/docker-compose.yml`、`build/docker-compose.release.yml` 或相关部署资产中对 Web runtime 基线的描述与测试预期。
- 需要更新/补充 `apps/page-builder/src/server/prod-server.test.ts` 及 Docker 资产测试，覆盖 Node runtime 入口和既有路由语义保持。
