## 本地验证结果

### 测试与类型检查

- `bun test apps/page-builder/src/server/prod-server.test.ts apps/app/src/main/lib/page-builder-docker-assets.test.ts`：通过，23 个测试全部通过。
- `bun run typecheck`：通过，所有 workspace typecheck 均为 0 退出码。

### Web 镜像构建

- 构建命令：`docker build -f build/Dockerfile.page-builder-web -t ai-page-builder-web:node-runtime-local .`
- 结果：通过。
- 构建阶段继续使用 Bun/Vite。
- Runtime stage 使用 `node:22-bookworm-slim`。
- 生产入口产物为 `apps/page-builder/src/server/prod-server.mjs`。

### Web 容器启动验证

- 运行镜像：`ai-page-builder-web:node-runtime-local`
- 容器端口映射：`127.0.0.1:3335 -> 3333`
- 结果：容器正常启动并监听端口。
- 容器内 Node 版本：`v22.23.1`
- `/` 响应：返回 PageBuilder HTML shell，并包含 `window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__` 与 `<base href="/">`。
- 静态 JS 资源响应：HTTP 200，`content-type: text/javascript; charset=utf-8`。

### 范围说明

本次验证只覆盖 `page-builder-web` 容器迁移到 Node runtime 后的本地构建、启动、HTML shell 与静态资源服务能力。`server` 容器仍使用现有 Bun runtime，后端迁移或老内核兼容处理不属于本变更范围。

### 腾讯云 amd64 镜像推送与服务器验证

- 本地 amd64 构建 tag：`ai-page-builder/web:v202606301447-web-node22`
- 推送版本镜像：`ccr.ccs.tencentyun.com/ai-page-builder/page-builder-web:v202606301447-web-node22`
- 推送 latest 镜像：`ccr.ccs.tencentyun.com/ai-page-builder/page-builder-web:latest`
- 镜像 digest：`sha256:3d7c1592322247372d051a4296e28d3e7fe999b2a151a65732fff6b1999587cc`
- 服务器拉取后镜像架构：`amd64`
- 服务器只重建 `web` 服务：`docker-compose up -d --no-deps --force-recreate web`
- 服务器 Web 容器状态：`running`，`ExitCode=0`，`RestartCount=0`
- 服务器 Web 容器 Node 版本：`v22.23.1`
- 服务器 `http://127.0.0.1:3333/` 响应：HTTP 200，返回 PageBuilder HTML shell，并包含 runtime config。
- 复查 20 秒后 Web 容器仍保持 `Up`，未进入重启循环。
- 注意：服务器 `server` 容器仍处于 Bun runtime 相关失败重启状态，不属于本次 Web 镜像验证范围。
