# PageBuilder Build 使用说明

本文档集中说明 `build/` 目录下的 Docker、脚本、镜像发布和本地验证流程。适用范围包括：

- 本地 standalone 模式运行 PageBuilder。
- 本地 CMS 集成模式运行 PageBuilder。
- 使用 CMS mock + nginx 验证 handoff、preview、导出等集成链路。
- 构建本地 Docker 镜像。
- 推送镜像到腾讯云 CCR。
- 使用 release compose 部署远端镜像。
- 独立构建和运行 PageBuilder MCP Server。

## 目录结构

| 文件 | 用途 |
| --- | --- |
| `start-page-builder.sh` | 本地启动入口，默认读取 `.env.standalone.example` 并启动 `server`、`playwright`、`web`。 |
| `build-page-builder-multiarch.sh` | 构建 PageBuilder server/web 镜像并加载到本地 Docker。当前本地 `--load` 流程一次只支持一个平台。 |
| `push-page-builder-tencent.sh` | 将本地镜像重新打 tag 并推送到腾讯云 CCR。 |
| `Dockerfile.page-builder-app` | 构建后端 server 镜像，运行 `@ai-page-builder/app`。 |
| `Dockerfile.page-builder-web` | 构建 PageBuilder web 镜像，运行生产 `prod-server.mjs`。 |
| `Dockerfile.pagebuilder-mcp-server` | 构建独立 PageBuilder MCP Server 镜像，运行 `@ai-page-builder/pagebuilder-mcp-server` HTTP 服务。 |
| `docker-compose.yml` | 本地构建并运行的默认 compose。 |
| `docker-compose.release.yml` | 发布部署 compose，直接拉取远端镜像，不在本机构建。 |
| `docker-compose.cms-verify.yml` | CMS 集成验证 compose，包含 `server`、`web`、`playwright`、`cms-mock`、`nginx`。 |
| `docker-compose.pagebuilder-mcp-server.yml` | 独立运行 PageBuilder MCP Server 的 compose 示例，不启动 PageBuilder web/server 主服务。 |
| `.env.standalone.example` | standalone 模式示例配置。 |
| `.env.cms.example` | CMS 集成模式示例配置。 |
| `.env.pagebuilder-mcp-server.example` | 独立 PageBuilder MCP Server 示例配置。 |
| `cms-mock/server.ts` | 本地 CMS mock 服务。 |
| `nginx/cms-verify.conf` | CMS 验证场景下的同源 nginx 入口。 |
| `cms-verify/smoke-test.ts` | CMS 集成 smoke test。 |
| `.cms-verify-data/` | CMS 验证运行态数据目录，保存工作区、会话、binding、导出等数据。 |

## 前置条件

本目录的脚本默认在仓库根目录或任意子目录执行都可以，脚本会自动定位仓库根目录。

需要安装：

```bash
docker --version
docker compose version
docker buildx version
bun --version
```

说明：

- `docker compose` 需要 Docker Compose v2。
- `build-page-builder-multiarch.sh` 和 `start-page-builder.sh --platform ...` 需要 `docker buildx`。
- `cms-verify/smoke-test.ts` 需要宿主机可执行 `bun`。
- 首次构建会拉取构建阶段使用的 `oven/bun:1.2.5`、Web / Server 运行阶段使用的 `node:24-bookworm-slim`、`mcr.microsoft.com/playwright:v1.57.0-jammy`、`nginx:1.29-alpine` 等镜像。

## 环境变量文件

### 安全建议

`build/.env.standalone.example`、`build/.env.cms.example` 和 `build/.env.pagebuilder-mcp-server.example` 是示例配置。当前示例文件里可能包含本地联调用的真实地址、账号、token 或第三方图片平台 key。生产或联调时建议使用仓库外的私有 env 文件，例如：

```bash
cp build/.env.standalone.example /tmp/page-builder-standalone.env
cp build/.env.cms.example /tmp/page-builder-cms.env
cp build/.env.pagebuilder-mcp-server.example /tmp/pagebuilder-mcp-server.env
```

然后编辑 `/tmp/page-builder-standalone.env`、`/tmp/page-builder-cms.env` 或 `/tmp/pagebuilder-mcp-server.env`，再通过 `--env-file` 指定。不要把真实密钥写入将要提交的 example 文件。

另外，Docker 构建上下文是仓库根目录。如果把私有 env 文件放在仓库内，请确认它已经被 `.gitignore` 和 `.dockerignore` 排除，否则可能进入构建上下文。

当前 Docker Compose 不使用 `server.env_file` 直接注入整份 env 文件；需要进入 `server` 容器的变量会在 `server.environment` 中显式声明，`--env-file` 只负责为 compose 变量替换提供取值。

注意：Docker Compose 做变量替换时，宿主机同名环境变量可能优先于 `--env-file`。内置 `./build/start-page-builder.sh` 会在调用 compose 前清理本期支持的 Agent SDK env、AI providers 配置文件入口和旧兼容变量，确保指定 env 文件中的模型、凭证、配置文件路径和 timeout 配置优先生效。直接手写 `docker compose --env-file ...` 命令时，如宿主机已设置同名 `ANTHROPIC_*`、`CLAUDE_CODE_*` 或 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE`，需要先手动 `unset` 或改用启动脚本。

### 关键变量

| 变量 | 说明 |
| --- | --- |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` | Agent SDK 凭证，二选一即可。`ANTHROPIC_AUTH_TOKEN` 适合 DeepSeek 等 Bearer token 网关。 |
| `ANTHROPIC_BASE_URL` | 可选。Anthropic-compatible 接口地址，例如 `https://api.deepseek.com/anthropic`。 |
| `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_*_MODEL` | 可选。Agent SDK 模型与 sonnet/opus/haiku 别名映射。 |
| `CLAUDE_CODE_SUBAGENT_MODEL` / `CLAUDE_CODE_EFFORT_LEVEL` / `CLAUDE_CODE_AUTO_COMPACT_WINDOW` / `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` / `API_TIMEOUT_MS` | 可选。透传给 Agent SDK 的受支持运行参数。 |
| `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE` | 可选。指向 server 容器内挂载的 AI providers JSONC，用于启用 PageBuilder 对话框多 provider / 多模型切换，并可通过 `runtimeMcp.pagebuilder` 启用 `generate_image` / `analyze_image`；标准 JSON 文件仍兼容。 |
| `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` / `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL` | 兼容旧配置。仅当官方 `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` 未设置时作为 fallback。 |
| `PAGE_BUILDER_PORT` | web 服务映射到宿主机的端口，默认 `3333`。 |
| `AI_PAGE_BUILDER_HOST_DATA_DIR` | 宿主机持久化数据目录，会挂载到容器 `/home/bun/.ai-page-builder`。 |
| `AI_PAGE_BUILDER_BASE_PATH` | 浏览器公开访问路径前缀。根路径部署留空，子路径可填 `/pagebuilder`。 |
| `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` | 可选。Builder 工作台工具栏隐藏项，逗号分隔；standalone 留空表示全部展示，CMS 模式建议默认 `saveTemplate,export,projectName`。支持 `pcPreview,mobilePreview,select,refresh,openInNewWindow,export,saveTemplate,chatTab,codeTab,projectName`。 |
| `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB` | 模板 ZIP 导入原始文件大小上限，单位 MB，默认 `100`。 |
| `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB` | 模板 ZIP 解压后累计文件大小上限，单位 MB，默认 `500`。 |
| `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL` | server 访问 Playwright MCP sidecar 的地址，默认 `http://playwright:8931/mcp`。 |
| `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` | server/agent 在 Docker 网络内访问后端预览接口的 origin，默认 `http://server:8888`。 |
| `IMAGE_SEARCH_PROVIDERS` | 图片搜索平台白名单，例如 `pexels,pixabay`。 |
| `PEXELS_API_KEY` / `PIXABAY_API_KEY` / `UNSPLASH_ACCESS_KEY` | 图片搜索平台密钥。 |

CMS 模式额外使用：

| 变量 | 说明 |
| --- | --- |
| `AI_PAGE_BUILDER_INTEGRATION_MODE` | 设置为 `cms` 时启用 CMS 集成模式。standalone 模式留空。 |
| `AI_PAGE_BUILDER_INTEGRATION_SECRET` | CMS 服务端调用 PageBuilder 集成 API 的 Bearer Token。 |
| `AI_PAGE_BUILDER_CMS_BASE_URL` | CMS 管理端 base URL，例如 `https://cms.example.com/manager`。 |
| `AI_PAGE_BUILDER_PUBLIC_ORIGIN` | 浏览器可访问的 PageBuilder origin，只能包含协议、域名、端口，不能带 path。 |
| `AI_PAGE_BUILDER_HANDOFF_TTL_MS` | CMS handoff URL 有效期，单位毫秒。 |
| `AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS` | CMS access session 有效期，单位毫秒。 |
| `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS` | CMS access session 滑动续期阈值，单位毫秒。 |
| `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` | CMS 同步导出接口服务端超时，单位毫秒。 |
| `AI_PAGE_BUILDER_CMS_USERNAME` / `AI_PAGE_BUILDER_CMS_PASSWORD` | PageBuilder server 访问 CMS 管理接口使用的账号。 |

CMS mock 验证额外使用：

| 变量 | 说明 |
| --- | --- |
| `CMS_VERIFY_PORT` | nginx 入口映射到宿主机的端口，默认 `8088`。 |
| `CMS_VERIFY_PUBLIC_ORIGIN` | CMS verify 模式下浏览器实际访问的 origin，默认 `http://localhost:8088`。 |
| `CMS_VERIFY_COOKIE` | mock CMS 登录态 cookie。 |
| `CMS_VERIFY_ORIGIN` | smoke test 请求的 origin，默认 `http://localhost:8088`。 |
| `CMS_VERIFY_BASE_PATH` | smoke test 请求的 base path，默认 `/pagebuilder`。 |
| `AI_PAGE_BUILDER_CMS_VERIFY_CONFIG_DIR` | smoke test 读取/写入验证数据的目录，默认 `build/.cms-verify-data`。 |

## 本地运行

### 独立 PageBuilder MCP Server

该服务是独立 MCP HTTP 服务，当前不会自动接入 PageBuilder Agent runtime，也不会修改默认 PageBuilder `server` / `web` / `playwright` 启动链路。

使用示例 env 启动：

```bash
docker compose \
  --env-file build/.env.pagebuilder-mcp-server.example \
  -f build/docker-compose.pagebuilder-mcp-server.yml \
  up -d --build
```

启动完成后检查健康状态：

```bash
curl http://localhost:3000/healthz
```

默认 MCP endpoint 为：

```text
http://localhost:3000/mcp
```

可通过 `PAGEBUILDER_MCP_PUBLISHED_PORT` 修改宿主机映射端口，通过 `PAGEBUILDER_MCP_PORT` 修改容器内监听端口。`Z_AI_*` 变量是 ZHIPU/ZAI 兼容接口的供应商配置变量，不代表当前服务产品名。

### runtimeMcp.pagebuilder

默认 PageBuilder `server` 进程会在 provider key 可用时按需注册宿主 runtime `pagebuilder` MCP，首期只暴露 `generate_image` 与 `analyze_image`。该 runtime MCP 不依赖默认 compose 中的独立 `pagebuilder-mcp-server` sidecar，也不会写入 workspace `mcp.json`。

如需启用该能力，推荐在 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE` 指向的 AI providers JSONC 中配置 `runtimeMcp.pagebuilder`。该配置段独立于对话模型 `providers[]`，不会随用户在前端切换聊天模型而改变生图或视觉理解 provider。

默认 compose 不再透传 `Z_AI_API_KEY`、`ALIYUN_API_KEY` 等 PageBuilder MCP provider 平铺变量。最直接的做法是把 provider key 写入受控挂载的 AI providers JSONC；如使用 `apiKeyEnv` 或 `authTokenEnv`，需要确保对应环境变量已经通过 compose override、secret 注入或其他方式进入 `server` 容器。

未配置 provider key 时 Agent 会把 pagebuilder runtime MCP 工具视为未安装能力：不会注册 `pagebuilder` runtime MCP，不会把 `mcp__pagebuilder__generate_image` / `mcp__pagebuilder__analyze_image` 加入 allowed tools，也不会在动态提示词中提示调用或安装该 MCP。

### standalone 模式

standalone 模式适合不通过 CMS handoff 直接打开 PageBuilder。首页会展示输入框和历史记录，不校验 CMS access session。

推荐使用启动脚本：

```bash
./build/start-page-builder.sh --env-file /tmp/page-builder-standalone.env
```

如果只是快速使用示例文件：

```bash
./build/start-page-builder.sh
```

脚本默认等价于：

```bash
env -u ANTHROPIC_BASE_URL \
  -u ANTHROPIC_AUTH_TOKEN \
  -u ANTHROPIC_API_KEY \
  -u ANTHROPIC_MODEL \
  -u ANTHROPIC_DEFAULT_OPUS_MODEL \
  -u ANTHROPIC_DEFAULT_SONNET_MODEL \
  -u ANTHROPIC_DEFAULT_HAIKU_MODEL \
  -u CLAUDE_CODE_SUBAGENT_MODEL \
  -u CLAUDE_CODE_EFFORT_LEVEL \
  -u CLAUDE_CODE_AUTO_COMPACT_WINDOW \
  -u CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC \
  -u API_TIMEOUT_MS \
  -u AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE \
  -u AI_PAGE_BUILDER_ANTHROPIC_API_KEY \
  -u AI_PAGE_BUILDER_ANTHROPIC_BASE_URL \
  docker compose \
  --env-file build/.env.standalone.example \
  -f build/docker-compose.yml \
  up -d --build server playwright web
```

启动完成后访问：

```text
http://localhost:3333/
```

如果 env 中设置了 `PAGE_BUILDER_PORT=3344`，则访问：

```text
http://localhost:3344/
```

如果 env 中设置了 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`，则访问：

```text
http://localhost:3333/pagebuilder/
```

### CMS 集成模式

CMS 集成模式会启用入口门禁。浏览器不能直接从首页进入完整工作流，必须由 CMS 后端调用集成 API 创建 project binding 和 handoff，再通过 `openUrl` 进入 builder 或 preview。

启动：

```bash
./build/start-page-builder.sh --env-file /tmp/page-builder-cms.env
```

或直接使用 compose：

```bash
docker compose \
  --env-file /tmp/page-builder-cms.env \
  -f build/docker-compose.yml \
  up -d --build server playwright web
```

关键要求：

- `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`。
- `AI_PAGE_BUILDER_INTEGRATION_SECRET` 必须和 CMS 服务端一致。
- `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 必须等于浏览器实际访问的 origin，不能包含 `/pagebuilder` 之类的 path。
- `AI_PAGE_BUILDER_BASE_PATH` 必须和网关或 nginx 挂载路径一致。
- `server` 和 `web` 需要使用同一个 `AI_PAGE_BUILDER_BASE_PATH`。

### 指定构建平台后启动

在 Apple Silicon 机器上需要构建 Linux amd64 镜像时，可以使用：

```bash
./build/start-page-builder.sh \
  --env-file /tmp/page-builder-standalone.env \
  --platform linux/amd64
```

这个流程会先执行两次 `docker buildx build --load`，分别构建：

- `ai-page-builder-server`
- `ai-page-builder-web`

然后用 `docker compose up -d --no-build server playwright web` 启动。

### 查看状态、日志和停止

默认 compose 项目名是 `ai-page-builder`。

查看容器：

```bash
docker compose -f build/docker-compose.yml ps
```

查看日志：

```bash
docker compose -f build/docker-compose.yml logs -f server
docker compose -f build/docker-compose.yml logs -f web
docker compose -f build/docker-compose.yml logs -f playwright
```

重启：

```bash
docker compose -f build/docker-compose.yml restart server web playwright
```

停止但保留数据：

```bash
docker compose -f build/docker-compose.yml down
```

删除本地镜像需要显式执行 `docker image rm ...`，`down` 不会删除镜像。

## CMS mock 本地验证

CMS mock 验证用于在本地验证 CMS 同源部署、handoff、access session、workspace preview、CMS asset proxy 和同步导出。

### 启动验证栈

```bash
docker compose \
  --env-file /tmp/page-builder-cms.env \
  -f build/docker-compose.cms-verify.yml \
  up -d --build server playwright web cms-mock nginx
```

如果直接使用示例 env：

```bash
docker compose \
  --env-file build/.env.cms.example \
  -f build/docker-compose.cms-verify.yml \
  up -d --build server playwright web cms-mock nginx
```

验证栈包含：

| 服务 | 说明 |
| --- | --- |
| `cms-verify-server` | PageBuilder 后端，固定 CMS 模式。 |
| `cms-verify-web` | PageBuilder web，固定 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`。 |
| `cms-verify-playwright` | Playwright MCP sidecar。 |
| `cms-verify-cms-mock` | CMS mock，提供 `/manager/*` API。 |
| `cms-verify-nginx` | 同源入口，暴露 `${CMS_VERIFY_PORT:-8088}:8080`。 |

默认入口：

```text
http://localhost:8088/cms-mock/
http://localhost:8088/pagebuilder/
```

如果 `CMS_VERIFY_PUBLIC_ORIGIN` 使用本地域名，例如 `http://localhost.var123.cn:8088`，浏览器和 smoke test 也应该使用同一个 origin。

### nginx 路由关系

验证 nginx 的路由是：

| 路径 | 上游 |
| --- | --- |
| `/pagebuilder/` | `web:3333` |
| `/manager/` | `cms-mock:8890` |
| `/cms-mock/` | `cms-mock:8890` |
| `/` | 302 到 `/cms-mock/` |

`/pagebuilder/` 会保留 base path 转发给 web。web 负责剥离一次 base path，再把 `/api/*` 转发到 server。不要把 nginx 配成直接转发 `/pagebuilder/api/*` 到后端 server。

### 手动验证

打开：

```text
http://localhost:8088/cms-mock/
```

页面提供四个入口：

- builder iframe
- builder window
- preview iframe
- preview window

点击后，mock CMS 会调用：

```text
POST /pagebuilder/api/integrations/cms/projects
POST /pagebuilder/api/integrations/cms/projects/:projectId/handoffs
```

成功后会生成 handoff `openUrl`，并在 iframe 或新窗口中打开 builder/preview。

### 自动 smoke test

先确认验证栈已经启动，然后运行：

```bash
bun build/cms-verify/smoke-test.ts
```

如果使用自定义 origin：

```bash
CMS_VERIFY_ORIGIN=http://localhost.var123.cn:8088 \
bun build/cms-verify/smoke-test.ts
```

smoke test 会检查：

- nginx 入口是否可访问。
- CMS project binding 是否创建成功。
- `build/.cms-verify-data/integrations/cms/projects.json` 是否写入绑定。
- builder handoff 在 iframe/window 两种模式下是否返回 302。
- preview handoff 在 iframe/window 两种模式下是否返回 302。
- access cookie 是否带正确 `Path=/pagebuilder`。
- HTTP 验证环境下 cookie 不应带 `Secure`。
- builder/preview 响应是否允许同源 iframe。
- 未带 access cookie 直连敏感 URL 是否返回 401。
- workspace-scoped CMS asset proxy 是否可用。
- CMS 同步导出接口是否返回 ZIP。

### 清理验证栈

停止容器：

```bash
docker compose -f build/docker-compose.cms-verify.yml down
```

清理验证运行数据：

```bash
rm -rf build/.cms-verify-data
```

`build/.cms-verify-data/` 已在 `.gitignore` 中忽略。删除它会清空本地验证产生的 workspace、session、binding 和导出文件。

## 构建镜像

### 使用专用构建脚本

默认构建 `linux/amd64`，镜像前缀为 `ai-page-builder`，tag 为当前时间戳：

```bash
./build/build-page-builder-multiarch.sh
```

等价输出类似：

```text
ai-page-builder/server:vYYYYMMDDHHMM
ai-page-builder/server:latest
ai-page-builder/web:vYYYYMMDDHHMM
ai-page-builder/web:latest
```

指定 tag：

```bash
./build/build-page-builder-multiarch.sh --tag v202606171630
```

指定镜像前缀：

```bash
./build/build-page-builder-multiarch.sh \
  --image-prefix registry.example.com/ai-page-builder \
  --tag v1.0.0
```

指定平台：

```bash
./build/build-page-builder-multiarch.sh --platforms linux/amd64
```

当前脚本使用 `docker buildx build --load`，因此一次只支持一个平台。如果传入多个平台，例如 `linux/amd64,linux/arm64`，脚本会直接失败并提示使用 registry push flow。

构建完成后检查镜像：

```bash
docker image ls ai-page-builder/server
docker image ls ai-page-builder/web
```

### 直接使用 Dockerfile 构建

一般不需要绕过脚本。确实需要手动构建时，在仓库根目录执行：

```bash
docker buildx build \
  --platform linux/amd64 \
  --load \
  --tag ai-page-builder/server:v202606171630 \
  --tag ai-page-builder/server:latest \
  --file build/Dockerfile.page-builder-app \
  .

docker buildx build \
  --platform linux/amd64 \
  --load \
  --tag ai-page-builder/web:v202606171630 \
  --tag ai-page-builder/web:latest \
  --file build/Dockerfile.page-builder-web \
  .
```

### 用本地构建镜像启动

`build-page-builder-multiarch.sh` 默认产物是 `ai-page-builder/server:*` 和 `ai-page-builder/web:*`，而 `docker-compose.yml` 默认使用 `ai-page-builder-server` 和 `ai-page-builder-web`。如果要直接配合默认 compose 使用，建议使用：

```bash
./build/start-page-builder.sh --platform linux/amd64
```

该命令会构建默认 compose 需要的镜像名。

如果使用专用构建脚本产出的 `ai-page-builder/server:*` 和 `ai-page-builder/web:*`，则通常用于后续推送或自定义 compose，不直接匹配默认 `docker-compose.yml` 的 image 名称。

## 推送镜像到腾讯云 CCR

### 推送前准备

先构建本地镜像：

```bash
./build/build-page-builder-multiarch.sh --tag v202606171630
```

确认本地有以下镜像：

```bash
docker image inspect ai-page-builder/server:v202606171630
docker image inspect ai-page-builder/web:v202606171630
```

准备腾讯云 CCR 密码：

```bash
export TENCENT_REGISTRY_PASSWORD='your-password'
```

### 推送版本 tag 和 latest

```bash
./build/push-page-builder-tencent.sh --tag v202606171630
```

默认目标：

```text
ccr.ccs.tencentyun.com/ai-page-builder/page-builder-server:v202606171630
ccr.ccs.tencentyun.com/ai-page-builder/page-builder-web:v202606171630
ccr.ccs.tencentyun.com/ai-page-builder/page-builder-server:latest
ccr.ccs.tencentyun.com/ai-page-builder/page-builder-web:latest
```

### 只推版本 tag，不推 latest

```bash
./build/push-page-builder-tencent.sh \
  --tag v202606171630 \
  --no-latest
```

### 覆盖 registry、namespace 或本地前缀

```bash
./build/push-page-builder-tencent.sh \
  --tag v202606171630 \
  --source-prefix ai-page-builder \
  --registry ccr.ccs.tencentyun.com \
  --namespace ai-page-builder \
  --username 100029519653
```

推送脚本会执行：

1. `docker login`。
2. 检查本地 source server/web 镜像是否存在。
3. 将 source 镜像 tag 成目标 CCR 镜像。
4. `docker push` server/web 版本 tag。
5. 默认继续 tag 并 push `latest`。

## 发布部署

发布部署使用 `docker-compose.release.yml`，它不会在部署机器上构建镜像，只拉取远端镜像。

### 准备发布 env

发布 env 至少需要：

```dotenv
PAGE_BUILDER_IMAGE_TAG=v202606171630
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=...
ANTHROPIC_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash
CLAUDE_CODE_EFFORT_LEVEL=max
CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
API_TIMEOUT_MS=3000000
PAGE_BUILDER_PORT=3333
AI_PAGE_BUILDER_HOST_DATA_DIR=/data/ai-page-builder
AI_PAGE_BUILDER_BASE_PATH=
AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS=
AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB=100
AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB=500
AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE=
AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL=http://playwright:8931/mcp
AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=http://server:8888
```

### 多 provider 模型配置文件

如果只配置单个 Anthropic-compatible provider，可继续使用上面的 `ANTHROPIC_*` 官方变量，例如 DeepSeek：

```dotenv
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=your-token
ANTHROPIC_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash
```

如果需要在 PageBuilder 对话框中切换多家 provider 或多个模型，建议创建外部 JSONC 文件并挂载到 server 容器的数据目录，例如宿主机：

```text
/data/ai-page-builder/config/ai-providers.jsonc
```

容器内路径：

```dotenv
AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE=/home/bun/.ai-page-builder/config/ai-providers.jsonc
```

AI providers JSONC 示例：

```jsonc
{
  // 默认模型；如果该模型被禁用或不可用，会自动回退到第一个可用模型。
  "defaultModelOptionId": "deepseek.reasoner",
  "providers": [
    {
      "id": "deepseek",
      "providerType": "deepseek",
      "label": "DeepSeek",
      "runtime": "anthropic-compatible",
      "enabled": true,
      "baseUrl": "https://api.deepseek.com/anthropic",
      "authTokenEnv": "ANTHROPIC_AUTH_TOKEN",
      "defaultOpusModel": "deepseek-v4-pro[1m]",
      "defaultSonnetModel": "deepseek-v4-pro[1m]",
      "defaultHaikuModel": "deepseek-v4-flash",
      "subagentModel": "deepseek-v4-flash",
      "models": [
        {
          "id": "reasoner",
          "label": "DeepSeek Reasoner",
          "model": "deepseek-v4-pro[1m]",
          "enabled": true,
          "contextWindow": 1000000
        },
        {
          // 可临时隐藏不稳定模型，而不删除完整配置。
          "id": "flash",
          "label": "DeepSeek Flash",
          "model": "deepseek-v4-flash",
          "enabled": false,
          "contextWindow": 128000
        }
      ]
    },
    {
      "id": "anthropic",
      "providerType": "anthropic",
      "label": "Anthropic",
      "runtime": "anthropic-compatible",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "models": [
        {
          "id": "sonnet",
          "label": "Claude Sonnet",
          "model": "claude-sonnet-4-5"
        }
      ]
    }
  ],
  "runtimeMcp": {
    "pagebuilder": {
      // 该段用于宿主注入的 mcp__pagebuilder__generate_image / analyze_image。
      // 它独立于上面的对话模型 providers[]，不会随前端聊天模型选择变化。
      "enabled": true,
      "provider": "zhipu",
      "apiKey": "replace-with-zhipu-api-key",
      // 也支持 apiKeyEnv/authTokenEnv，但被引用的环境变量必须已注入 server 容器。
      "vision": {
        "model": "glm-4.6v"
      },
      "image": {
        "model": "glm-image",
        "size": "1280x1280"
      },
      "timeoutMs": 300000,
      "retryCount": 1
    }
  }
}
```

`provider.enabled` 和 `model.enabled` 都是可选字段，仅当值严格为 `false` 时表示禁用；未配置时默认启用。禁用 provider 会隐藏该 provider 下的全部模型；禁用 model 只隐藏该模型。若 `defaultModelOptionId` 指向被禁用的模型，server 会自动回退到第一个可用模型选项。

模型配置文件使用 JSONC 解析，支持 `//` 单行注释、`/* ... */` 块注释和尾随逗号；标准 JSON 也是合法输入。真实 `apiKey` / `authToken` 可以写入外部挂载的 JSONC 文件，也可以通过 `apiKeyEnv` / `authTokenEnv` 引用已经注入 `server` 容器的环境变量。不要把包含真实密钥的 JSONC 文件、env 文件或 compose override 提交到版本库。

CMS 模式还需要：

```dotenv
AI_PAGE_BUILDER_INTEGRATION_MODE=cms
AI_PAGE_BUILDER_INTEGRATION_SECRET=...
AI_PAGE_BUILDER_CMS_BASE_URL=https://cms.example.com/manager
AI_PAGE_BUILDER_PUBLIC_ORIGIN=https://builder.example.com
AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS=saveTemplate,export,projectName
AI_PAGE_BUILDER_HANDOFF_TTL_MS=120000
AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS=28800000
AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS=3600000
AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS=30000
AI_PAGE_BUILDER_CMS_USERNAME=...
AI_PAGE_BUILDER_CMS_PASSWORD=...
```

### 启动发布版本

```bash
docker compose \
  --env-file /path/to/page-builder-release.env \
  -f build/docker-compose.release.yml \
  up -d server playwright web
```

查看发布容器：

```bash
docker compose -f build/docker-compose.release.yml ps
```

查看日志：

```bash
docker compose -f build/docker-compose.release.yml logs -f server
docker compose -f build/docker-compose.release.yml logs -f web
docker compose -f build/docker-compose.release.yml logs -f playwright
```

更新版本：

```bash
docker compose \
  --env-file /path/to/page-builder-release.env \
  -f build/docker-compose.release.yml \
  pull server web

docker compose \
  --env-file /path/to/page-builder-release.env \
  -f build/docker-compose.release.yml \
  up -d server web
```

回滚版本时，修改 env 中的 `PAGE_BUILDER_IMAGE_TAG` 为旧版本 tag，再执行 `pull` 和 `up -d`。

## 数据目录

### 正式运行数据

默认 compose 会把：

```text
${AI_PAGE_BUILDER_HOST_DATA_DIR:-${HOME}/.ai-page-builder}
```

挂载到：

```text
/home/bun/.ai-page-builder
```

这个目录保存：

- Agent sessions。
- Agent workspaces。
- SDK config。
- skills。
- PageBuilder exports。
- CMS project binding。
- CMS handoff/access session runtime store。
- logs。

生产环境建议设置稳定路径：

```dotenv
AI_PAGE_BUILDER_HOST_DATA_DIR=/data/ai-page-builder
```

CMS 模式下，当前文件 runtime store 只适合单 server 实例写入同一个数据目录。不要让多个 server 实例共享写入同一个 `AI_PAGE_BUILDER_HOST_DATA_DIR`，除非后续切换为支持并发语义的外部 store。

### CMS 验证数据

CMS verify compose 固定挂载：

```text
build/.cms-verify-data -> /home/bun/.ai-page-builder
```

该目录只用于本地验证，可以删除重建。

注意：`build/.cms-verify-data/` 已被 `.gitignore` 忽略，但是否进入 Docker 构建上下文取决于 `.dockerignore`。如果该目录里有敏感运行数据，构建正式镜像前应先清理它，或确认 `.dockerignore` 已排除该目录。

## base path 和网关规则

`AI_PAGE_BUILDER_BASE_PATH` 表示浏览器公开路径前缀，不表示后端 server 内部 API 路由也挂到这个 path 下。

正确理解：

- 浏览器请求：`https://example.com/pagebuilder/api/...`
- nginx 转发：保留 `/pagebuilder/` 到 web。
- web 处理：识别并剥离 `/pagebuilder`，再把 `/api/...` 转发到 server。
- server 内部路由：仍然接收 `/api/...`。

CMS 同源嵌入时通常配置：

```dotenv
AI_PAGE_BUILDER_BASE_PATH=/pagebuilder
AI_PAGE_BUILDER_PUBLIC_ORIGIN=https://cms.example.com
```

`AI_PAGE_BUILDER_PUBLIC_ORIGIN` 只能是 origin：

```text
https://cms.example.com
```

不能写成：

```text
https://cms.example.com/pagebuilder
```

如果 public origin 或 base path 配错，常见结果是：

- handoff `openUrl` 跨 origin。
- iframe 被 `frame-ancestors 'self'` 拦截。
- access cookie path 不匹配。
- preview 或 API 请求出现 401/404。

## 验证清单

本地 standalone 验证：

```bash
./build/start-page-builder.sh --env-file /tmp/page-builder-standalone.env
curl -I http://localhost:3333/
docker compose -f build/docker-compose.yml logs --tail=100 server
docker compose -f build/docker-compose.yml logs --tail=100 web
```

CMS mock 验证：

```bash
docker compose \
  --env-file /tmp/page-builder-cms.env \
  -f build/docker-compose.cms-verify.yml \
  up -d --build server playwright web cms-mock nginx

bun build/cms-verify/smoke-test.ts
```

镜像构建验证：

```bash
./build/build-page-builder-multiarch.sh --tag v202606171630
docker image inspect ai-page-builder/server:v202606171630
docker image inspect ai-page-builder/web:v202606171630
```

推送验证：

```bash
export TENCENT_REGISTRY_PASSWORD='your-password'
./build/push-page-builder-tencent.sh --tag v202606171630 --no-latest
```

发布 compose 验证：

```bash
docker compose \
  --env-file /path/to/page-builder-release.env \
  -f build/docker-compose.release.yml \
  up -d server playwright web

docker compose -f build/docker-compose.release.yml ps
```

相关 Bun 测试：

```bash
bun test \
  apps/app/src/main/lib/page-builder-docker-assets.test.ts \
  apps/app/src/main/lib/page-builder-docker-start-script.test.ts
```

## 常见问题

### Agent SDK 凭证未设置

`server` 不再在 compose 变量展开阶段强制要求旧 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY`。应用启动后发起对话时，需要能解析到 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 或旧 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 任一凭证。

处理方式：

```dotenv
ANTHROPIC_AUTH_TOKEN=your-token
# 或
ANTHROPIC_API_KEY=your-key
```

### 端口被占用

修改 env：

```dotenv
PAGE_BUILDER_PORT=3344
```

然后重新启动：

```bash
./build/start-page-builder.sh --env-file /tmp/page-builder-standalone.env
```

CMS verify nginx 端口被占用时修改：

```dotenv
CMS_VERIFY_PORT=8089
CMS_VERIFY_PUBLIC_ORIGIN=http://localhost:8089
```

### `docker buildx is not available`

需要启用 Docker Buildx。Docker Desktop 通常自带 buildx。确认：

```bash
docker buildx version
```

如果只用普通本地 compose 构建，不传 `--platform`，`start-page-builder.sh` 不会额外检查 buildx。

### `This local-load script only supports one platform per run`

`build-page-builder-multiarch.sh` 使用 `docker buildx build --load`，Docker 本地 image store 不能在同一个 tag 下保存多平台 manifest。处理方式：

- 一次只传一个平台，例如 `--platforms linux/amd64`。
- 需要真正多平台 manifest 时，改用 registry push 流程。

### Playwright sidecar 找不到 Chromium

compose 中会在 `/ms-playwright/chromium-*` 下查找 Chromium。如果失败，通常是 Playwright 镜像版本或镜像内容异常。先检查 sidecar 日志：

```bash
docker compose -f build/docker-compose.yml logs playwright
```

发布环境可通过 `AI_PAGE_BUILDER_PLAYWRIGHT_IMAGE` 覆盖 Playwright 镜像。

### CMS handoff 可以创建，但 iframe 打不开

重点检查：

- `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 是否等于浏览器实际 origin。
- `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 是否错误包含 path。
- `AI_PAGE_BUILDER_BASE_PATH` 是否和 nginx/CMS 网关路径一致。
- 浏览器打开的是不是同一个 origin。
- 响应头里 `content-security-policy` 是否允许 `frame-ancestors 'self'`。

### CMS 模式直接打开 URL 返回 401

这是预期行为。CMS 模式下 builder context、session messages、workspace preview 等敏感入口需要通过 handoff 设置 workspace-scoped access cookie 后访问。直接打开 preview/API 返回 401 是安全校验的一部分。

### 修改 env 后没有生效

compose 不会自动重建或重启所有服务。修改 env 后执行：

```bash
docker compose \
  --env-file /tmp/page-builder-standalone.env \
  -f build/docker-compose.yml \
  up -d --build server playwright web
```

发布 compose 修改 env 后执行：

```bash
docker compose \
  --env-file /path/to/page-builder-release.env \
  -f build/docker-compose.release.yml \
  up -d server playwright web
```

### 数据目录权限问题

确认宿主机目录存在并可写：

```bash
mkdir -p /data/ai-page-builder
```

然后在 env 中设置：

```dotenv
AI_PAGE_BUILDER_HOST_DATA_DIR=/data/ai-page-builder
```

如果容器日志出现写入失败，需要检查宿主机目录权限和挂载路径。

## 推荐流程

本地开发或演示：

```bash
cp build/.env.standalone.example /tmp/page-builder-standalone.env
./build/start-page-builder.sh --env-file /tmp/page-builder-standalone.env
```

CMS 联调：

```bash
cp build/.env.cms.example /tmp/page-builder-cms.env
./build/start-page-builder.sh --env-file /tmp/page-builder-cms.env
```

CMS 集成回归验证：

```bash
docker compose \
  --env-file /tmp/page-builder-cms.env \
  -f build/docker-compose.cms-verify.yml \
  up -d --build server playwright web cms-mock nginx

bun build/cms-verify/smoke-test.ts
```

发布构建和推送：

```bash
VERSION=v202606171630

./build/build-page-builder-multiarch.sh --tag "$VERSION"

export TENCENT_REGISTRY_PASSWORD='your-password'
./build/push-page-builder-tencent.sh --tag "$VERSION"
```

生产部署：

```bash
docker compose \
  --env-file /path/to/page-builder-release.env \
  -f build/docker-compose.release.yml \
  pull server web

docker compose \
  --env-file /path/to/page-builder-release.env \
  -f build/docker-compose.release.yml \
  up -d server playwright web
```
