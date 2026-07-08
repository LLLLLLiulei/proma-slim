# AI Page Builder

AI Page Builder 是一个基于 AI Agent 的单页网页创建与编辑系统。项目当前以 Bun monorepo 组织，包含通用 Agent Web 应用、Page Builder 独立前端、CMS 渲染核心包和 Docker 部署资产。

> 代码包名使用 `@ai-page-builder/*`；服务端运行时、日志和本地配置目录由应用自动管理。

## 项目概览

核心能力：

- **对话式建站**：用户通过自然语言创建、重做、迭代专题页或 Landing Page。
- **Page Builder 工作台**：`/builder/:workspaceId/:sessionId` 提供预览 + 对话的分栏编辑体验。
- **工作区隔离**：每个 Agent workspace 拥有独立的 `workspace-files/`、skills、MCP 配置和会话工作目录。
- **CMS 内容绑定**：支持浏览 CMS 栏目/内容，并通过受控 handoff + MCP 工具把 CMS 数据源应用到页面区域。
- **HTML-first CMS Islands**：页面仍以普通 HTML/CSS/JS 为主，`<cms-catalog>` / `<cms-content>` 由宿主渲染管线接管。
- **可视化编辑辅助**：支持预览选区、区块删除、图片替换、内联文字编辑和编辑锁。
- **静态导出**：可将 `workspace-files/` 导出为 ZIP；CMS islands 会走服务端渲染，CMS 远程资源可选择是否本地化。
- **Agent 调试辅助**：Page Builder workspace 默认暴露 Playwright MCP；当静态分析难以定位页面问题时可用于预览排查。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 运行时 | 本地开发/构建使用 Bun 1.2.5；Docker 生产容器使用 Node 22 |
| 后端 | Hono；Docker 生产容器使用 Hono Node server |
| 前端 | React 18 + TypeScript + Vite 6 |
| 状态/UI | Jotai、Radix UI、Tailwind CSS、Ant Design（Page Builder 局部使用） |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` |
| CMS 渲染 | Vue 3 Islands、Vue SSR、linkedom |
| 通信 | HTTP API + SSE 流式 Agent 响应 |
| 存储 | 本地文件系统，无数据库依赖 |
| 部署 | Docker Compose：`server` + `web` + `playwright` |

## 目录结构

```text
.
├── apps/
│   ├── app/                         # 主应用与共享后端
│   │   ├── default-skills/           # 新建 workspace 时种子化的默认 skills
│   │   ├── resources/templates/      # Page Builder workspace 的 CLAUDE.md / mcp.json 模板
│   │   ├── scripts/                  # 开发服务、构建辅助脚本
│   │   └── src/
│   │       ├── main/                 # Hono API、Agent 编排、CMS 网关、导出服务等
│   │       └── renderer/             # 主应用 React 前端
│   └── page-builder/                 # Page Builder 独立 React 前端与生产静态网关
│       └── src/
│           ├── renderer/             # HomePage、BuilderPage、预览和 CMS 选择组件
│           └── server/               # Page Builder 生产 web server，代理 /api 到后端
├── packages/
│   ├── shared/                       # 共享类型、配置和工具
│   ├── ui/                           # 共享 UI 组件
│   ├── page-builder-cms-rendering/   # CMS islands 扫描、校验、预览、SSR 渲染核心
│   └── cms-vue-islands-demo/         # CMS islands 验证 demo
├── build/                            # Dockerfile、docker-compose、启动脚本和 env 模板
├── openspec/                         # OpenSpec 变更管理
├── package.json
├── bun.lock
└── pnpm-workspace.yaml
```

## 核心架构

### 双前端 + 共享后端

```text
Browser
  ├─ /                         -> apps/app/src/renderer
  │                              通用 Agent 会话、workspace 管理
  │
  └─ /builder/:wsId/:sessionId -> apps/page-builder/src/renderer
                                 Page Builder 创建、预览、CMS 绑定与导出
                                      │
                                      ▼
                             Hono HTTP Server
                             apps/app/src/main
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
   Agent Orchestrator            CMS Gateway                  File Storage
   Claude Agent SDK              外部 CMS API                 本地数据目录或容器挂载目录
```

本地开发时两个 Vite dev server 都代理 `/api` 到同一个后端服务：

- 主应用：`http://localhost:5173`
- Page Builder：`http://localhost:5174`
- 后端 API：`http://localhost:3000`

Docker 部署时：

- `server` 容器运行后端，内部端口 `8888`
- `web` 容器托管 Page Builder 前端并反向代理 `/api` 到 `server`
- `playwright` 容器提供 Playwright MCP sidecar

### Agent 工作流

```text
用户输入
  -> 前端注入 page-builder turn metadata / selection metadata
  -> 后端 AgentOrchestrator 组装 prompt、skills、MCP、自定义 SDK tools
  -> Claude Agent SDK 流式执行
  -> 写入 workspace-files/index.html 与 assets
  -> SSE 回传事件
  -> 前端刷新 preview iframe
```

Page Builder workspace 初始化时会写入：

- `CLAUDE.md`：workspace 级约束，例如 `workspace-files/` 是预览根目录、CMS 标签边界、skill 协调规则。
- `mcp.json`：默认包含 Playwright MCP 和可选 sequential-thinking MCP。
- `skills/`：从 `apps/app/default-skills/` 种子化的默认 skill 集合。
- `.claude-plugin/plugin.json`：让 Claude SDK 以 workspace namespace 暴露本地 skills。

### CMS 渲染与绑定

CMS 相关页面作者态遵循 HTML-first 模型：

1. 普通页面区域写普通 HTML/CSS/JS。
2. 动态 CMS 区域使用 `<cms-catalog>` 或 `<cms-content>` 作为源标签。
3. Vue template 语法只允许出现在 CMS 源标签内部的 slot 模板中。
4. Agent 不应自行引入 Vue CDN、importmap、`createApp` 或页面级 Vue runtime。
5. 预览和静态导出由 `@ai-page-builder/page-builder-cms-rendering` 负责扫描、校验和渲染 CMS islands。
6. 新 CMS 绑定必须走确认选择后的 `cms-binding-apply` skill 和 `mcp__cms__decide_cms_binding` -> `mcp__cms__apply_cms_binding` 工具链。

## 本地开发

### 前置条件

- Bun `>= 1.2.5`
- Node.js `>= 20`（部分 MCP、Playwright 或工具链通过 `npx` 执行）
- 可用的 `ANTHROPIC_API_KEY`

### 安装依赖

```bash
bun install
```

### 启动主应用

```bash
export ANTHROPIC_API_KEY=your_key
bun run dev
```

访问：`http://localhost:5173`

### 启动 Page Builder

```bash
bun run dev:page-builder
```

访问：`http://localhost:5174`

`dev` / `dev:page-builder` 都会同时启动 Vite 和后端。开发脚本会设置 `NODE_ENV=development`，并默认使用独立的本地开发数据目录，避免污染生产运行数据。
`dev:page-builder` 默认读取根目录 `.env.local`；其中 Agent SDK 相关白名单变量会覆盖宿主机同名环境变量，避免本机 shell 中的模型或凭证配置误影响当前项目。

## Docker 部署

推荐使用仓库内置脚本：

```bash
# 独立运行模式
./build/start-page-builder.sh

# CMS 集成模式
./build/start-page-builder.sh --env-file build/.env.cms.example
```

也可以直接运行 Compose：

```bash
docker compose --env-file build/.env.standalone.example -f build/docker-compose.yml up -d --build server playwright web
```

默认访问：`http://localhost:3333`

Compose 会把宿主机 `${AI_PAGE_BUILDER_HOST_DATA_DIR}` 挂载到 `server` 和 `playwright` 容器的 `/home/bun/.ai-page-builder`，用于保存会话、工作区、skills、导出文件和 SDK 配置。未设置时默认使用 `${HOME}/.ai-page-builder`。

如需指定跨平台镜像构建：

```bash
./build/start-page-builder.sh --platform linux/amd64
```

## 运行数据目录

本地生产默认目录：

```text
<config-dir>/
├── agent-sessions.json
├── agent-sessions/{sessionId}.jsonl
├── agent-workspaces.json
├── agent-workspaces/{workspaceSlug}/
│   ├── CLAUDE.md
│   ├── mcp.json
│   ├── .claude-plugin/plugin.json
│   ├── skills/
│   ├── skills-inactive/
│   ├── memory/MEMORY.md
│   ├── workspace-files/
│   │   ├── index.html
│   │   └── assets/
│   └── {sessionId}/                 # Agent 会话 scratch cwd
├── default-skills/
├── attachments/
├── page-builder-exports/{jobId}/
├── settings.json
├── user-profile.json
├── proxy-settings.json
├── cms-settings.json
├── sdk-config/
└── logs/
```

目录差异：

| 场景 | 默认配置目录 |
| --- | --- |
| 本地开发脚本 | 独立开发配置目录 |
| 本地生产默认 | 默认用户配置目录 |
| Docker Compose | `${HOME}/.ai-page-builder` 挂载到容器内 `/home/bun/.ai-page-builder` |

## 环境变量

### Agent 与服务端

| 变量 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | 是 | - | Claude Agent SDK 使用的 Anthropic API Key |
| `ANTHROPIC_BASE_URL` | 否 | `https://api.anthropic.com` | 自定义 Anthropic API Base URL |
| `PORT` | 否 | `3000`，Docker server 为 `8888` | 后端服务端口 |

### Page Builder / Docker

| 变量 | 说明 |
| --- | --- |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` | Agent SDK 凭证，二选一即可 |
| `ANTHROPIC_BASE_URL` | Anthropic-compatible 接口地址 |
| `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` | 旧配置兼容入口，仅当 `ANTHROPIC_API_KEY` 未设置时作为 fallback |
| `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL` | 旧配置兼容入口，仅当 `ANTHROPIC_BASE_URL` 未设置时作为 fallback |
| `PAGE_BUILDER_PORT` | Docker `web` 容器对外端口，默认 `3333` |
| `AI_PAGE_BUILDER_BASE_PATH` | Page Builder 公开基础路径，例如 `/pagebuilder`；留空表示根路径部署 |
| `AI_PAGE_BUILDER_SERVER_ORIGIN` | Page Builder 生产 web server 代理 `/api` 的后端 origin，默认 Docker 内部 `http://server:8888` |
| `PAGE_BUILDER_DIST_DIR` | 覆盖 Page Builder 生产静态资源目录 |
| `AI_PAGE_BUILDER_CONFIG_DIR` | Docker server 容器内数据目录，Compose 默认为 `/home/bun/.ai-page-builder` |
| `AI_PAGE_BUILDER_SDK_HOME` | Docker server 容器内 Claude home 覆盖目录；通常放在应用数据目录下 |
| `AI_PAGE_BUILDER_RUNTIME_ENV` | 运行环境标识；Docker Compose 设置为 `docker` |

### CMS 集成

| 变量 | 说明 |
| --- | --- |
| `AI_PAGE_BUILDER_INTEGRATION_MODE` | 设为 `cms` 时启用外部 CMS 嵌入集成模式 |
| `AI_PAGE_BUILDER_INTEGRATION_SECRET` | CMS 服务端调用 Page Builder 集成 API 的 Bearer Token |
| `AI_PAGE_BUILDER_CMS_BASE_URL` | CMS 管理端基础 URL |
| `AI_PAGE_BUILDER_CMS_USERNAME` | CMS 服务端访问用户名 |
| `AI_PAGE_BUILDER_CMS_PASSWORD` | CMS 服务端访问密码 |

本地运行 CMS 浏览/绑定时可以通过应用写入 `cms-settings.json`。Docker server 启动脚本会把 `AI_PAGE_BUILDER_CMS_*` 传递给运行时内部 CMS 配置。

### Playwright MCP

| 变量 | 说明 |
| --- | --- |
| `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL` | Docker/生产环境下的 Playwright MCP 端点，Compose 默认 `http://playwright:8931/mcp` |
| `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` | Agent 使用 Playwright 访问预览时的内部应用 origin，Compose 默认 `http://server:8888` |

## 常用脚本

```bash
# 根目录脚本
bun run dev                  # 启动主应用：Vite 5173 + 后端 3000
bun run dev:page-builder     # 启动 Page Builder：Vite 5174 + 后端 3000
bun run build                # 构建 @ai-page-builder/app
bun run start                # 以生产模式启动 @ai-page-builder/app
bun run typecheck            # 所有 workspace TypeScript 检查
bun run test                 # 运行 Bun 测试

# 单包脚本示例
bun run --filter='@ai-page-builder/page-builder' build
bun run --filter='@ai-page-builder/page-builder' typecheck
bun run --filter='@ai-page-builder/page-builder-cms-rendering' typecheck
bun run --filter='@ai-page-builder/cms-vue-islands-demo' dev
```

## API 路由概览

### 基础配置

- `GET /api/status`：服务状态与 API Key 配置状态
- `GET /api/settings` / `PATCH /api/settings`：应用设置
- `GET /api/user-profile` / `PATCH /api/user-profile`：用户档案

### Workspace

- `GET /api/workspaces`：列出工作区
- `POST /api/workspaces`：创建工作区，可传 `template: "page-builder"`
- `PATCH /api/workspaces/:workspaceId`：更新工作区元数据
- `DELETE /api/workspaces/:workspaceId`：删除工作区
- `GET /api/workspaces/:workspaceId/capabilities`：工作区能力
- `GET /api/workspaces/:workspaceId/directory-context`：目录上下文
- `GET /api/workspaces/:workspaceId/preview-state`：预览状态
- `GET /api/workspaces/:workspaceId/preview/*`：预览 `workspace-files/` 下的页面与资产
- `GET /api/workspaces/:workspaceId/file-search`：工作区文件搜索

### Agent Session

- `GET /api/sessions`：列出会话
- `POST /api/sessions`：创建会话
- `PATCH /api/sessions/:sessionId`：更新会话元数据
- `DELETE /api/sessions/:sessionId`：删除会话
- `GET /api/sessions/:sessionId/messages`：读取消息
- `POST /api/sessions/:sessionId/send`：发送用户消息，返回 SSE 流
- `POST /api/sessions/:sessionId/stop`：停止当前 Agent 执行
- `POST /api/sessions/:sessionId/permission-respond`：响应工具权限请求
- `POST /api/sessions/:sessionId/ask-user-respond`：响应 `AskUserQuestion`
- `POST /api/sessions/:sessionId/move-workspace`：移动会话到其他工作区

### Page Builder

- `GET /api/page-builder/projects`：列出 Page Builder 项目
- `DELETE /api/page-builder/projects/:workspaceId`：删除 Page Builder 项目
- `POST /api/page-builder/projects/:workspaceId/edit-lock`：获取编辑锁
- `POST /api/page-builder/projects/:workspaceId/edit-lock/:lockId/renew`：续期编辑锁
- `GET /api/page-builder/projects/:workspaceId/edit-lock/:lockId`：检查编辑锁
- `POST /api/page-builder/projects/:workspaceId/edit-lock/:lockId/release`：释放编辑锁
- `GET /api/page-builder/cms/sites`：CMS 站点列表
- `GET /api/page-builder/cms/catalogs`：CMS 栏目树
- `GET /api/page-builder/cms/catalogs/:catalogId`：CMS 栏目详情
- `GET /api/page-builder/cms/contents`：CMS 内容列表
- `GET /api/page-builder/cms/assets`：CMS 资源代理
- `GET /api/page-builder/preview-bridge.js`：预览桥接脚本
- `GET /api/page-builder/cms-rendering-preview.js`：CMS islands 预览运行脚本
- `GET /api/page-builder/cms-rendering-vue.js`：CMS islands Vue runtime bundle

### Page Builder Workspace 操作

这些接口挂在 workspace 下，通常由 Page Builder 前端调用：

- `POST /api/workspaces/:workspaceId/page-builder/cms-target-snapshot`：生成当前选中 CMS 区域快照
- `POST /api/workspaces/:workspaceId/page-builder/cms-auto-handoff`：发起 CMS 自动 handoff
- `POST /api/workspaces/:workspaceId/page-builder/inline-text`：内联文字修改
- `POST /api/workspaces/:workspaceId/page-builder/block-delete`：删除选中区块
- `POST /api/workspaces/:workspaceId/page-builder/image`：替换选中图片
- `POST /api/workspaces/:workspaceId/page-builder/export-static-jobs`：创建静态导出任务
- `GET /api/workspaces/:workspaceId/page-builder/export-static-jobs/:jobId`：查询导出任务
- `GET /api/workspaces/:workspaceId/page-builder/export-static-jobs/:jobId/download`：下载导出 ZIP

### CMS 集成模式

- `GET /api/integrations/cms/status`：CMS 集成状态
- `POST /api/integrations/cms/projects`：CMS 服务端创建/打开 Page Builder 项目入口
- `POST /api/integrations/cms/projects/:projectId/handoffs`：CMS 服务端创建一次 builder/preview 打开 handoff
- `GET /api/integrations/cms/builder-context`：Page Builder iframe 读取受控 builder 上下文

同源 iframe 打开 builder 时，CMS 服务端可以在创建 `target: "builder"` handoff 时传入 `toolbarExtensions.buttons`，用于在 Page Builder 左侧预览区顶部工具栏追加宿主业务按钮。按钮配置只接受 JSON 白名单字段：`id`、`label`、`tooltip`、`icon`、`variant`、`disabled`、`busy`、`hidden`、`requiresPreview` 和 `order`；不会接受或渲染宿主传入的 HTML、SVG、CSS、URL 或 JavaScript 回调。`target: "preview"` handoff 会忽略这些按钮。

```json
{
  "target": "builder",
  "openMode": "iframe",
  "toolbarExtensions": {
    "buttons": [
      {
        "id": "publish",
        "label": "发布专题",
        "tooltip": "发布到 CMS",
        "icon": "send",
        "variant": "primary",
        "requiresPreview": true,
        "order": 10
      },
      {
        "id": "audit",
        "label": "送审",
        "icon": "check",
        "order": 20
      }
    ]
  }
}
```

Page Builder iframe 准备好后会向同源父页面发送宿主协议消息。点击扩展按钮时，Page Builder 只通知父页面，不直接执行 CMS 业务逻辑：

```ts
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return
  if (event.data?.source !== 'page-builder-host-bridge') return

  if (event.data.type === 'ready') {
    // Page Builder 已挂载宿主工具栏扩展协议。
  }

  if (event.data.type === 'toolbar-button-click') {
    // event.data.buttonId: "publish" | "audit" | ...
    // event.data.state.hasPreview / previewUrl 可用于决定业务按钮状态。
  }
})
```

父页面可以在同源前提下回写按钮集合或状态。Page Builder 只接受 `event.source === window.parent` 且 `event.origin === window.location.origin` 的消息：

```ts
const frame = document.querySelector<HTMLIFrameElement>('#pagebuilder')

frame?.contentWindow?.postMessage({
  source: 'page-builder-host-parent',
  type: 'toolbar-button-update',
  version: 1,
  buttonId: 'publish',
  patch: {
    busy: true,
    disabled: true,
    label: '发布中'
  }
}, window.location.origin)
```

## 关键概念

### Workspace

Workspace 是 Agent 可见的隔离工作环境。Page Builder workspace 的预览源文件固定在 `workspace-files/`，其中 `workspace-files/index.html` 是默认入口。

### Session

Session 是一次 Agent 对话上下文，关联到一个 workspace。消息以 JSONL 形式追加保存，Agent 执行中的事件通过 SSE 返回给前端。

### Skills、CLAUDE.md 与 MCP

- `CLAUDE.md` 提供 workspace 级稳定约束。
- `skills/` 提供任务型说明，例如 `page-builder-guided-generation`、`cms-binding-apply`、`taste-skill`、`redesign-skill`。
- `mcp.json` 暴露外部 MCP server，例如 Playwright。
- 后端还会注入自定义 SDK tools，例如 CMS 查询/绑定工具与图片搜索下载工具。

### Edit Lock

Page Builder 使用编辑锁避免多用户或用户/Agent 并发修改同一项目。锁通过心跳续期，并会结合 Agent 执行状态判断项目是否可编辑。

### Static Export

静态导出会复制 `workspace-files/`，执行 CMS islands SSR，处理本地与可下载资源，并生成 `package.zip` 和 `export-report.json`。导出任务和产物默认保留 60 分钟。
