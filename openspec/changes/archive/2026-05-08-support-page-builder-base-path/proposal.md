## Why

PageBuilder 第一阶段 CMS 集成要求浏览器能够通过 CMS 同源路径（例如 `/pagebuilder`）访问构建页、静态资源、API、预览和运行时脚本；但当前 PageBuilder 前端、Web 代理和服务端返回的浏览器 URL 均默认根路径 `/`。如果不先支持 public base path，后续 handoff、access cookie、preview 和 Docker 联调都会在路径层面出现不一致。

## What Changes

- 支持可选的 PageBuilder public base path，例如 `/pagebuilder`，同时保持未配置 base path 时的 standalone 根路径行为。
- 明确生产推荐由 Nginx/CMS 网关在 `location /pagebuilder/` 下反向代理并剥离前缀；PageBuilder Web upstream 继续处理根相对的 `/`、`/builder/*`、`/assets/*`、`/api/*`。
- PageBuilder Web 增加未剥离 base path 的直连兼容能力，便于本地测试或无 Nginx 场景下直接访问 `/pagebuilder/*`。
- PageBuilder renderer 在解析地址、导航首页、进入 builder、打开历史项目和发起 API 请求时使用 public base path。
- PageBuilder Web 镜像使用 runtime-neutral 的相对静态资源构建，并由生产 Web server 在响应 HTML 时注入当前 public base path，使同一镜像可在不同 base path 下复用。
- 服务端返回给浏览器的 preview `entryUrl`、历史项目 `previewUrl`、preview bridge 资产 URL、CMS rendering preview/Vue 资产 URL 和离线静态导出下载 URL 使用 public base path。
- 保持 `apps/app` 后端内部 API 路由只接收 `/api/*`，不新增 `/pagebuilder/api/*` 后端路由。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-docker-deployment`: 增加 PageBuilder public base path 的部署约定、Nginx strip-prefix 推荐模型和 Docker/env 示例要求。
- `web-server`: 增加 PageBuilder Web 在 public base path 下代理 API、返回 SPA fallback 和静态资源的要求，同时保持 upstream root-relative 路由。
- `page-builder-app`: 增加 PageBuilder renderer 路由解析、导航和 API client 对 public base path 的支持要求。
- `page-builder-offline-static-export`: 增加导出任务下载 URL 对 public base path 的支持要求。
- `page-builder-live-preview`: 增加 workspace preview 状态返回的浏览器可访问 `entryUrl` 必须 public base path 感知的要求。
- `page-builder-preview-bridge-runtime`: 增加 preview bridge 资产 URL 必须 public base path 感知的要求。
- `page-builder-cms-rendering-preview`: 增加 CMS rendering preview 和 Vue 运行时资产 URL 必须 public base path 感知的要求。

## Impact

- 受影响代码包括 PageBuilder Vite 配置、生产 Web server、renderer 路由与导航、共享 API client、preview state/preview URL 生成、preview bridge 资产 URL、CMS rendering preview 资产 URL、离线静态导出下载 URL、Docker env 示例和相关测试。
- 不改变现有 `apps/app` REST API 路径、session/workspace/page-builder API 响应结构、handoff/access session、CMS project binding、edit lock 或同步导出行为。
- 生产部署需要在 Nginx/CMS 网关层明确 `/pagebuilder/` 到 PageBuilder Web 的 strip-prefix 反向代理语义；Change 1 仅提供应用侧 public base path 支持，不落地真实生产 Nginx 配置。
