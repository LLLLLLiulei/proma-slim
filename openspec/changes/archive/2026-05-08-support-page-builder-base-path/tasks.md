## 1. Base Path 基础工具

- [x] 1.1 增加 PageBuilder public base path 规范化工具，覆盖空值、`/`、`pagebuilder`、`/pagebuilder`、`/pagebuilder/` 等输入。
- [x] 1.2 增加 path prepend/strip helper，确保 `/pagebuilder/*` 只剥离一次，且不会把 `/pagebuilder/pagebuilder/*` 错误剥离为内部路径。
- [x] 1.3 为 base path helper 增加单元测试，覆盖 root mode、base path mode、重复前缀和非法路径边界。

## 2. PageBuilder Web 与 Vite 构建

- [x] 2.1 修改 `apps/page-builder/vite.config.ts`，使 Vite 构建产物使用 runtime-neutral 的相对资源 base，并让 dev proxy 支持可选 public base path API 前缀。
- [x] 2.2 修改 `apps/page-builder/src/server/prod-server.ts`，支持运行时配置 public base path、注入 HTML runtime config，并在直接收到 `/pagebuilder/*` 时剥离后处理。
- [x] 2.3 保持 PageBuilder Web upstream 根相对路径兼容，确保 Nginx strip-prefix 后的 `/`、`/builder/*`、`/assets/*`、`/api/*` 仍按现有行为工作。
- [x] 2.4 扩展 `apps/page-builder/src/server/prod-server.test.ts`，覆盖 `/pagebuilder/`、`/pagebuilder/builder/*`、`/pagebuilder/assets/*`、`/pagebuilder/api/*` 和重复前缀不误剥离。

## 3. Renderer 路由、导航与 API Client

- [x] 3.1 修改 `apps/page-builder/src/renderer/lib/routes.ts`，支持按 public base path 解析首页、builder 路由，并构建首页与 builder 导航地址。
- [x] 3.2 修改 `App.tsx`、`HomePage.tsx`、`BuilderPage.tsx` 和历史项目打开逻辑，使 `pushState`、返回首页、打开 builder 都保留 public base path。
- [x] 3.3 修改共享 `apps/app/src/renderer/lib/api.ts`，让逻辑 `/api/*` 仅在 PageBuilder renderer 显式启用 public base path 时解析为 `${basePath}/api/*`，同时保持主应用和 root mode 不变。
- [x] 3.4 补充 renderer route、首页跳转、历史项目打开和 API client 测试，验证 root mode 与 `/pagebuilder` mode 均可用。

## 4. Preview 与 Runtime URL

- [x] 4.1 修改 `workspace-preview-service.ts`，使 preview state `entryUrl` 按 public base path 返回浏览器可访问 URL。
- [x] 4.2 修改 `page-builder-project-service.ts`，使首页历史项目返回的 `previewUrl` 按 public base path 返回浏览器可访问 URL，并确保历史卡片 iframe 与新窗口预览使用该 URL。
- [x] 4.3 修改 CMS 资源代理 URL 生成逻辑，使预览 HTML 中重写后的 CMS asset proxy URL 支持 public base path。
- [x] 4.4 修改 `page-builder-preview-bridge.ts`，使 preview bridge script URL 支持 public base path。
- [x] 4.5 修改 `page-builder-cms-rendering-preview.ts`，使 CMS rendering preview bootstrap 和 Vue runtime script URL 支持 public base path。
- [x] 4.6 补充 preview state、历史项目 `previewUrl`、CMS asset proxy、preview bridge、CMS rendering preview runtime URL 的 root mode 与 `/pagebuilder` mode 测试。

## 5. Docker 与部署说明

- [x] 5.1 更新 `build/.env.example`，新增 `AI_PAGE_BUILDER_BASE_PATH` 示例并说明未配置时保持根路径。
- [x] 5.2 更新 PageBuilder Web Docker 构建/运行配置，使 web 镜像不在构建期固化 base path，`AI_PAGE_BUILDER_BASE_PATH` 仅作为运行期配置传入 Web 和 Server。
- [x] 5.3 在部署说明或相关注释中明确生产推荐 Nginx/CMS 网关 `location /pagebuilder/` 反代并剥离前缀，PageBuilder upstream 仍接收根相对路径。
- [x] 5.4 补充 Docker 资产测试，确认示例配置暴露 `AI_PAGE_BUILDER_BASE_PATH` 且不要求 `apps/app` 后端接收 `/pagebuilder/api/*`。

## 6. 验证

- [x] 6.1 运行与 PageBuilder Web、renderer route、API client、preview URL 和 runtime URL 相关的单元测试。
- [x] 6.2 运行 `openspec status --change support-page-builder-base-path`，确认 artifacts 完整且 change 已准备进入 apply。
- [x] 6.3 记录未执行或受环境限制无法执行的验证项，供 apply 阶段继续处理。

验证记录：

- 已执行 targeted unit tests：shared base path helper、PageBuilder Web、Vite runtime-neutral base、renderer route/home/history/builder、shared API client、preview state、history `previewUrl`、preview bridge、CMS rendering runtime URL、静态导出下载 URL、Docker asset tests。
- 已执行 typecheck：`@ai-page-builder/shared`、`@ai-page-builder/page-builder`、`@ai-page-builder/app`。
- 已执行 OpenSpec strict validation 和 change status 检查。
- 未执行真实 Docker image build、Nginx/CMS Gateway 联调或浏览器 E2E；本 change 已通过 Docker asset tests 验证配置传递和文档约束，真实部署联调可在后续 Docker/E2E 收口阶段执行。
