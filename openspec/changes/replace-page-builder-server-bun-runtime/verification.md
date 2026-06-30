# Verification: replace-page-builder-server-bun-runtime

验证日期：2026-06-30

## 本地代码验证

- `openspec validate replace-page-builder-server-bun-runtime --strict`：通过。
- 单元测试：通过，`145 pass, 0 fail`。
  - `apps/app/src/main/http/app.test.ts`
  - `apps/app/src/main/http/routes/page-builder.test.ts`
  - `apps/app/src/main/http/routes/cms-integration.test.ts`
  - `apps/app/src/main/lib/workspace-preview-service.test.ts`
  - `apps/app/src/main/lib/page-builder-docker-assets.test.ts`
  - `apps/app/src/main/http/static-handler.test.ts`
  - `apps/app/src/main/http-server.test.ts`
  - `apps/app/src/main/lib/page-builder-cms-rendering-preview.test.ts`
- `bun run typecheck`：通过。

## 本地 Docker 验证

- 本地构建 `ai-page-builder-server:node-runtime-local`：通过。
- 本地运行 `proma-server-node-runtime-local`：通过。
- `http://127.0.0.1:18888/api/status`：返回 `200`，`ok=true`，`sdkCliAvailable=true`。
- 容器运行时：Node `22.23.1`，未依赖 Bun CLI。
- 已验证 Node runtime 容器内以下资源可用：
  - `/api/page-builder/preview-bridge.js`
  - `/api/page-builder/cms-rendering-preview.js`
  - `/api/page-builder/cms-rendering-vue.js`
  - workspace preview HTML/CSS
  - static export zip download
  - standalone 历史列表 API `/api/page-builder/projects`

## 腾讯云镜像验证

- 构建并推送 `linux/amd64` server 镜像：通过。
- 版本 tag：`ccr.ccs.tencentyun.com/ai-page-builder/page-builder-server:v202606301624`
- `latest` tag：已同步推送。
- registry digest：`sha256:f4c8063b75605c7bfc7204b0c3acf4386806c1965ddb4629acb12f62c2be1a89`

## 远端 server 验证

服务器上仅重建 `server` 服务后验证，未修改数据目录或迁移历史数据。

- `page-builder-server` 镜像：`ccr.ccs.tencentyun.com/ai-page-builder/page-builder-server:v202606301624`
- 容器状态：`running=true`，`restarting=false`，`restartCount=0`
- 容器内访问 `http://127.0.0.1:8888/api/status`：返回 `200`
- 状态摘要：`ok=true`，`apiKeyConfigured=true`，`sdkCliAvailable=true`
- 运行时：Node `v22.23.1`，Bun 不可用，符合 Node runtime 目标

## 远端 web 联动验证

远端 `web` 服务未重启，仅在容器内通过 `127.0.0.1:3333` 做只读访问验证。

- 首页 `/`：返回 `200`
- Builder SPA fallback `/builder/smoke-workspace/smoke-session`：返回 `200`
- `/api/status` 通过 web 代理：返回 `200`，`ok=true`，`sdkCliAvailable=true`
- `/api/page-builder/preview-bridge.js` 通过 web 代理：返回 `200`
- 远端当前为 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `NODE_ENV=production`，因此 `/api/page-builder/projects` 按 CMS 安全规则返回 `403`，不直接暴露全量历史项目列表。standalone 模式下历史列表已在本地 Node runtime 容器验证可用。

## 结论

`page-builder-server` 已完成从 Bun runtime 到 Node 22 runtime 的生产运行迁移。当前验证覆盖了本地测试、本地 Node runtime 容器、腾讯云 amd64 镜像、远端 server 容器状态、远端 `/api/status`、web 代理和 preview 资产联动。
