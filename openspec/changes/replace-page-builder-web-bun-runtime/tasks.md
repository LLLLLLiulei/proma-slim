## 1. 依赖与入口设计

- [x] 1.1 在 `apps/page-builder` 中添加 Hono Node server 运行所需依赖，并更新 lockfile
- [x] 1.2 梳理 `prod-server.ts` 当前导出的可测试函数，保留现有 public base path、API 代理和 HTML 注入接口
- [x] 1.3 确认 Web 生产入口运行路径不再需要 `Bun.serve()`、`Bun.file()` 或 Bun CLI

## 2. Web 生产服务改造

- [x] 2.1 将 PageBuilder Web 生产启动逻辑改为 Node.js runtime 下的 Hono Node server
- [x] 2.2 使用 Hono Node 静态服务能力处理普通静态资源，并确保响应内容类型正确
- [x] 2.3 保留自定义 `index.html` 注入逻辑，确保 SPA shell 返回时继续注入 base href 和 runtime config
- [x] 2.4 保留 `/api/*` 代理逻辑，确保 public base path 剥离和 forwarded host/proto 传递不变
- [x] 2.5 保留 SPA fallback 与缺失静态资源 404 语义，避免前端路由和资源请求互相误判

## 3. Docker 镜像改造

- [x] 3.1 修改 `build/Dockerfile.page-builder-web`，构建阶段继续使用 Bun/Vite 并生成 Node 目标入口产物
- [x] 3.2 将 `page-builder-web` runtime stage 切换为轻量 Node.js 镜像，优先使用 `node:22-bookworm-slim`
- [x] 3.3 更新 Web 容器启动命令为 `node` 启动生产入口，不再调用 Bun CLI
- [x] 3.4 确保 runtime stage 仅复制 Web 运行所需 dist、入口产物和必要元数据，不复制构建缓存

## 4. 测试与验证

- [x] 4.1 更新 `prod-server` 单元测试，覆盖 Node/Hono 启动外的核心 handler 行为、HTML 注入和 fallback 语义
- [x] 4.2 更新 Docker 资产测试，断言 Web Dockerfile 使用 Node slim runtime 且不再以 Bun 启动生产入口
- [x] 4.3 运行相关测试与类型检查，确认 PageBuilder Web 改造不破坏现有路由语义
- [x] 4.4 本地构建 `page-builder-web` 镜像并运行容器，确认容器使用 Node 启动、监听端口并能返回基础页面
- [x] 4.5 记录本地镜像构建与容器启动验证结果，明确 `server` 容器迁移不属于本变更
