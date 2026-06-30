## Why

当前生产部署中 `page-builder-server` 仍使用 Bun runtime 启动 `@ai-page-builder/app` 后端；在 CentOS 7 / Linux kernel 3.10 环境下，Docker 升级与 `seccomp=unconfined` 后仍存在 Bun runtime 启动失败，导致后端容器持续重启。`page-builder-web` 已验证可在 Node 22 runtime 下正常启动，因此需要继续将 server 运行阶段迁移到 Node 22，降低生产部署对 Bun runtime 与老内核组合的兼容性依赖。

## What Changes

- 将 `page-builder-server` 生产运行镜像从 `oven/bun` 切换为 `node:22-bookworm-slim`，构建阶段仍可继续使用 Bun 完成依赖安装、Vite 构建和 Node 目标产物构建。
- 将 `@ai-page-builder/app` 后端 HTTP 启动路径从 `Bun.serve()` 迁移到 Node/Hono server，并保持现有 REST API、SSE、静态资源 fallback 与错误响应契约。
- 移除 server 生产运行路径对 `Bun.file()` 的依赖，使用 Node 兼容的文件响应能力承载静态资源、workspace preview、template preview、导出 zip 下载与 CMS export 下载。
- 将运行时动态调用 `Bun.build()` 生成的 preview bridge 与 CMS rendering preview 资产改为构建阶段预生成、运行阶段读取静态产物。
- 保留现有 `server` 镜像名、端口、compose 环境变量、数据卷路径 `/home/bun/.ai-page-builder` 和 Agent SDK env 注入语义，避免破坏历史部署数据。
- 本地构建并运行 Node 22 server 镜像，验证 `/api/status`、基础 API、预览资产和 Agent SDK CLI 可发现性；随后可构建 amd64 镜像推送到远程部署验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-docker-deployment`: server 服务生产运行基线从 Bun runtime 调整为轻量 Node.js runtime，构建阶段仍允许使用 Bun，并要求保留现有 compose 输入、数据卷与 Agent SDK 环境变量语义。
- `web-server`: 后端 HTTP 服务启动与文件响应实现从 Bun runtime API 迁移为 Node/Hono runtime，同时保持现有 REST、SSE、静态资源、preview 与下载接口契约。

## Impact

- 影响 `build/Dockerfile.page-builder-app` 的 runtime stage、server bundle 构建、运行时资源复制和启动命令。
- 影响 `apps/app/src/main/http-server.ts`、`apps/app/src/main/http/static-handler.ts` 以及多个返回文件响应的 HTTP 路由/服务实现。
- 影响 `apps/app/src/main/lib/page-builder-preview-bridge.ts` 与 `apps/app/src/main/lib/page-builder-cms-rendering-preview.ts` 的资产构建/读取边界。
- 影响 `apps/app/package.json` 与 lockfile，需要显式声明 Node/Hono server 运行依赖，并可能引入轻量 MIME 解析依赖。
- 需要更新 Docker 资产测试、HTTP/file response 测试、preview 相关测试，并补充本地镜像构建与运行验证记录。
