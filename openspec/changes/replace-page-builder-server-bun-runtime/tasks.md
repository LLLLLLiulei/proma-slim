## 1. 依赖与运行时边界

- [x] 1.1 在 `apps/app/package.json` 中添加 Node/Hono server 运行依赖，并更新 `bun.lock`
- [x] 1.2 梳理 `apps/app/src/main` 中所有生产运行路径的 Bun API 使用点，确认 `Bun.serve()`、`Bun.file()`、`Bun.build()` 的替换范围
- [x] 1.3 确认 Agent SDK CLI、`sharp` 等运行期依赖在 Node bundle 策略下需要保留为 runtime `node_modules` 依赖

## 2. HTTP server 迁移

- [x] 2.1 将 `apps/app/src/main/http-server.ts` 从 `Bun.serve()` 改为 `@hono/node-server` 启动 Hono app
- [x] 2.2 为 Node server 返回兼容现有调用方的 server handle，包含 `port` 与 `stop(force?)`
- [x] 2.3 保持 `apps/app/src/main/index.ts` 的 shutdown 流程语义不变，确保关闭前仍调用 `stopAllAgents()`
- [x] 2.4 增加或更新 HTTP server 相关测试，覆盖 Node server wrapper 的启动参数和关闭接口

## 3. Node 文件响应能力

- [x] 3.1 新增统一的 Node 兼容文件响应 helper，支持 stream body、调用方 headers 透传和普通静态资源 content-type 补齐
- [x] 3.2 替换 `apps/app/src/main/http/static-handler.ts` 中的 `Bun.file()`，保持生产静态资源和 SPA fallback 语义
- [x] 3.3 替换 workspace 静态导出下载、CMS export 下载、workspace preview 和 template preview 中的 `Bun.file()`
- [x] 3.4 补充测试覆盖普通静态资源、workspace preview 非 HTML 资源、template preview 非 HTML 资源和 zip 下载响应

## 4. Preview 资产预构建

- [x] 4.1 为 CMS rendering preview bootstrap 增加预生成资产路径覆盖配置，运行时优先读取该资产
- [x] 4.2 复用 preview bridge 已有资产路径覆盖配置，确保 Node runtime 不触发动态 `Bun.build()` fallback
- [x] 4.3 增加构建脚本或 Dockerfile 构建步骤，生成 `page-builder-preview-bridge.js` 与 `cms-rendering-preview.js`
- [x] 4.4 补充测试覆盖预生成资产读取、资产版本变化和未配置覆盖路径时本地 Bun fallback 行为

## 5. Docker server 镜像改造

- [x] 5.1 修改 `build/Dockerfile.page-builder-app`，构建阶段生成 Node 目标 server bundle
- [x] 5.2 将 `page-builder-server` runtime stage 切换为 `node:22-bookworm-slim`，并保留 `ca-certificates`、`git` 等现有运行依赖
- [x] 5.3 设置 Node runtime 所需的内置资源路径环境变量，包括 default skills、workspace templates、preview bridge 和 CMS rendering preview 资产
- [x] 5.4 保留 `/home/bun/.ai-page-builder` 数据卷路径、`AI_PAGE_BUILDER_CONFIG_DIR`、`AI_PAGE_BUILDER_SDK_HOME`、端口和 compose 服务间地址语义
- [x] 5.5 将 server 容器启动命令改为直接执行 `node` 启动 bundle，不再调用 `bun run start`

## 6. Docker 资产与文档测试

- [x] 6.1 更新 `apps/app/src/main/lib/page-builder-docker-assets.test.ts`，断言 server Dockerfile 使用 Node 22 slim runtime 且不再以 Bun 启动
- [x] 6.2 更新 Docker 资产测试，断言 server runtime 保留数据卷路径、Agent SDK env 白名单和资源路径配置
- [x] 6.3 确认 `build/docker-compose.yml` 与 `build/docker-compose.release.yml` 不需要改变服务名、镜像名、端口或环境变量边界
- [x] 6.4 如 Docker 部署文档提到 server Bun runtime，更新为“构建阶段 Bun、运行阶段 Node 22”的描述

## 7. 本地验证

- [x] 7.1 运行相关单元测试：HTTP app/routes、workspace preview、page-builder routes、CMS integration routes、Docker 资产测试
- [x] 7.2 运行 `bun run typecheck`，确认 TypeScript 类型检查通过
- [x] 7.3 本地构建 `page-builder-server` 镜像，确认 runtime stage 使用 Node 22 且镜像构建通过
- [x] 7.4 本地运行 server 容器，验证容器不依赖 Bun CLI、监听 `8888`、`/api/status` 可访问且 SDK CLI 可发现
- [x] 7.5 验证 preview bridge、CMS rendering preview、workspace preview 静态资源和 zip 下载在 Node runtime 容器内可用

## 8. 远程镜像与回归验证

- [x] 8.1 构建 `linux/amd64` server 镜像并推送到腾讯云 `page-builder-server` 版本 tag 与 `latest`
- [x] 8.2 在服务器只重建 `server` 服务，验证容器状态为 running 且不再重启
- [x] 8.3 通过服务器本机访问 `http://127.0.0.1:8888/api/status`，确认 Node runtime、SDK CLI 和基础 API 正常
- [x] 8.4 联动已迁移的 `web` 服务验证首页、历史列表、builder 页面和 `/api/*` 代理可用
- [x] 8.5 将本地与服务器验证结果记录到 change 的验证文档或后续归档说明中
