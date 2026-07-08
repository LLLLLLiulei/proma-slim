# PageBuilder CMS 接口对接说明

> 面向对象：CMS 后端、CMS 前端、CMS 网关/运维开发人员  
> 适用范围：CMS 模板库列表/下载/导入/管理、CMS 创建 AI 专题项目、项目另存为模板、打开 PageBuilder 构建页、打开最新预览页、同步导出静态 ZIP 的第一期集成对接  
> 依赖设计文档：`docs/cms-integration-requirements-and-design.md`

## 1. 文档目的

本文说明 CMS 侧接入 PageBuilder 时需要实现的服务端配置、数据字段、模板库对接、项目另存模板、接口调用、页面打开方式、构建页工具栏按钮扩展、同步导出、错误处理和反向代理要求。

PageBuilder 作为 CMS 的底层 AI 页面构建服务使用。CMS 仍然负责用户登录、业务权限、专题记录、发布流程和最终静态资源落盘；PageBuilder 负责创建内部构建项目、打开构建页、提供当前最新预览页、在同源 iframe 场景下承载受控宿主工具栏按钮，以及导出静态资源 ZIP。

CMS 侧长期只需要保存 PageBuilder 返回的 `projectId`。`workspaceId`、`sessionId`、handoff `openUrl`、CMS Cookie 都不是 CMS 侧长期业务契约，不应落库保存。

## 2. 对接总览

### 2.1 CMS 侧需要实现的最小闭环

CMS 第一版的核心编辑发布闭环仍围绕项目创建、编辑、预览和发布；如果 CMS 需要接入模板库，则在创建项目前增加模板列表、模板下载、模板导入、模板管理和选择模板的能力，并可在专题构建完成后把当前项目另存为模板。

| CMS 动作 | CMS 服务端调用 PageBuilder | CMS 浏览器行为 | CMS 持久化 |
|---|---|---|---|
| 获取模板库 | 获取 CMS 模板列表 | 展示模板卡片，可打开 `previewUrl` 预览 | 通常不需要保存；可临时保存用户选择的 `templateId`。 |
| 下载模板 | 下载模板 ZIP | 请求 CMS 自己的下载接口，由 CMS 服务端转发 PageBuilder ZIP | 通常不需要保存；按 CMS 自身下载审计要求记录即可。 |
| 导入模板 | 上传模板 ZIP | 无 | 通常不需要保存；以 PageBuilder 返回的模板摘要为准。 |
| 管理模板 | 重命名模板、批量删除模板 | 更新 CMS 模板库列表展示 | 通常不需要保存；以 PageBuilder 返回结果刷新列表。 |
| 新建 AI 专题 | 创建 PageBuilder 项目；可选传 `templateId` | 无 | 保存 `projectId`；如按模板创建，可保存 `sourceTemplateId/templateId` 便于 CMS 展示来源。 |
| 另存 AI 专题为模板 | 项目另存为模板 | 可打开返回的 `previewUrl` 预览 | 通常不需要保存；以 PageBuilder 返回的模板摘要为准。 |
| 编辑 AI 专题 | 创建 `target: "builder"` handoff；可选传入工具栏扩展按钮 | 打开 handoff `openUrl`；可监听工具栏按钮点击消息 | 不保存 `openUrl`。 |
| 预览 AI 专题 | 创建 `target: "preview"` handoff | 打开 handoff `openUrl` | 不保存 `openUrl`。 |
| 发布 AI 专题 | 同步导出 ZIP | 无 | 保存 CMS 自身发布状态，不保存 PageBuilder 内部路径。 |

### 2.2 关键禁忌

以下事项是第一期集成中最容易引发安全或联调问题的点：

| 禁忌 | 原因 | 正确做法 |
|---|---|---|
| 不要在 CMS 前端保存或使用 `PAGE_BUILDER_INTEGRATION_SECRET` | secret 是 server-to-server 凭据，暴露到浏览器会导致任意用户可调用集成 API。 | 只在 CMS 服务端读取和使用。 |
| 不要把 CMS Cookie 放入 URL 或 JSON body | URL、body 和日志更容易被持久化或外泄。 | CMS 服务端通过 `X-CMS-Cookie` header 转发当前请求原始 Cookie。 |
| 不要直接拼接 `/builder/:workspaceId/:sessionId` | 会绕过受控入口，并依赖 PageBuilder 内部实现。 | 每次编辑都实时创建 builder handoff。 |
| 不要直接拼接 `/api/workspaces/:workspaceId/preview/` | 会绕过受控入口，并依赖 PageBuilder 内部实现。 | 每次预览都实时创建 preview handoff。 |
| 不要落库保存 handoff `openUrl` | handoff 短期有效且只能消费一次。 | 只在本次打开或预览动作中使用。 |
| 不要让工具栏扩展按钮携带 HTML、SVG、CSS、URL、token 或 JS 回调 | PageBuilder 只把扩展按钮当作受控 UI 入口和消息通知，不执行宿主业务逻辑。 | 只传白名单 JSON 字段；发布、送审、返回等动作由 CMS 父页面收到点击消息后自行处理。 |
| 不要在发布失败时发布旧包冒充最新结果 | 用户会误以为发布的是当前构建产物。 | 标记发布失败或进入人工确认流程。 |

### 2.3 接口速查

| 用途 | 方法 | 路径 | 调用方 | 是否需要 secret | 是否需要 `X-CMS-Cookie` |
|---|---|---|---|---:|---:|
| 获取模板列表 | `GET` | `/api/integrations/cms/templates` | CMS 服务端 | 是 | 是 |
| 下载模板 ZIP | `GET` | `/api/integrations/cms/templates/:templateId/download` | CMS 服务端 | 是 | 是 |
| 导入模板 ZIP | `POST` | `/api/integrations/cms/templates/import` | CMS 服务端 | 是 | 是 |
| 重命名模板 | `PATCH` | `/api/integrations/cms/templates/:templateId` | CMS 服务端 | 是 | 是 |
| 批量删除模板 | `POST` | `/api/integrations/cms/templates/batch-delete` | CMS 服务端 | 是 | 是 |
| 创建项目，可选按模板创建 | `POST` | `/api/integrations/cms/projects` | CMS 服务端 | 是 | 是 |
| 项目另存为模板 | `POST` | `/api/integrations/cms/projects/:projectId/templates` | CMS 服务端 | 是 | 是 |
| 创建构建页 handoff | `POST` | `/api/integrations/cms/projects/:projectId/handoffs` | CMS 服务端 | 是 | 是 |
| 创建预览页 handoff | `POST` | `/api/integrations/cms/projects/:projectId/handoffs` | CMS 服务端 | 是 | 是 |
| 消费 handoff | `GET` | `/api/integrations/cms/handoffs/:handoffId/open` | 浏览器 | 否 | 否 |
| 同步导出 ZIP | `POST` | `/api/integrations/cms/projects/:projectId/export` | CMS 服务端 | 是 | 是 |
| 集成模式状态 | `GET` | `/api/integrations/cms/status` | PageBuilder 前端/联调 | 否 | 否 |

CMS 业务代码通常只需要直接调用模板列表/下载/导入/重命名/批量删除、创建项目、项目另存为模板、创建 handoff 和同步导出这些 server-to-server 接口。`handoff open` 由浏览器访问，`status` 主要用于 PageBuilder 前端和联调排查。

### 2.4 核心流程

```text
CMS 展示模板库（可选）
  -> CMS 服务端获取 PageBuilder 模板列表
  -> CMS 前端展示模板，并用 previewUrl 新窗口或同源 iframe 预览
  -> 如需下载模板，CMS 前端调用 CMS 服务端下载接口，由 CMS 服务端按 templateId 调用 PageBuilder 下载接口

CMS 导入模板（可选）
  -> CMS 服务端上传静态 ZIP 到 PageBuilder
  -> PageBuilder 返回模板摘要和绝对 previewUrl

CMS 管理模板（可选）
  -> CMS 服务端重命名模板或批量删除模板
  -> CMS 前端刷新模板列表

CMS 创建专题记录
  -> CMS 服务端调用 PageBuilder 创建项目，可选携带 templateId
  -> PageBuilder 返回 projectId
  -> CMS 保存 projectId

CMS 用户点击编辑
  -> CMS 服务端使用 projectId 创建 builder handoff
  -> 如需在 PageBuilder 工具栏展示发布/送审/返回等宿主动作，handoff body 携带 toolbarExtensions.buttons
  -> CMS 浏览器访问 handoff openUrl
  -> PageBuilder 设置访问 Cookie 并跳转到构建页
  -> 同源 iframe 父页面监听 PageBuilder 工具栏按钮点击消息并执行 CMS 业务动作

CMS 用户点击预览
  -> CMS 服务端使用 projectId 创建 preview handoff
  -> CMS 浏览器访问 handoff openUrl
  -> PageBuilder 设置访问 Cookie 并跳转到当前最新预览页

CMS 用户将当前专题另存为模板（可选）
  -> CMS 服务端使用 projectId 和模板名称调用项目另存模板接口
  -> PageBuilder 复用静态导出逻辑固化当前页面并写入全局模板库
  -> CMS 刷新模板列表或使用返回的 previewUrl 打开模板预览

CMS 用户点击发布
  -> CMS 服务端使用 projectId 调用同步导出接口
  -> PageBuilder 返回 ZIP
  -> CMS 解压、校验并执行自身发布流程
```

### 2.5 推荐接入顺序

建议 CMS 侧按以下顺序实现，便于逐步联调：

1. 配置 `PAGE_BUILDER_API_ORIGIN` 和 `PAGE_BUILDER_INTEGRATION_SECRET`。
2. 确认 PageBuilder 能用当前 CMS Cookie 调通 CMS `/ui/login`。
3. 在 CMS 专题记录中增加 `pageBuilderProjectId` 等绑定字段。
4. 如果接入模板库，先实现模板列表、模板预览和模板 ZIP 下载，再实现模板 ZIP 导入、重命名和批量删除。
5. 实现“创建 AI 专题”时调用 PageBuilder 创建项目；如用户选择模板，则同时传入 `templateId`。
6. 实现“编辑”按钮，调用 builder handoff 并用 iframe 或新窗口打开 `openUrl`。
7. 实现“预览”按钮，调用 preview handoff 并打开 `openUrl`。
8. 如果 CMS 需要把已构建专题复用为模板，实现“另存为模板”按钮，调用项目另存模板接口。
9. 实现“发布”按钮，调用同步导出 ZIP，并接入 CMS 自身发布流程。
10. 如需把发布、送审、返回列表等 CMS 业务动作放入 PageBuilder 左侧预览工具栏，补充 builder handoff 的 `toolbarExtensions.buttons`、父页面消息监听和按钮状态回写。
11. 最后补齐错误码提示、iframe sandbox、反向代理和联调验收。

### 2.6 职责边界

| 事项 | CMS 负责 | PageBuilder 负责 |
|---|---:|---:|
| CMS 用户登录 | 是 | 否，仅通过 CMS Cookie 调 `/ui/login` 校验 |
| CMS 业务权限 | 是 | 否 |
| CMS 专题记录 | 是 | 否 |
| PageBuilder 模板库 | 展示、下载、导入、另存和管理入口、业务权限判断 | 存储、扫描、下载、导入、另存、重命名、删除、预览和实例化模板 |
| PageBuilder 项目创建 | 调接口触发，可选传 `templateId` | 是 |
| AI 页面构建 | 发起入口 | 是 |
| 构建页访问控制 | 创建 handoff | 是 |
| 预览页访问控制 | 创建 handoff | 是 |
| 构建页工具栏扩展按钮 | 声明允许展示的宿主按钮、监听点击消息、执行发布/送审/返回等业务动作、回写按钮状态 | 归一化按钮配置、渲染受控按钮、通知点击事件 |
| 静态 ZIP 导出 | 调接口、接收 ZIP、发布 | 生成 ZIP |
| 最终静态资源发布 | 是 | 否 |

CMS 必须在调用 PageBuilder 前自行完成业务权限判断，例如当前用户是否允许创建、编辑、预览、发布该专题，以及专题是否属于当前站点。

PageBuilder 第一期只校验以下内容：

- CMS server-to-server secret 是否正确。
- `X-CMS-Cookie` 对应的 CMS 登录态是否有效。
- 模板是否存在、模板 ZIP 是否合法、模板导入大小是否超限。
- PageBuilder 项目是否存在。
- 当前项目是否具备可预览或可导出的产物。
- 当前项目是否处于可导出状态。
- 浏览器是否通过合法 handoff 获得 PageBuilder access session。

## 3. 地址与 Base Path 约定

### 3.1 CMS 服务端调用地址

CMS 服务端通过 `PAGE_BUILDER_API_ORIGIN` 调用 PageBuilder。该值必须包含 PageBuilder 的公开 base path。

生产示例：

```text
PAGE_BUILDER_API_ORIGIN=https://cms.example.com/pagebuilder
```

创建项目接口实际调用 URL：

```text
https://cms.example.com/pagebuilder/api/integrations/cms/projects
```

不要重复拼接 base path。以下是错误示例：

```text
https://cms.example.com/pagebuilder/pagebuilder/api/integrations/cms/projects
```

### 3.2 浏览器公开地址

PageBuilder 在 CMS 同源下通过 base path 暴露给浏览器：

```text
https://cms.example.com/pagebuilder/
```

也支持多级 base path，例如：

```text
https://cms.example.com/ai/pagebuilder/
```

CMS 前端不应直接拼接最终构建页或预览页 URL。编辑和预览都必须先由 CMS 服务端创建 handoff，再让浏览器访问 handoff `openUrl`。

### 3.3 内部 Server 路由

本文中的接口路径以 `/api/...` 表示 PageBuilder Server 的内部路由路径。CMS 实际调用时要拼接 `PAGE_BUILDER_API_ORIGIN`：

```text
{PAGE_BUILDER_API_ORIGIN}/api/...
```

如果 `PAGE_BUILDER_API_ORIGIN=https://cms.example.com/pagebuilder`，则：

```text
/api/integrations/cms/projects
```

对应实际 URL：

```text
https://cms.example.com/pagebuilder/api/integrations/cms/projects
```

## 4. CMS 侧配置项

CMS 服务端建议新增以下配置：

| 配置 | 是否必填 | 示例 | 说明 |
|---|---:|---|---|
| `PAGE_BUILDER_API_ORIGIN` | 是 | `https://cms.example.com/pagebuilder` | CMS 服务端调用 PageBuilder API 的公开同源反代地址，必须包含 PageBuilder base path。 |
| `PAGE_BUILDER_INTEGRATION_SECRET` | 是 | `********` | CMS 调 PageBuilder 的 Bearer secret，只能保存在 CMS 服务端。 |
| `PAGE_BUILDER_OPEN_MODE` | 建议 | `iframe` | CMS 默认打开方式，可选 `iframe` 或 `window`。 |
| `PAGE_BUILDER_EXPORT_CLIENT_TIMEOUT_MS` | 建议 | `60000` | CMS HTTP 客户端等待同步导出 ZIP 的超时时间，由 CMS 自行决定。 |

安全要求：

- `PAGE_BUILDER_INTEGRATION_SECRET` 不得下发到浏览器。
- `PAGE_BUILDER_INTEGRATION_SECRET` 不得写入页面源码、URL、Cookie、JS 全局变量或普通操作日志。
- 浏览器不应直接调用创建项目、创建 handoff、同步导出这些 server-to-server API。

## 5. 通用请求约定

### 5.1 服务端 Bearer 鉴权

CMS 调用 PageBuilder server-to-server 集成接口时，必须携带：

```http
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
```

缺失或错误时返回：

```http
401 Unauthorized
Content-Type: application/json

{
  "code": "integration_unauthorized",
  "error": "PageBuilder 集成鉴权失败"
}
```

### 5.2 CMS Cookie 传递

CMS 调用 PageBuilder 模板列表、模板下载、模板导入、模板重命名、模板批量删除、创建项目、创建 handoff、同步导出接口时，必须把当前 CMS 用户请求中的原始 `Cookie` header 放入：

```http
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
```

示例：

```http
X-CMS-Cookie: CurrentSite=1; ZUSID=xxxx
```

注意：

- `X-CMS-Cookie` 的值来自当前 CMS 请求的原始 Cookie。
- 不要把 Cookie 放入 URL。
- 不要把 Cookie 放入 JSON body。
- 不要把 Cookie 保存到 CMS 数据库专门给 PageBuilder 长期使用。
- PageBuilder 只在当前请求内使用该 Cookie 调 CMS `/ui/login`。
- PageBuilder 不会持久化原始 CMS Cookie。

缺少 `X-CMS-Cookie` 时，当前实现会返回：

```http
400 Bad Request
Content-Type: application/json

{
  "code": "invalid_request",
  "error": "X-CMS-Cookie 不能为空"
}
```

### 5.3 JSON 错误结构

PageBuilder 集成接口的 JSON 错误响应统一为：

```json
{
  "code": "cms_login_expired",
  "error": "CMS 登录态已失效，请重新进入 CMS 后再试"
}
```

CMS 应优先按 `code` 做处理，不应只依赖 HTTP status 或 `error` 文案。

## 6. CMS `/ui/login` 契约

PageBuilder 会使用 CMS 服务端传入的 `X-CMS-Cookie` 调用 CMS 管理端登录态接口：

```http
GET {AI_PAGE_BUILDER_CMS_BASE_URL}/ui/login
Cookie: <X-CMS-Cookie 的值>
Accept: application/json, text/plain, */*
Cache-Control: no-cache
Pragma: no-cache
Referer: {AI_PAGE_BUILDER_CMS_BASE_URL}/app.html
```

PageBuilder 判断登录成功的条件：

```text
HTTP 200
payload.status === 1
payload.data.logined === true
```

成功响应示例：

```json
{
  "status": 1,
  "data": {
    "logined": true,
    "userName": "zhangsan",
    "realName": "张三",
    "roleType": "admin",
    "isAdminUser": true
  }
}
```

PageBuilder 会提取以下用户摘要字段：

| 字段 | 说明 |
|---|---|
| `data.userName` | CMS 用户名。 |
| `data.realName` | CMS 用户真实姓名。 |
| `data.roleType` | CMS 用户角色类型。 |
| `data.isAdminUser` | 是否管理员。 |

如果 `/ui/login` 返回 401、403、`logined !== true` 或 `status !== 1`，PageBuilder 会认为 CMS 登录态已失效，通常返回：

```json
{
  "code": "cms_login_expired",
  "error": "CMS 登录态已失效，请重新进入 CMS 后再试"
}
```

如果 `/ui/login` 网络不可达、返回非 JSON、返回结构不符合预期或出现其他不可用情况，PageBuilder 通常返回：

```json
{
  "code": "cms_login_unavailable",
  "error": "CMS 登录态校验暂不可用，请稍后再试"
}
```

## 7. CMS 侧数据字段建议

CMS 的 AI 专题记录建议增加以下字段：

| 字段 | 是否必填 | 说明 |
|---|---:|---|
| `id` | 是 | CMS 自身专题记录 ID，建议直接作为 `externalRecordId`。 |
| `title` / `name` | 是 | 专题名称，对应 PageBuilder 创建项目接口的 `projectName`。 |
| `siteId` | 是 | CMS 站点 ID，对应 PageBuilder 创建项目接口的 `siteId`。 |
| `pageBuilderProjectId` | 创建成功后必填 | PageBuilder 返回的长期稳定 `projectId`。 |
| `pageBuilderExternalRecordId` | 建议 | 传给 PageBuilder 的 `externalRecordId`，建议等于 CMS 记录 ID。 |
| `pageBuilderStatus` | 建议 | 初始化状态，例如 `pending`、`ready`、`failed`。 |
| `pageBuilderSourceTemplateId` | 可选 | 如果专题由模板创建，可保存创建时选择的 `templateId`，仅用于 CMS 侧展示和排查。 |
| `pageBuilderCreatedAt` | 建议 | 首次成功创建 PageBuilder 项目的时间。 |
| `pageBuilderUpdatedAt` | 建议 | 最近一次同步 PageBuilder 绑定信息的时间。 |

CMS 不应保存以下字段作为业务契约：

- `workspaceId`
- `sessionId`
- handoff `openUrl`
- handoff `handoffId`
- PageBuilder access cookie
- 当前用户 CMS Cookie

## 8. 模板库接口：列表、下载、导入与管理

CMS 如果需要在自身后台展示 PageBuilder 模板库，应通过 CMS server-to-server 模板接口获取列表、下载模板 ZIP、导入模板、重命名模板和删除模板。模板库是全局静态 HTML 资源包集合，第一期不按 CMS 用户、角色或 `siteId` 隔离；CMS 必须在调用接口前自行判断当前用户是否允许查看、下载、导入或管理模板。

模板预览使用普通只读预览 URL，不走 CMS handoff，也不会创建 Builder Access Session。CMS 可以在同源部署下用 iframe 展示模板预览；如果不是同源部署，受当前模板预览 CSP 限制，建议使用新窗口打开 `previewUrl`。

### 8.1 获取模板列表

```http
GET {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/templates?name=活动
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
```

查询参数：

| 参数 | 是否必填 | 说明 |
|---|---:|---|
| `name` | 否 | 按模板名称做包含匹配。PageBuilder 会去除首尾空白并做大小写不敏感匹配；为空时等价于不筛选。 |

成功响应：

```http
200 OK
Content-Type: application/json

{
  "templates": [
    {
      "id": "tpl_imported_20260617103000_ab12cd34",
      "name": "活动专题模板",
	      "sourceKind": "saved-project",
	      "createdAt": "2026-06-17T10:30:00.000Z",
	      "previewUrl": "https://cms.example.com/pagebuilder/api/page-builder/templates/tpl_imported_20260617103000_ab12cd34/preview/",
	      "deletable": true
	    }
	  ]
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `templates` | 模板摘要列表，按创建时间倒序返回。 |
| `id` | 模板 ID。CMS 用户选择模板创建项目时，把该值作为 `templateId` 传给创建项目接口。 |
| `name` | 模板名称。 |
| `sourceKind` | 模板来源类型；当前通常为 `saved-project`。 |
| `createdAt` | 模板创建或导入时间，ISO 字符串。 |
| `previewUrl` | 浏览器可访问的绝对预览 URL，由 PageBuilder 使用 `AI_PAGE_BUILDER_PUBLIC_ORIGIN + AI_PAGE_BUILDER_BASE_PATH` 生成。 |
| `deletable` | 模板是否可删除；CMS 批量删除接口会复用该语义。 |
| `description` / `tags` / `category` | 兼容字段，存在时可能返回；CMS 第一版可以忽略。 |

注意：

- `previewUrl` 是绝对 URL，不需要 CMS 再拼接 `PAGE_BUILDER_API_ORIGIN`。
- 模板列表不返回下载链接；CMS 如需下载模板，应使用 `templateId` 调用 `GET /api/integrations/cms/templates/{templateId}/download`。
- PageBuilder 不会从 `Host`、`X-Forwarded-Host` 推断 `previewUrl`，部署侧必须正确配置 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`。
- 如果 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 缺失或非法，该接口返回 `400 invalid_request`。
- 模板预览不需要 `X-CMS-Cookie`，但获取模板列表本身需要校验当前 CMS 登录态。
- 模板预览只读，不代表创建项目，也不会占用编辑锁。
- `name` 只匹配模板名称，不匹配描述、标签或分类；没有匹配项时返回空 `templates` 数组。

常见错误：

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查 `X-CMS-Cookie`，或让 PageBuilder 部署侧检查 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录后重试。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态，检查 CMS `/ui/login`。 |

### 8.2 下载模板 ZIP

CMS 可以通过该接口下载模板库中的模板 ZIP。该接口是 server-to-server 接口，必须由 CMS 服务端调用；CMS 前端如果需要下载按钮，应先请求 CMS 自己的下载接口，再由 CMS 服务端携带 secret 和当前用户 Cookie 调用 PageBuilder。

```http
GET {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/templates/{templateId}/download
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
```

成功响应：

```http
200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="tpl_imported_20260617103000_ab12cd34.zip"; filename*=UTF-8''...
Cache-Control: private, no-store

<zip binary>
```

ZIP 内容：

| 路径 | 说明 |
|---|---|
| `template.json` | 便携版模板 manifest，用于重新导入或迁移模板。 |
| `workspace-files/index.html` | 模板入口页面。 |
| `workspace-files/**` | 模板静态资源文件，例如 CSS、JS、图片和字体。 |

注意：

- 下载接口需要 `Authorization` 和 `X-CMS-Cookie` header；CMS 前端不应直接调用该接口，因为浏览器裸跳无法携带服务端 secret 和当前请求原始 Cookie。
- CMS 服务端转发 ZIP 时应保留 `Content-Type` 和 `Content-Disposition`，也可以根据自身产品规范改写下载文件名。
- 下载接口会实时校验当前 CMS 登录态；用户登录态失效时应引导用户重新登录 CMS 后重试。
- 下载包只包含可复用的模板 manifest 和 `workspace-files/`，不包含模板校验报告、源项目内部记录等运行时文件。

常见错误：

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查 `X-CMS-Cookie` 是否缺失。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录后重试。 |
| 403 | `template_operation_forbidden` | 模板路径或文件状态不允许下载，刷新模板列表；仍失败时交由管理员排查模板目录。 |
| 404 | `template_not_found` | 模板不存在，刷新模板列表后重试。 |
| 500 | `template_operation_failed` | 模板下载过程中发生非预期错误，稍后重试并保留服务端日志。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态，检查 CMS `/ui/login`。 |

### 8.3 导入模板 ZIP

CMS 可以把任意包含 `index.html` 的静态 ZIP 上传给 PageBuilder 导入为模板。导入成功后，该模板会出现在全局模板列表中，可继续用于创建 AI 专题项目。

```http
POST {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/templates/import
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 是否必填 | 说明 |
|---|---:|---|
| `file` | 是 | 模板 ZIP 文件。ZIP 内必须存在可识别的 `index.html`。 |

成功响应：

```http
201 Created
Content-Type: application/json

{
  "template": {
    "id": "tpl_imported_20260617103000_ab12cd34",
	    "name": "activity-template",
	    "sourceKind": "saved-project",
	    "createdAt": "2026-06-17T10:30:00.000Z",
	    "previewUrl": "https://cms.example.com/pagebuilder/api/page-builder/templates/tpl_imported_20260617103000_ab12cd34/preview/",
	    "deletable": true
	  }
	}
```

导入规则：

- ZIP 原始大小默认上限为 100MB，由 PageBuilder 部署侧 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB` 控制。
- ZIP 解压后累计大小默认上限为 500MB，由 PageBuilder 部署侧 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB` 控制。
- ZIP 可以是根目录直接包含 `index.html`，也可以是单一站点目录下包含 `index.html`。
- 导入会做路径安全校验，拒绝路径穿越、重复路径、特殊文件、加密 ZIP、无法识别入口等情况。
- 导入失败会清理本次请求产生的临时文件和半成品模板目录。
- public origin 会在读取、解压和写入 ZIP 前校验；如果 public origin 缺失，不会产生模板目录副作用。

常见错误：

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查是否为 `multipart/form-data`，是否缺少 `file`，或 `X-CMS-Cookie` 是否缺失。 |
| 400 | `template_import_invalid` | ZIP 无法解析、缺少 `index.html`、入口不明确、包含重复路径或加密 ZIP。提示用户更换 ZIP。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录后重试。 |
| 403 | `template_import_forbidden` | ZIP 包含路径穿越或不支持的特殊文件。拒绝导入并提示用户检查文件。 |
| 413 | `template_size_limit` | ZIP 原始大小或解压后大小超过 PageBuilder 限制。提示用户压缩资源或联系管理员调整限制。 |
| 500 | `template_import_failed` | 模板导入过程中发生非预期错误。提示稍后重试并保留服务端日志。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态，检查 CMS `/ui/login`。 |

### 8.4 重命名模板

CMS 可以调用该接口修改模板名称。该操作只修改模板 manifest 中的展示名称，不会影响已经基于该模板创建的 PageBuilder 项目。

```http
PATCH {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/templates/{templateId}
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
Content-Type: application/json
```

请求体：

```json
{
  "name": "新的模板名称"
}
```

字段说明：

| 字段 | 是否必填 | 说明 |
|---|---:|---|
| `name` | 是 | 新模板名称，必须是非空字符串；PageBuilder 会自动去除首尾空白。 |

成功响应：

```http
200 OK
Content-Type: application/json

{
  "template": {
    "id": "tpl_imported_20260617103000_ab12cd34",
	    "name": "新的模板名称",
	    "sourceKind": "saved-project",
	    "createdAt": "2026-06-17T10:30:00.000Z",
	    "previewUrl": "https://cms.example.com/pagebuilder/api/page-builder/templates/tpl_imported_20260617103000_ab12cd34/preview/",
	    "deletable": true
	  }
	}
```

常见错误：

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查 `name` 是否为空、JSON body 是否合法，或 PageBuilder public origin 配置。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录后重试。 |
| 404 | `template_not_found` | 模板不存在，刷新模板列表后重试。 |
| 403 | `template_operation_forbidden` | 模板路径或文件状态不允许操作，提示管理员排查模板目录。 |
| 500 | `template_operation_failed` | 模板操作过程中发生非预期错误，稍后重试并保留服务端日志。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态，检查 CMS `/ui/login`。 |

### 8.5 批量删除模板

CMS 可以调用该接口批量删除模板。该操作只删除模板库中的模板文件，不会影响已经基于这些模板创建的 PageBuilder 项目。接口支持部分成功：某个模板删除失败时，后续模板仍会继续处理。

```http
POST {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/templates/batch-delete
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
Content-Type: application/json
```

请求体：

```json
{
  "templateIds": [
    "tpl_imported_20260617103000_ab12cd34",
    "tpl_imported_20260617104500_ef56ab78"
  ]
}
```

字段说明：

| 字段 | 是否必填 | 说明 |
|---|---:|---|
| `templateIds` | 是 | 非空字符串数组。PageBuilder 会去除首尾空白，并按首次出现顺序去重。 |

成功响应：

```http
200 OK
Content-Type: application/json

{
  "deletedTemplateIds": [
    "tpl_imported_20260617103000_ab12cd34"
  ],
  "failures": [
    {
      "templateId": "tpl_missing",
      "code": "template_not_found",
      "error": "模板不存在"
    }
  ]
}
```

响应字段：

| 字段 | 说明 |
|---|---|
| `deletedTemplateIds` | 本次实际删除成功的模板 ID 列表。 |
| `failures` | 本次删除失败的模板列表；每项包含 `templateId`、稳定 `code` 和用户可展示或记录的 `error`。 |

注意：

- 请求级错误会整体失败，例如 secret 无效、CMS 登录态失效、`templateIds` 不是非空数组。
- 单个模板不存在、路径非法或删除失败会进入 `failures`，不会阻断后续模板删除。
- CMS 侧删除后应重新获取模板列表，避免本地列表与 PageBuilder 模板目录不一致。

常见错误：

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查 `templateIds` 是否为非空字符串数组，或 `X-CMS-Cookie` 是否缺失。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录后重试。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态，检查 CMS `/ui/login`。 |

### 8.6 模板预览 URL 使用方式

模板列表、导入和重命名响应中的 `previewUrl` 可以直接给 CMS 浏览器打开：

```text
window.open(template.previewUrl)
```

同源 iframe 场景也可以使用：

```html
<iframe
  src="https://cms.example.com/pagebuilder/api/page-builder/templates/tpl_imported_20260617103000_ab12cd34/preview/"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
></iframe>
```

注意：

- 模板预览不是项目预览，不需要 `projectId`。
- 模板预览不会校验 CMS handoff，也不会签发 PageBuilder access cookie。
- 跨源 iframe 预览当前不在第一期承诺范围内；如跨源部署，建议 CMS 用新窗口打开。

## 9. 创建 PageBuilder 项目接口

CMS 创建 AI 专题记录后，调用该接口创建对应的 PageBuilder 项目。

### 9.1 请求

```http
POST {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/projects
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
Content-Type: application/json
```

请求体（创建空项目）：

```json
{
  "externalRecordId": "cms-topic-123",
  "projectName": "2026 春招 AI 专题",
  "siteId": "1"
}
```

请求体（按模板创建项目）：

```json
{
  "externalRecordId": "cms-topic-123",
  "projectName": "2026 春招 AI 专题",
  "siteId": "1",
  "templateId": "tpl_imported_20260617103000_ab12cd34"
}
```

字段说明：

| 字段 | 是否必填 | 说明 |
|---|---:|---|
| `externalRecordId` | 是 | CMS 自身专题记录 ID，用于幂等。建议直接使用 CMS 专题记录主键。 |
| `projectName` | 是 | PageBuilder 项目名称，一般使用专题标题。 |
| `siteId` | 是 | CMS 站点 ID。 |
| `templateId` | 否 | 模板 ID。传入时 PageBuilder 会复制该模板的 `workspace-files/` 创建项目；不传时创建空项目。 |

不要传 `prompt`。当前创建项目接口不支持 `prompt`，也不会自动启动 Agent。

### 9.2 成功响应

首次创建空项目成功：

```http
201 Created
Content-Type: application/json

{
  "projectId": "pbp_01HX...",
  "created": true
}
```

首次按模板创建项目成功：

```http
201 Created
Content-Type: application/json

{
  "projectId": "pbp_01HX...",
  "created": true,
  "templateId": "tpl_imported_20260617103000_ab12cd34"
}
```

同一个 `externalRecordId` 重试命中已有项目：

```http
200 OK
Content-Type: application/json

{
  "projectId": "pbp_01HX...",
  "created": false,
  "templateId": "tpl_imported_20260617103000_ab12cd34"
}
```

如果已有项目不是由模板创建，幂等响应不会包含 `templateId`。CMS 应将 `projectId` 保存到专题记录的 `pageBuilderProjectId` 字段；如果本次按模板创建，也可以保存 `templateId` 作为 CMS 侧展示字段。

### 9.3 幂等与重试

CMS 应使用稳定的 `externalRecordId`。推荐直接使用 CMS 专题记录主键。

重试规则：

- 如果 CMS 创建记录后调用 PageBuilder 失败，应保留 CMS 记录并允许用户重试。
- 重试时必须继续使用同一个 `externalRecordId`。
- 如果网络超时导致 CMS 不确定 PageBuilder 是否创建成功，继续用同一个 `externalRecordId` 重试即可。
- 如果 PageBuilder 创建成功但 CMS 保存 `projectId` 失败，继续用同一个 `externalRecordId` 重试，PageBuilder 会返回同一个 `projectId`。
- 如果首次按模板创建，重试时建议继续传同一个 `templateId`。
- 如果已有项目的 `sourceTemplateId` 与本次 `templateId` 不一致，PageBuilder 返回 `project_conflict`。
- 如果已有空项目后来又传 `templateId`，PageBuilder 返回 `project_conflict`。
- 如果已有模板项目但旧客户端未传 `templateId`，PageBuilder 兼容返回已有 `projectId` 和已有 `templateId`。
- 不要删除 CMS 记录后用新的 `externalRecordId` 重建，否则可能产生孤立项目。

### 9.4 常见错误

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查参数、JSON body、`X-CMS-Cookie` 是否缺失。 |
| 401 | `integration_unauthorized` | 服务端配置错误，检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录 CMS 后重试。 |
| 404 | `template_not_found` | `templateId` 不存在或不合法，提示用户重新选择模板。 |
| 409 | `project_conflict` | 同一 `externalRecordId` 的 `siteId` 或模板来源冲突，交由管理员排查，不要自动新建另一条记录。 |
| 500 | `template_import_failed` | 按模板创建过程中发生非预期错误，PageBuilder 不返回可用 `projectId`，可稍后用同一 `externalRecordId` 重试。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法调用 CMS `/ui/login`，检查 CMS 管理端地址、网络或响应格式。 |

### 9.5 项目另存为模板

CMS 如果需要把当前已经构建好的 AI 专题沉淀为可复用模板，可以由 CMS 服务端调用该接口。该接口只接收模板名称，PageBuilder 会根据 `projectId` 找到绑定的 PageBuilder 工作区，复用静态导出逻辑生成模板快照，并把模板写入全局模板库。

该接口不需要 Builder Access Session，也不要求当前项目持有编辑锁；CMS 侧应在调用前自行判断当前用户是否有“另存模板”的业务权限。

```http
POST {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/projects/{pageBuilderProjectId}/templates
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
Content-Type: application/json
```

请求体：

```json
{
  "name": "春招专题模板"
}
```

字段说明：

| 字段 | 是否必填 | 说明 |
|---|---:|---|
| `name` | 是 | 新模板名称，必须是非空字符串；PageBuilder 会自动去除首尾空白。 |

成功响应：

```http
201 Created
Content-Type: application/json

{
  "template": {
    "id": "tpl_saved_20260617103000_ab12cd34",
    "name": "春招专题模板",
    "sourceKind": "saved-project",
    "createdAt": "2026-06-17T10:30:00.000Z",
    "previewUrl": "https://cms.example.com/pagebuilder/api/page-builder/templates/tpl_saved_20260617103000_ab12cd34/preview/",
    "deletable": true
  }
}
```

处理规则：

- PageBuilder 会使用 CMS `projectId` 查找项目绑定，不暴露也不要求 CMS 传 `workspaceId` 或 `sessionId`。
- PageBuilder 会实时校验 `Authorization` 和 `X-CMS-Cookie`；CMS Cookie 只用于本次 `/ui/login` 校验，不会作为长期凭据写入模板。
- 另存模板复用静态导出能力，会把当前页面和可下载资源固化到模板 `workspace-files/` 中。
- 如果图片、字体等静态资源离线化失败，另存模板不阻断；模板快照会保留原始外链，并在 `reports/static-export-report.json` 中记录警告。
- 响应只返回模板摘要和绝对 `previewUrl`，不返回 `downloadUrl`；CMS 如需下载，使用模板下载接口。
- 另存成功后，CMS 可以刷新模板列表，也可以直接用返回的 `previewUrl` 打开模板预览。

常见错误：

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查 `name` 是否为空、JSON body 是否合法、`X-CMS-Cookie` 是否缺失，或 PageBuilder public origin 配置。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录后重试。 |
| 403 | `template_operation_forbidden` | 当前项目导出产物存在不允许另存为模板的路径或文件，提示管理员排查项目资源。 |
| 404 | `project_not_found` | CMS 记录绑定的 `pageBuilderProjectId` 不存在或 PageBuilder 内部项目丢失，提示管理员处理。 |
| 409 | `project_busy` | 当前项目没有可另存页面，或项目正在导出中；提示用户先完成页面构建或稍后重试。 |
| 413 | `template_size_limit` | 模板快照超过 PageBuilder 限制，提示用户压缩资源或联系管理员调整限制。 |
| 500 | `template_operation_failed` | 模板另存过程中发生非预期错误，稍后重试并保留服务端日志。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态，检查 CMS `/ui/login`。 |

## 10. 创建构建页 Handoff 接口

CMS 用户点击“编辑 AI 专题”时，CMS 服务端调用该接口创建一次性构建页打开链接。

CMS 不应直接拼接或保存：

```text
{AI_PAGE_BUILDER_BASE_PATH}/builder/:workspaceId/:sessionId
```

### 10.1 请求

```http
POST {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/projects/{pageBuilderProjectId}/handoffs
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
Content-Type: application/json
```

请求体：

```json
{
  "target": "builder",
  "openMode": "iframe"
}
```

如需在 PageBuilder 左侧预览区顶部工具栏追加 CMS 宿主业务按钮，可以在 builder handoff 中传入 `toolbarExtensions.buttons`：

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
      },
      {
        "id": "back",
        "label": "返回",
        "icon": "arrow-left",
        "variant": "ghost",
        "order": 30
      }
    ]
  }
}
```

字段说明：

| 字段 | 是否必填 | 默认值 | 说明 |
|---|---:|---|---|
| `target` | 否 | `builder` | 打开目标。构建页使用 `builder`。 |
| `openMode` | 否 | `window` | 打开方式，可选 `iframe` 或 `window`。主要用于日志和调试。 |
| `toolbarExtensions` | 否 | `{ "buttons": [] }` | 构建页宿主工具栏扩展配置。仅 `target: "builder"` 生效；`target: "preview"` 会忽略。 |

请求体可以为空。为空时等价于：

```json
{
  "target": "builder",
  "openMode": "window"
}
```

### 10.2 成功响应

```http
200 OK
Content-Type: application/json

{
  "handoffId": "handoff_01HX...",
  "openUrl": "https://cms.example.com/pagebuilder/api/integrations/cms/handoffs/handoff_01HX.../open",
  "expiresAt": 1778999612688,
  "target": "builder",
  "openMode": "iframe"
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `handoffId` | 一次性 handoff ID。CMS 可用于临时联调排查，但不应落库保存。 |
| `openUrl` | 浏览器应访问的打开链接。 |
| `expiresAt` | handoff 过期时间，Unix epoch 毫秒时间戳。 |
| `target` | 归一化后的打开目标。 |
| `openMode` | 归一化后的打开方式。 |

### 10.3 构建页工具栏按钮扩展

工具栏扩展用于同源 iframe 场景：CMS 把 PageBuilder 构建页嵌入 iframe，并希望把“发布、送审、返回列表”等宿主业务动作放进 PageBuilder 左侧预览区顶部工具栏。PageBuilder 只负责渲染受控按钮和通知点击事件，不直接执行 CMS 发布、送审、跳转或外部 API 调用。

#### 10.3.1 按钮配置字段

`toolbarExtensions.buttons` 是按钮数组，builder handoff 中最多允许 5 个按钮。PageBuilder 会按 `order` 升序展示；`order` 相同或未设置时保持输入顺序。builder handoff 采用严格校验：重复 `id`、超过数量上限、非法 `id`、空 `label`、未知 `icon`、未知 `variant` 或字段类型不正确时，请求会返回 `400 invalid_request`。父页面后续通过 `toolbar-buttons-set` 动态替换按钮集合时采用宽松归一化：非法按钮会被丢弃，重复 `id` 只保留第一个合法按钮，超过数量上限时只保留允许数量内的按钮。

| 字段 | 是否必填 | 说明 |
|---|---:|---|
| `id` | 是 | 稳定按钮 ID。只能使用安全字符串，建议使用 `publish`、`audit`、`back` 这类业务语义 ID。 |
| `label` | 是 | 按钮可见文字。PageBuilder 会限制长度，过长会截断，避免撑破工具栏。 |
| `tooltip` | 否 | 鼠标悬浮提示。 |
| `icon` | 否 | 受控图标 key，可选 `send`、`check`、`upload`、`download`、`external-link`、`save`、`refresh`、`x`、`arrow-left`。 |
| `variant` | 否 | 受控按钮样式，可选 `outline`、`primary`、`ghost`、`destructive`。 |
| `disabled` | 否 | `true` 时按钮不可点击。 |
| `busy` | 否 | `true` 时按钮展示忙碌状态并不可点击，适合发布中、送审中。 |
| `hidden` | 否 | `true` 时不渲染该按钮。 |
| `requiresPreview` | 否 | `true` 时如果当前构建页没有可用预览 URL，按钮会被禁用。 |
| `order` | 否 | 排序权重，数字越小越靠前。扩展按钮整体仍显示在 PageBuilder 内置预览动作之后。 |

安全边界：

- 只允许上表 JSON 字段进入 PageBuilder 渲染层。
- 不支持 React 组件、HTML、SVG 字符串、CSS style 对象、JavaScript 回调、外部 URL、任意 payload、token 或 Cookie。
- 不要在 `id`、`label`、`tooltip` 中放入敏感数据；这些字段会进入 Builder Context 和浏览器 UI。
- builder handoff 中传入非法按钮配置、重复按钮 ID 或超过按钮数量上限时，PageBuilder 会返回 `400 invalid_request`。
- 父页面后续通过消息动态替换按钮集合时，非法按钮会被丢弃，不会透传到 DOM。

#### 10.3.2 PageBuilder 发给父页面的消息

PageBuilder iframe 准备好后会向同源父页面发送 `ready` 消息：

```ts
{
  source: 'page-builder-host-bridge',
  type: 'ready',
  version: 1,
  capabilities: ['toolbarExtensions.v1'],
  workspaceId: 'workspace-id',
  sessionId: 'session-id',
  projectId: 'pbp_01HX...'
}
```

用户点击可用的扩展按钮时，PageBuilder 会向同源父页面发送 `toolbar-button-click` 消息：

```ts
{
  source: 'page-builder-host-bridge',
  type: 'toolbar-button-click',
  version: 1,
  buttonId: 'publish',
  workspaceId: 'workspace-id',
  sessionId: 'session-id',
  projectId: 'pbp_01HX...',
  state: {
    hasPreview: true,
    previewUrl: 'https://cms.example.com/pagebuilder/api/workspaces/.../preview/?v=rev-1'
  }
}
```

消息不包含 CMS Cookie、integration secret、Builder Access Cookie、handoffId、编辑锁凭据或 access token。CMS 父页面应按 `event.origin` 和 `event.data.source` 过滤消息。

父页面监听示例：

```ts
const pageBuilderFrame = document.querySelector<HTMLIFrameElement>('#pagebuilder')

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return
  if (event.source !== pageBuilderFrame?.contentWindow) return
  if (event.data?.source !== 'page-builder-host-bridge') return

  if (event.data.type === 'ready') {
    // PageBuilder 已挂载宿主工具栏扩展协议。
    return
  }

  if (event.data.type !== 'toolbar-button-click') {
    return
  }

  if (event.data.buttonId === 'publish') {
    await publishCurrentTopic(event.data.state.previewUrl)
  }
})
```

#### 10.3.3 父页面回写按钮状态

CMS 父页面执行发布、送审等动作时，可以通过同源 `postMessage` 更新按钮状态。PageBuilder 只接受 `event.source === window.parent` 且 `event.origin === window.location.origin` 的父页面消息。

更新单个按钮：

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
    label: '发布中',
    tooltip: '正在发布到 CMS'
  }
}, window.location.origin)
```

单按钮状态更新只允许修改：

| patch 字段 | 说明 |
|---|---|
| `label` | 新按钮文案，非空字符串，过长会截断。 |
| `tooltip` | 新提示文案，非空字符串，过长会截断。 |
| `disabled` | 是否禁用。 |
| `busy` | 是否忙碌。 |
| `hidden` | 是否隐藏。 |

替换当前按钮集合：

```ts
frame?.contentWindow?.postMessage({
  source: 'page-builder-host-parent',
  type: 'toolbar-buttons-set',
  version: 1,
  buttons: [
    {
      id: 'publish',
      label: '发布专题',
      icon: 'send',
      variant: 'primary',
      requiresPreview: true,
      order: 10
    }
  ]
}, window.location.origin)
```

推荐发布按钮交互：

```ts
async function handlePublishClick() {
  setPageBuilderToolbarButton('publish', {
    busy: true,
    disabled: true,
    label: '发布中',
  })

  try {
    await publishTopic()
    setPageBuilderToolbarButton('publish', {
      busy: false,
      disabled: false,
      label: '已发布',
      tooltip: '已发布到 CMS',
    })
  } catch {
    setPageBuilderToolbarButton('publish', {
      busy: false,
      disabled: false,
      label: '重新发布',
      tooltip: '发布失败，请重试',
    })
  }
}
```

#### 10.3.4 与 preview handoff 的关系

`toolbarExtensions.buttons` 只对 `target: "builder"` 生效。即使 CMS 在 preview handoff 请求体中传入该字段，PageBuilder 也不会把扩展按钮暴露给只读预览页。

### 10.4 CMS 打开方式

iframe 方式：

```text
CMS 前端请求 CMS 自己的“打开编辑页”接口
  -> CMS 服务端创建 handoff
  -> CMS 返回 openUrl
  -> CMS 前端设置 iframe.src = openUrl
```

新窗口方式：

```text
CMS 前端请求 CMS 自己的“打开编辑页”接口
  -> CMS 服务端创建 handoff
  -> CMS 服务端 302 到 openUrl
```

或：

```text
CMS 服务端返回 openUrl
  -> CMS 前端 window.open(openUrl)
```

推荐新窗口场景优先由 CMS 服务端直接返回 `302 Location: {openUrl}`，减少前端接触 handoff URL 的机会。

### 10.5 Handoff 使用约束

- handoff 默认有效期 2 分钟。
- handoff 只能消费一次。
- `openUrl` 不应落库保存。
- iframe 重新挂载、用户重复点击、页面刷新后重新打开，都应重新创建 handoff。
- 同一个 `openUrl` 不要复用给多个 iframe 或多个窗口。
- `openUrl` 中不包含 CMS Cookie。
- CMS 不应把最终 `/builder/...` URL 作为 iframe src。
- 初始工具栏按钮配置随本次 builder handoff 进入 Builder Context，不应包含敏感业务数据。

### 10.6 常见错误

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查 `target`、`openMode`、`toolbarExtensions.buttons`、JSON body、`X-CMS-Cookie`。如果提示 public origin 相关错误，检查 PageBuilder 部署配置。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录 CMS 后重新点击编辑。 |
| 404 | `project_not_found` | CMS 记录绑定的 `pageBuilderProjectId` 不存在或 PageBuilder 内部项目丢失，提示管理员处理。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态，稍后重试或排查 CMS `/ui/login`。 |

## 11. 创建预览页 Handoff 接口

CMS 用户点击“预览 AI 专题”时，CMS 服务端调用同一个 handoff 接口，但 `target` 必须传 `preview`。

CMS 不应直接拼接或保存：

```text
{AI_PAGE_BUILDER_BASE_PATH}/api/workspaces/:workspaceId/preview/
```

### 11.1 请求

```http
POST {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/projects/{pageBuilderProjectId}/handoffs
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
Content-Type: application/json
```

请求体：

```json
{
  "target": "preview",
  "openMode": "iframe"
}
```

### 11.2 成功响应

```http
200 OK
Content-Type: application/json

{
  "handoffId": "handoff_01HX...",
  "openUrl": "https://cms.example.com/pagebuilder/api/integrations/cms/handoffs/handoff_01HX.../open",
  "expiresAt": 1778999612688,
  "target": "preview",
  "openMode": "iframe"
}
```

CMS 浏览器访问 `openUrl` 后，PageBuilder 会设置 access cookie 并跳转到当前项目最新预览页。

### 11.3 预览语义

- 预览展示的是 PageBuilder workspace 当前最新预览产物。
- 预览不触发 ZIP 导出。
- 预览不代表 CMS 已发布版本。
- 预览页不渲染 builder 工具栏扩展按钮；`toolbarExtensions.buttons` 即使出现在 preview handoff body 中也会被忽略。
- 如果项目还没有生成可预览页面，PageBuilder 返回 `preview_not_ready`。
- CMS 收到 `preview_not_ready` 时，应提示用户先进入构建页生成页面，不要改为直接拼内部 preview URL。

### 11.4 常见错误

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查请求体、`target`、`openMode`、`X-CMS-Cookie`。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前 CMS 登录态失效，引导用户重新登录后重新点击预览。 |
| 404 | `project_not_found` | CMS 记录绑定的 PageBuilder 项目不存在，提示管理员处理。 |
| 409 | `preview_not_ready` | 当前项目没有可预览页面，提示用户先进入构建页生成页面。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态，稍后重试或排查 CMS `/ui/login`。 |

## 12. 浏览器消费 Handoff 的行为

CMS 浏览器访问 handoff `openUrl` 后，PageBuilder 会执行以下动作：

1. 校验 handoff 是否存在、未过期、未消费。
2. 根据 handoff 找到对应 PageBuilder 项目。
3. 签发 workspace-scoped access session。
4. 设置 HttpOnly Cookie。
5. 302 跳转到构建页或预览页。

构建页成功响应示例：

```http
302 Found
Set-Cookie: ai_page_builder_access_<workspaceHash>=<signed-token>; HttpOnly; SameSite=Lax; Path=/pagebuilder; Max-Age=28800
Location: /pagebuilder/builder/:workspaceId/:sessionId
```

预览页成功响应示例：

```http
302 Found
Set-Cookie: ai_page_builder_access_<workspaceHash>=<signed-token>; HttpOnly; SameSite=Lax; Path=/pagebuilder; Max-Age=28800
Location: /pagebuilder/api/workspaces/:workspaceId/preview/
```

HTTPS 访问时，`Set-Cookie` 会增加 `Secure`：

```http
Set-Cookie: ai_page_builder_access_<workspaceHash>=<signed-token>; HttpOnly; SameSite=Lax; Secure; Path=/pagebuilder; Max-Age=28800
```

### 12.1 Cookie 行为

- Cookie 名称是 workspace-scoped，形如 `ai_page_builder_access_<workspaceHash>`。
- 同一个浏览器可以同时打开多个 CMS 专题项目，不会因为单一全局 access cookie 相互覆盖。
- Cookie `Path` 与 PageBuilder base path 一致，例如 `/pagebuilder`。
- Cookie 不设置 `Domain`，采用 host-only cookie。
- Cookie 使用 `HttpOnly`，前端 JS 不需要也不应该读取。
- Cookie 使用 `SameSite=Lax`。在同源反向代理前提下，iframe、新窗口、API、preview、静态资源请求都会自动携带该 Cookie。
- 默认 access session TTL 是 8 小时，并在受保护 API 请求成功后按空闲 TTL 续期。

### 12.2 Handoff 失效

handoff 不存在、过期或已消费时，PageBuilder 返回 `handoff_expired`。

```json
{
  "code": "handoff_expired",
  "error": "CMS handoff 已失效，请重新从 CMS 进入"
}
```

CMS 侧处理方式：

- 不要复用旧 `openUrl`。
- 重新请求 CMS 服务端创建新的 handoff。
- iframe 重新挂载时也要重新创建 handoff。

### 12.3 Preview Handoff 不是 Preview-only 权限

第一期 `target: "builder"` 和 `target: "preview"` 共用同一套 Builder Access Session。

也就是说，用户通过 preview handoff 获得的是该项目的 PageBuilder access session，而不是 preview-only token。PageBuilder 第一期不做 preview/edit 权限分级。

CMS 必须在创建 handoff 前自行判断用户是否允许编辑或预览该专题。PageBuilder 写操作仍会受到 edit lock 和后端接口保护，但不会根据 handoff `target` 再做业务权限区分。

## 13. 同步导出 ZIP 接口

CMS 用户点击发布 AI 专题时，CMS 服务端调用同步导出接口获取静态资源 ZIP，然后由 CMS 自行解压、校验和发布。

### 13.1 请求

```http
POST {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/projects/{pageBuilderProjectId}/export
Authorization: Bearer <PAGE_BUILDER_INTEGRATION_SECRET>
X-CMS-Cookie: <当前 CMS 请求的原始 Cookie header>
Content-Type: application/json
```

请求体：

```json
{
  "downloadCmsRemoteAssets": true
}
```

字段说明：

| 字段 | 是否必填 | 默认值 | 说明 |
|---|---:|---|---|
| `downloadCmsRemoteAssets` | 否 | `true` | 是否尽量下载 CMS 远程资源到导出包。建议 CMS 第一版显式传 `true`。 |

### 13.2 成功响应

```http
200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="topic.zip"; filename*=UTF-8''topic.zip

<zip binary>
```

CMS 应把响应体作为二进制 ZIP 处理。

ZIP 根目录会包含 `export-report.json`。如果远程图片、字体、样式表内资源等静态资源离线化失败，PageBuilder 不再阻断本次导出；对应 HTML/CSS 会保留原始外链，并在 `export-report.json` 的 `warnings` 和 `retainedExternalLinks` 中记录 `resource-download-failed`。CMS 可以根据自身发布策略决定是否仅提示用户或进入人工确认。

### 13.3 CMS 发布处理建议

CMS 发布流程建议：

1. 校验当前用户具备发布权限。
2. 调用 PageBuilder 同步导出接口。
3. 将返回 ZIP 写入临时文件。
4. 检查 ZIP 体积是否符合 CMS 发布限制。
5. 解压到 staging 目录。
6. 校验解压路径，防止目录穿越。
7. 校验存在预期入口文件 `index.html`。
8. 可选读取 `export-report.json`，如果 `summary.hasWarnings=true`，向用户展示“部分远程资源保留原始链接”等提示。
9. 校验通过后复制到最终发布目录。
10. 更新 CMS 自身发布状态。

不要把网络流直接写入最终发布目录。导出失败或超时时，不要发布旧内容冒充最新版本。

### 13.4 超时策略

PageBuilder 默认不主动中断同步导出请求，除非部署侧显式配置了服务端导出超时。

CMS HTTP 客户端应自行设置适合发布流程的超时时间，例如：

```text
PAGE_BUILDER_EXPORT_CLIENT_TIMEOUT_MS=60000
```

如果 CMS 客户端超时，应将本次发布标记为失败或进入人工确认流程，不应直接发布旧包。

### 13.5 常见错误

| HTTP 状态 | code | CMS 侧建议 |
|---:|---|---|
| 400 | `invalid_request` | 检查请求体、`downloadCmsRemoteAssets` 类型、`X-CMS-Cookie`。 |
| 401 | `integration_unauthorized` | 检查 `PAGE_BUILDER_INTEGRATION_SECRET`。 |
| 401 | `cms_login_expired` | 当前登录态失效，引导用户重新登录后重新发布。 |
| 404 | `project_not_found` | 绑定的 PageBuilder 项目不存在，阻止发布并提示管理员处理。 |
| 409 | `project_busy` | 项目正在导出或没有可导出产物，提示稍后重试。 |
| 502 | `cms_login_unavailable` | PageBuilder 无法校验 CMS 登录态。 |
| 502 | `export_upstream_failed` | 导出期间 CMS 动态数据渲染、登录态校验等关键上游请求失败，发布失败并保留错误详情供排查；普通静态资源离线化失败只写入 ZIP 内 `export-report.json` 警告。 |
| 504 | `export_timeout` | PageBuilder 服务端显式配置导出超时时可能出现，提示稍后重试。 |

## 14. CMS 页面交互建议

### 14.1 新建 AI 专题

推荐流程：

```text
用户点击新建 AI 专题
  -> CMS 创建自身专题记录
  -> CMS 调 PageBuilder 创建项目
  -> CMS 保存 pageBuilderProjectId
  -> CMS 返回创建成功
```

如果 PageBuilder 初始化失败：

- CMS 记录可以保留。
- `pageBuilderStatus` 标记为 `failed`。
- 页面展示“初始化失败，可重试”。
- 重试时使用同一个 `externalRecordId`。

### 14.2 编辑 AI 专题

推荐流程：

```text
用户点击编辑
  -> CMS 校验编辑权限
  -> CMS 服务端创建 builder handoff，可选携带 toolbarExtensions.buttons
  -> iframe.src = openUrl 或 302/window.open(openUrl)
  -> 如果使用同源 iframe，CMS 父页面监听 ready / toolbar-button-click 消息
  -> CMS 父页面收到扩展按钮点击后执行发布、送审、返回等业务动作
  -> CMS 父页面按需回写 busy / disabled / hidden / label / tooltip 状态
```

CMS 前端不要拼 PageBuilder 构建页 URL。

工具栏按钮扩展适合只在 iframe 模式中使用。新窗口模式下 PageBuilder 仍会渲染初始扩展按钮，但父页面通常无法作为同一个可控容器监听点击消息；如果 CMS 使用新窗口模式，建议仍在 CMS 自己页面上保留发布、送审、返回等业务按钮。

### 14.3 预览 AI 专题

推荐流程：

```text
用户点击预览
  -> CMS 校验预览权限
  -> CMS 服务端创建 preview handoff
  -> iframe.src = openUrl 或 302/window.open(openUrl)
```

CMS 前端不要拼 workspace preview URL。

### 14.4 发布 AI 专题

推荐流程：

```text
用户点击发布
  -> CMS 校验发布权限
  -> CMS 调 PageBuilder 同步导出 ZIP
  -> CMS 临时保存 ZIP
  -> CMS 解压校验
  -> CMS 发布静态资源
```

### 14.5 iframe sandbox 建议

如果 CMS 使用 iframe 嵌入 PageBuilder 构建页，sandbox 至少需要允许脚本和同源能力：

```html
<iframe
  src="handoff-open-url"
  sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
></iframe>
```

如果是预览页 iframe，通常至少需要：

```html
<iframe
  src="handoff-open-url"
  sandbox="allow-scripts allow-same-origin"
></iframe>
```

缺少 `allow-scripts` 或 `allow-same-origin` 可能导致 PageBuilder API、同源 Cookie、预览脚本或静态资源加载异常。

如果 CMS 需要监听 PageBuilder 宿主工具栏消息，不要给构建页 iframe 配置会阻断同源脚本通信的额外隔离策略。第一期工具栏扩展只承诺同源 iframe，不承诺跨源 iframe 通信。

## 15. 调试与内部状态接口

### 15.1 集成模式状态

PageBuilder 提供一个只读状态接口，主要供 PageBuilder 前端和联调排查使用：

```http
GET {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/status
```

该接口不需要 `Authorization`，也不需要 `X-CMS-Cookie`。

CMS 集成模式响应示例：

```json
{
  "integrationMode": "cms",
  "enabled": true,
  "supportedOpenModes": ["iframe", "window"],
  "basePath": "/pagebuilder"
}
```

独立模式响应示例：

```json
{
  "integrationMode": "standalone",
  "enabled": false
}
```

注意：

- 该接口不返回 secret、CMS Cookie、用户信息、workspace、session 或 project binding。
- CMS 业务流程不应依赖该接口做权限判断。
- CMS 服务端模板列表、模板下载、模板导入、模板重命名、模板批量删除、创建项目、创建 handoff 和同步导出仍必须使用 Bearer secret 和 `X-CMS-Cookie`。

### 15.2 Builder Context

PageBuilder 构建页打开后，会由 PageBuilder 前端调用内部上下文接口：

```http
GET {PAGE_BUILDER_API_ORIGIN}/api/integrations/cms/builder-context?workspaceId=<workspaceId>&sessionId=<sessionId>
Cookie: ai_page_builder_access_<workspaceHash>=<signed-token>
```

该接口用于确认当前浏览器是否通过 handoff 获得了对应 workspace/session 的 access session。

CMS 不需要直接调用该接口，也不应保存或依赖 `workspaceId/sessionId`。如果联调时该接口返回 `builder_access_required` 或 `builder_access_mismatch`，通常说明浏览器没有通过 handoff 进入、access cookie 丢失、base path/Cookie Path 配置错误，或同一页面复用了错误项目的最终 URL。

builder context 会把当前 builder handoff 关联的工具栏扩展按钮以 `hostToolbarExtensions.buttons` 返回给 PageBuilder 前端。CMS 不需要直接调用该接口读取按钮配置；联调时如果按钮没有出现，应优先检查创建 builder handoff 时的 `toolbarExtensions.buttons`、按钮字段是否合法、是否使用了 `target: "builder"`，以及 iframe 是否确实通过本次 `openUrl` 进入。

## 16. 错误码表

| code | HTTP 状态 | 说明 | CMS 侧建议 |
|---|---:|---|---|
| `invalid_request` | 400 | 请求参数、请求体、header 或部署相关输入不合法。 | 检查请求参数、JSON、`X-CMS-Cookie`、`target/openMode`、PageBuilder public origin 配置。 |
| `integration_unauthorized` | 401 | CMS server-to-server secret 缺失或无效。 | 检查 `PAGE_BUILDER_INTEGRATION_SECRET` 与 PageBuilder 部署配置是否一致。 |
| `cms_login_expired` | 401 | CMS Cookie 无效、过期，或 `/ui/login` 返回未登录。 | 引导用户重新登录 CMS 后重试。 |
| `cms_login_unavailable` | 502 | PageBuilder 无法调用 CMS `/ui/login`，或响应格式不可用。 | 检查 CMS 管理端地址、网络、代理和 `/ui/login` 响应结构。 |
| `project_conflict` | 409 | CMS 外部记录绑定冲突，无法安全复用已有项目。 | 不要自动新建项目，交由管理员排查绑定数据。 |
| `template_not_found` | 404 | 模板不存在或 `templateId` 不合法。 | 重新获取模板列表，让用户重新选择模板。 |
| `template_import_invalid` | 400 | 模板 ZIP 无法解析、缺少入口、入口不明确、重复路径或加密。 | 提示用户检查 ZIP 内容并重新上传。 |
| `template_size_limit` | 413 | 模板 ZIP 原始大小或解压后大小超过 PageBuilder 限制。 | 提示用户压缩资源或联系管理员调整限制。 |
| `template_import_forbidden` | 403 | 模板 ZIP 包含路径穿越或不支持的特殊文件。 | 拒绝导入，提示用户检查 ZIP 文件。 |
| `template_import_failed` | 500 | 模板导入或按模板创建项目时发生非预期错误。 | 稍后重试，并保留服务端日志供排查。 |
| `template_operation_forbidden` | 403 | 模板重命名或删除时命中路径安全限制或不允许操作。 | 刷新模板列表；仍失败时交由管理员排查模板目录。 |
| `template_operation_failed` | 500 | 模板重命名或删除时发生非预期错误。 | 稍后重试，并保留服务端日志供排查。 |
| `project_not_found` | 404 | `projectId` 或其绑定的 workspace/session 不存在。 | 检查 CMS 保存的 `pageBuilderProjectId`，必要时管理员介入修复。 |
| `handoff_expired` | 404/410 | handoff 不存在、过期或已被消费。 | 重新创建 handoff，不要复用旧 `openUrl`。 |
| `preview_not_ready` | 409 | 当前项目还没有可预览页面产物。 | 提示用户先进入构建页生成页面。 |
| `project_busy` | 409 | 项目正在导出或没有可导出产物。 | 提示稍后重试，不要发布旧内容冒充最新版本。 |
| `export_upstream_failed` | 502 | 导出期间 CMS 动态数据渲染、登录态校验等关键上游请求失败。普通静态资源离线化失败只写入 ZIP 内 `export-report.json` 警告。 | 发布失败，保留服务端日志供排查。 |
| `export_timeout` | 504 | 同步导出超过 PageBuilder 服务端显式配置的超时时间。 | 提示稍后重试，必要时调整超时或改异步流程。 |
| `builder_access_required` | 401 | 浏览器未通过 CMS handoff 进入 PageBuilder。 | 提示从 CMS 重新进入。 |
| `builder_access_mismatch` | 403 | access session 与目标 workspace/session 不匹配。 | 通常是多页面、旧链接或错误 URL，提示从 CMS 重新进入。 |
| `builder_access_origin_forbidden` | 403 | 受保护请求来源不可信，`Origin/Referer` 与 PageBuilder public origin 不一致。 | 检查同源反代、iframe 地址、`AI_PAGE_BUILDER_PUBLIC_ORIGIN`、代理 Host/Proto 配置。 |

## 17. 反向代理与部署要求

### 17.1 同源挂载

生产环境建议 CMS 或 Nginx 将 PageBuilder 挂载在 CMS 同源 base path 下：

```text
https://cms.example.com/pagebuilder/      -> PageBuilder web
https://cms.example.com/pagebuilder/api/  -> PageBuilder API through PageBuilder web/server
```

浏览器看到的 CMS 页面和 PageBuilder 页面必须同源：

```text
scheme 相同
host 相同
port 相同
```

### 17.2 Base Path 剥离规则

公开 base path 在请求到达 PageBuilder Server 前只能剥离一次。

允许的方式：

- Nginx 把 `/pagebuilder/api/status` 原样转发给 PageBuilder Web，由 PageBuilder Web 剥离 `/pagebuilder` 后代理到 Server 的 `/api/status`。
- Nginx 自己剥离 `/pagebuilder` 后转发给 PageBuilder Web，PageBuilder Web 收到 `/api/status` 后直接代理到 Server。

不允许：

- Nginx 和 PageBuilder Web 同时剥离，导致路径错误。
- 拼成 `/pagebuilder/pagebuilder/api/...`。
- PageBuilder 前端请求回退到 CMS 根路径 `/api/...`。

### 17.3 必须保留的请求头

CMS 到 PageBuilder 的代理链路必须保留：

```text
Authorization
X-CMS-Cookie
Host 或 X-Forwarded-Host
X-Forwarded-Proto
```

如果代理丢弃 `Authorization`，会返回 `integration_unauthorized`。

如果代理丢弃 `X-CMS-Cookie`，会返回 `invalid_request` 或登录态相关错误。

如果 `X-Forwarded-Proto` 或 public origin 配置不正确，HTTPS 场景可能导致 Cookie `Secure` 判断错误，或同源校验失败。

### 17.4 iframe 响应头

PageBuilder 构建页 HTML 和预览 HTML 需要允许同源 iframe 嵌入：

```http
Content-Security-Policy: frame-ancestors 'self'
```

不要设置：

```http
X-Frame-Options: DENY
```

否则 CMS 同源 iframe 也会被浏览器阻止。

## 18. 安全注意事项

CMS 侧必须遵守：

- `PAGE_BUILDER_INTEGRATION_SECRET` 只在 CMS 服务端使用。
- 浏览器不直接调用 PageBuilder server-to-server API。
- CMS Cookie 只通过 `X-CMS-Cookie` 在服务端请求中传递。
- CMS Cookie 不进 URL、不进 JSON body、不落库给 PageBuilder 长期使用。
- Handoff `openUrl` 不落库、不复用。
- CMS 自己负责用户业务权限判断。
- CMS 不向普通用户暴露 PageBuilder 内部 `workspaceId/sessionId` 作为业务字段。
- CMS 传入工具栏扩展按钮时，只传非敏感展示字段和按钮 ID；不要传 token、Cookie、URL、HTML、SVG、CSS、JS 回调或任意业务 payload。
- CMS 父页面收到 `toolbar-button-click` 后自行做业务权限与状态校验；不要因为按钮出现在 PageBuilder 工具栏中就跳过 CMS 自身权限判断。
- CMS 发布时必须对 ZIP 做临时文件、目录穿越、入口文件等校验。

PageBuilder 第一期不会在 CMS 用户登出时主动吊销已签发的 PageBuilder access session。已打开的 PageBuilder 页面在 access session TTL 内可能继续有效。若后续需要强一致登出联动，需要新增 CMS 登出回调或 PageBuilder 定期复验机制。

## 19. 最小接入清单

CMS 第一版至少需要完成：

1. 新增 CMS 服务端配置 `PAGE_BUILDER_API_ORIGIN`。
2. 新增 CMS 服务端配置 `PAGE_BUILDER_INTEGRATION_SECRET`。
3. AI 专题记录保存 `pageBuilderProjectId`。
4. 如果接入模板库，CMS 能展示模板列表、打开模板 `previewUrl`、通过 CMS 服务端下载模板 ZIP、上传模板 ZIP、重命名模板、批量删除模板，并可把选中的 `templateId` 传给创建项目接口。
5. 创建 AI 专题时调用 PageBuilder 创建项目接口，可选传 `templateId`。
6. 编辑 AI 专题时调用 PageBuilder handoff 接口，`target: "builder"`。
7. 预览 AI 专题时调用 PageBuilder handoff 接口，`target: "preview"`。
8. iframe 或新窗口只打开 handoff `openUrl`，不拼内部 URL。
9. 如果需要在 PageBuilder 工具栏展示发布、送审、返回等宿主业务按钮，builder handoff 携带 `toolbarExtensions.buttons`，CMS 同源父页面监听点击消息并回写按钮状态。
10. 发布 AI 专题时调用同步导出 ZIP 接口。
11. 每次调用 PageBuilder server-to-server API 时转发当前请求原始 Cookie 到 `X-CMS-Cookie`。
12. 按 PageBuilder 错误码做用户提示和管理员排查提示。
13. 配置同源反向代理，保留 `Authorization` 和 `X-CMS-Cookie`。

## 20. 联调验收清单

建议 CMS 和 PageBuilder 联调时逐项验证：

- 创建项目成功返回 `projectId`。
- 同一个 `externalRecordId` 重复创建返回同一个 `projectId`，且 `created: false`。
- 缺少或错误 secret 返回 `integration_unauthorized`。
- CMS Cookie 失效时返回 `cms_login_expired`。
- CMS `/ui/login` 不可用时返回 `cms_login_unavailable`。
- builder handoff 返回 `openUrl`。
- 浏览器访问 builder `openUrl` 后进入构建页。
- builder handoff 携带合法 `toolbarExtensions.buttons` 后，构建页左侧预览工具栏在内置按钮之后显示扩展按钮。
- builder handoff 携带非法按钮配置时返回 `400 invalid_request`，且不生成可消费 handoff。
- 扩展按钮过长文案不会撑破工具栏；builder handoff 超过数量上限时返回 `400 invalid_request`，父页面动态替换按钮集合超过数量上限时只保留允许数量内的按钮。
- 点击可用扩展按钮后，同源父页面收到 `toolbar-button-click`，消息不包含 secret、CMS Cookie、access cookie 或 handoffId。
- 父页面发送 `toolbar-button-update` 后，按钮能进入 busy/disabled/hidden 或更新文案状态。
- 父页面发送非同源、非父窗口或非法 source 的消息时，PageBuilder 不更新工具栏按钮。
- preview handoff 返回 `openUrl`。
- preview handoff 即使携带 `toolbarExtensions.buttons`，预览页也不显示工具栏扩展按钮。
- 项目没有预览产物时 preview handoff 返回 `preview_not_ready`。
- 浏览器访问 preview `openUrl` 后进入当前最新预览页。
- 同一个 handoff `openUrl` 第二次访问返回 `handoff_expired`。
- 直接打开最终 `/builder/...` URL，在无 access session 时被拦截。
- 直接打开最终 `/api/workspaces/:workspaceId/preview/` URL，在无 access session 时被拦截。
- 同一浏览器同时打开多个专题项目，不互相覆盖 access cookie。
- 同步导出接口返回 `application/zip`。
- 项目正在导出或没有产物时，同步导出返回 `project_busy`；项目编辑中或 Agent 构建中不再阻止同步导出。
- iframe 场景下构建页和预览页可正常加载。
- 模板列表接口返回绝对 `previewUrl`，且该 URL 可在新窗口打开。
- CMS 服务端使用模板 `templateId` 调用固定下载接口能下载 `application/zip`，且浏览器不直接调用 PageBuilder server-to-server 下载接口。
- 模板导入合法 ZIP 后，列表中能看到新模板，预览 URL 可访问。
- 模板重命名后，列表和重命名响应中的名称一致。
- 模板批量删除支持部分成功，失败项返回 `failures` 且成功项从列表中消失。
- 按模板创建项目后，编辑/预览/导出仍使用同一个 `projectId` 闭环。
- PageBuilder 请求路径都在 base path 下，例如 `/pagebuilder/api/...`，没有误请求 CMS 根路径 `/api/...`。

## 附录 A：请求示例

### A.1 获取模板列表

```bash
curl -X GET "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example"
```

按名称搜索：

```bash
curl -X GET "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates?name=活动" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example"
```

成功响应中的 `templates[].previewUrl` 是绝对 URL，可直接给 CMS 前端用于新窗口预览或同源 iframe 预览。模板下载不在列表响应中返回链接；CMS 服务端应使用 `templateId` 调用固定下载接口。

### A.2 下载模板 ZIP

```bash
curl -X GET "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates/tpl_imported_20260617103000_ab12cd34/download" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  --output template.zip
```

CMS 前端如需提供下载按钮，应请求 CMS 自己的下载接口，由 CMS 服务端执行上述请求并转发 ZIP 响应；不要让浏览器直接调用 PageBuilder server-to-server 下载接口。

### A.3 导入模板 ZIP

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates/import" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -F "file=@./template.zip;type=application/zip"
```

注意：`multipart/form-data` 的 boundary 应由 HTTP 客户端自动生成，CMS 不要手工拼接 `Content-Type` boundary。

### A.4 重命名模板

```bash
curl -X PATCH "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates/tpl_imported_20260617103000_ab12cd34" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "新的模板名称"
  }'
```

### A.5 批量删除模板

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates/batch-delete" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
    "templateIds": [
      "tpl_imported_20260617103000_ab12cd34",
      "tpl_missing"
    ]
  }'
```

响应中的 `deletedTemplateIds` 表示删除成功项，`failures` 表示删除失败项；只要请求鉴权和登录态校验通过，单个模板失败不会阻断后续模板处理。

### A.6 创建项目

创建空项目：

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
    "externalRecordId": "cms-topic-123",
    "projectName": "2026 春招 AI 专题",
    "siteId": "1"
  }'
```

按模板创建项目：

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
    "externalRecordId": "cms-topic-123",
    "projectName": "2026 春招 AI 专题",
    "siteId": "1",
    "templateId": "tpl_imported_20260617103000_ab12cd34"
  }'
```

### A.7 项目另存为模板

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects/$PROJECT_ID/templates" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "春招专题模板"
  }'
```

响应中的 `template.previewUrl` 是绝对 URL，可直接用于模板预览；响应不包含 `downloadUrl`，如需下载请继续使用模板下载接口。

### A.8 创建构建页 handoff

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects/$PROJECT_ID/handoffs" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
    "target": "builder",
    "openMode": "iframe"
  }'
```

带工具栏扩展按钮的 builder handoff：

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects/$PROJECT_ID/handoffs" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
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
  }'
```

### A.9 创建预览页 handoff

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects/$PROJECT_ID/handoffs" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
    "target": "preview",
    "openMode": "iframe"
  }'
```

### A.10 同步导出 ZIP

```bash
curl -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: CurrentSite=1; ZUSID=example" \
  -H "Content-Type: application/json" \
  --data '{
    "downloadCmsRemoteAssets": true
  }' \
  --output topic.zip
```

### A.11 本地完整联调脚本

以下脚本用于在本地 CMS 集成模式容器启动后，按本文档接口顺序验证一遍核心链路。示例假设 PageBuilder 以 `/pagebuilder` base path 暴露在 `http://localhost:3333`。

运行前请按实际环境替换：

| 变量 | 示例 | 说明 |
|---|---|---|
| `PAGE_BUILDER_API_ORIGIN` | `http://localhost:3333/pagebuilder` | PageBuilder API 公开访问地址，必须包含 base path。 |
| `PAGE_BUILDER_INTEGRATION_SECRET` | `********` | 与 PageBuilder 部署侧 `AI_PAGE_BUILDER_INTEGRATION_SECRET` 一致。 |
| `CMS_BASE_URL` | `https://cms.work.zving.com/manager` | PageBuilder 部署侧配置的 CMS 管理端地址。 |
| `CMS_COOKIE` | `CurrentSite=1; ZUSID=xxxx` | 当前 CMS 请求原始 Cookie。 |
| `TEMPLATE_ZIP` | `./template.zip` | 可选；设置后脚本会先导入模板，再用返回的 `templateId` 创建项目。 |
| `TEMPLATE_ID` | `tpl_imported_xxx` | 可选；不导入 ZIP 时，可指定已有模板 ID 创建项目。 |

```bash
#!/usr/bin/env bash
set -euo pipefail

PAGE_BUILDER_API_ORIGIN="${PAGE_BUILDER_API_ORIGIN:-http://localhost:3333/pagebuilder}"
PAGE_BUILDER_INTEGRATION_SECRET="${PAGE_BUILDER_INTEGRATION_SECRET:?set PAGE_BUILDER_INTEGRATION_SECRET}"
CMS_BASE_URL="${CMS_BASE_URL:?set CMS_BASE_URL}"
CMS_COOKIE="${CMS_COOKIE:?set CMS_COOKIE}"
TEMPLATE_ZIP="${TEMPLATE_ZIP:-}"
TEMPLATE_ID="${TEMPLATE_ID:-}"
RUN_ID="curl-test-$(date +%Y%m%d%H%M%S)"

json_get() {
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data[sys.argv[1]])' "$1"
}

echo "== 1. PageBuilder integration status =="
curl --noproxy '*' -sS "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/status" \
  | python3 -m json.tool

echo "== 2. CMS /ui/login with the same cookie =="
curl --noproxy '*' -sS "$CMS_BASE_URL/ui/login" \
  -H "Cookie: $CMS_COOKIE" \
  -H "Accept: application/json, text/plain, */*" \
  -H "Cache-Control: no-cache" \
  -H "Pragma: no-cache" \
  -H "Referer: $CMS_BASE_URL/app.html" \
  | python3 -m json.tool

echo "== 3. List CMS templates =="
TEMPLATE_LIST_RESPONSE="$(
  curl --noproxy '*' -sS "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates" \
    -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
    -H "X-CMS-Cookie: $CMS_COOKIE"
)"
printf '%s\n' "$TEMPLATE_LIST_RESPONSE" | python3 -m json.tool

if [[ -n "$TEMPLATE_ZIP" ]]; then
  echo "== 4. Import CMS template zip =="
  IMPORT_RESPONSE="$(
    curl --noproxy '*' -sS -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates/import" \
      -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
      -H "X-CMS-Cookie: $CMS_COOKIE" \
      -F "file=@${TEMPLATE_ZIP};type=application/zip"
  )"
  printf '%s\n' "$IMPORT_RESPONSE" | python3 -m json.tool
  TEMPLATE_ID="$(printf '%s\n' "$IMPORT_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["template"]["id"])')"
elif [[ -n "$TEMPLATE_ID" ]]; then
  echo "== 4. Use existing template: $TEMPLATE_ID =="
else
  echo "== 4. No TEMPLATE_ZIP/TEMPLATE_ID provided; create an empty project =="
fi

if [[ -n "$TEMPLATE_ID" ]]; then
  echo "== 5. Download CMS template zip headers =="
  curl --noproxy '*' -sS -D - "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/templates/$TEMPLATE_ID/download" \
    -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
    -H "X-CMS-Cookie: $CMS_COOKIE" \
    -o "/tmp/pagebuilder-template-${TEMPLATE_ID}.zip" \
    | sed -n '1,20p'
else
  echo "== 5. Skip template download because no TEMPLATE_ID is available =="
fi

echo "== 6. Create PageBuilder project =="
CREATE_BODY="$(
  TEMPLATE_ID="$TEMPLATE_ID" RUN_ID="$RUN_ID" python3 - <<'PY'
import json
import os
body = {
    "externalRecordId": os.environ["RUN_ID"],
    "projectName": f"Curl CMS Integration Test {os.environ['RUN_ID']}",
    "siteId": "1",
}
if os.environ.get("TEMPLATE_ID"):
    body["templateId"] = os.environ["TEMPLATE_ID"]
print(json.dumps(body, ensure_ascii=False))
PY
)"
CREATE_RESPONSE="$(
  curl --noproxy '*' -sS -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects" \
    -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
    -H "X-CMS-Cookie: $CMS_COOKIE" \
    -H "Content-Type: application/json" \
    --data "$CREATE_BODY"
)"
printf '%s\n' "$CREATE_RESPONSE" | python3 -m json.tool
PROJECT_ID="$(printf '%s\n' "$CREATE_RESPONSE" | json_get projectId)"

echo "== 7. Create project again with the same externalRecordId, expecting idempotent response =="
curl --noproxy '*' -sS -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: $CMS_COOKIE" \
  -H "Content-Type: application/json" \
  --data "$CREATE_BODY" \
  | python3 -m json.tool

echo "== 8. Create builder handoff =="
BUILDER_HANDOFF_RESPONSE="$(
  curl --noproxy '*' -sS -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects/$PROJECT_ID/handoffs" \
    -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
    -H "X-CMS-Cookie: $CMS_COOKIE" \
    -H "Content-Type: application/json" \
    --data '{
      "target": "builder",
      "openMode": "iframe"
    }'
)"
printf '%s\n' "$BUILDER_HANDOFF_RESPONSE" | python3 -m json.tool
BUILDER_OPEN_URL="$(printf '%s\n' "$BUILDER_HANDOFF_RESPONSE" | json_get openUrl)"

echo "== 9. Consume builder handoff once, expecting 302 and Set-Cookie =="
curl --noproxy '*' -sS -i "$BUILDER_OPEN_URL" \
  | sed -n '1,20p'

echo "== 10. Consume the same builder handoff again, expecting handoff_expired =="
curl --noproxy '*' -sS "$BUILDER_OPEN_URL" \
  | python3 -m json.tool

echo "== 11. Create preview handoff =="
curl --noproxy '*' -sS -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects/$PROJECT_ID/handoffs" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: $CMS_COOKIE" \
  -H "Content-Type: application/json" \
  --data '{
    "target": "preview",
    "openMode": "iframe"
  }' \
  | python3 -m json.tool

echo "== 12. Export static ZIP =="
curl --noproxy '*' -sS -i -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $PAGE_BUILDER_INTEGRATION_SECRET" \
  -H "X-CMS-Cookie: $CMS_COOKIE" \
  -H "Content-Type: application/json" \
  --data '{
    "downloadCmsRemoteAssets": true
  }' \
  | sed -n '1,40p'

echo "== 13. Wrong secret sanity check, expecting integration_unauthorized =="
curl --noproxy '*' -sS -X POST "$PAGE_BUILDER_API_ORIGIN/api/integrations/cms/projects" \
  -H "Authorization: Bearer wrong-secret" \
  -H "X-CMS-Cookie: $CMS_COOKIE" \
  -H "Content-Type: application/json" \
  --data "$CREATE_BODY" \
  | python3 -m json.tool
```

本地运行示例：

```bash
PAGE_BUILDER_API_ORIGIN="http://localhost:3333/pagebuilder" \
PAGE_BUILDER_INTEGRATION_SECRET="5014796a21551dfe12be292a2bfe65f0dde4a2daab1c4c0cda2dc4cd2aa6897a" \
CMS_BASE_URL="https://cms.work.zving.com/manager" \
CMS_COOKIE="CurrentSite=1; ZUSID=example" \
bash ./pagebuilder-cms-curl-test.sh
```

按模板创建项目示例：

```bash
PAGE_BUILDER_API_ORIGIN="http://localhost:3333/pagebuilder" \
PAGE_BUILDER_INTEGRATION_SECRET="5014796a21551dfe12be292a2bfe65f0dde4a2daab1c4c0cda2dc4cd2aa6897a" \
CMS_BASE_URL="https://cms.work.zving.com/manager" \
CMS_COOKIE="CurrentSite=1; ZUSID=example" \
TEMPLATE_ZIP="./template.zip" \
bash ./pagebuilder-cms-curl-test.sh
```

说明：

- 新创建的空项目通常还没有预览或导出产物，因此 preview handoff 可能返回 `preview_not_ready`，同步导出可能返回 `project_busy`，这是符合预期的接口行为。
- 按模板创建的项目如果模板内已有 `index.html`，通常可以直接创建 preview handoff 并预览；后续编辑、预览、导出仍只使用同一个 `projectId`。
- `curl --noproxy '*'` 用于避免本机 HTTP 代理拦截 `localhost` 或本地域名请求；生产环境不需要该参数。
- builder handoff 首次消费应返回 `302`，并设置 `ai_page_builder_access_<workspaceHash>` HttpOnly Cookie；同一个 handoff 第二次消费应返回 `handoff_expired`。

## 附录 B：CMS 服务端伪代码

### B.1 通用调用封装

```ts
async function callPageBuilder(path, options) {
  const headers = {
    'Authorization': `Bearer ${PAGE_BUILDER_INTEGRATION_SECRET}`,
    'X-CMS-Cookie': options.cmsRequestCookie,
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(PAGE_BUILDER_API_ORIGIN + path, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new PageBuilderError(response.status, error?.code, error?.error)
  }

  return await response.json()
}
```

模板 ZIP 导入应使用 multipart，不应通过 JSON 封装上传：

```ts
async function importPageBuilderTemplateZip(path, options) {
  const formData = new FormData()
  formData.append('file', options.file)

  const response = await fetch(PAGE_BUILDER_API_ORIGIN + path, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAGE_BUILDER_INTEGRATION_SECRET}`,
      'X-CMS-Cookie': options.cmsRequestCookie,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new PageBuilderError(response.status, error?.code, error?.error)
  }

  return await response.json()
}
```

模板下载和同步导出 ZIP 不应使用 JSON 返回封装，应该按二进制响应处理：

```ts
async function fetchPageBuilderBinary(path, options) {
  const headers = {
    'Authorization': `Bearer ${PAGE_BUILDER_INTEGRATION_SECRET}`,
    'X-CMS-Cookie': options.cmsRequestCookie,
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(PAGE_BUILDER_API_ORIGIN + path, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new PageBuilderError(response.status, error?.code, error?.error)
  }

  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get('content-type'),
    contentDisposition: response.headers.get('content-disposition'),
  }
}
```

### B.2 模板库列表、下载、导入与管理

```ts
async function listPageBuilderTemplates(request) {
  await assertCanViewTemplateLibrary(request.user)

  const query = request.query.name
    ? `?name=${encodeURIComponent(String(request.query.name))}`
    : ''

  return await callPageBuilder(`/api/integrations/cms/templates${query}`, {
    method: 'GET',
    cmsRequestCookie: request.headers.cookie,
  })
}

async function downloadPageBuilderTemplate(request, templateId, response) {
  await assertCanDownloadTemplate(request.user)

  const result = await fetchPageBuilderBinary(
    `/api/integrations/cms/templates/${encodeURIComponent(templateId)}/download`,
    {
      method: 'GET',
      cmsRequestCookie: request.headers.cookie,
    },
  )

  response.setHeader('Content-Type', result.contentType || 'application/zip')
  if (result.contentDisposition) {
    response.setHeader('Content-Disposition', result.contentDisposition)
  }
  response.end(Buffer.from(result.bytes))
}

async function importPageBuilderTemplate(request, uploadedFile) {
  await assertCanImportTemplate(request.user)

  return await importPageBuilderTemplateZip('/api/integrations/cms/templates/import', {
    cmsRequestCookie: request.headers.cookie,
    file: uploadedFile,
  })
}

async function renamePageBuilderTemplate(request, templateId, name) {
  await assertCanManageTemplate(request.user)

  return await callPageBuilder(`/api/integrations/cms/templates/${encodeURIComponent(templateId)}`, {
    method: 'PATCH',
    cmsRequestCookie: request.headers.cookie,
    body: { name },
  })
}

async function batchDeletePageBuilderTemplates(request, templateIds) {
  await assertCanManageTemplate(request.user)

  return await callPageBuilder('/api/integrations/cms/templates/batch-delete', {
    method: 'POST',
    cmsRequestCookie: request.headers.cookie,
    body: { templateIds },
  })
}
```

CMS 前端展示模板列表时，直接使用 `template.previewUrl` 做新窗口预览；如果 PageBuilder 与 CMS 同源挂载，也可以把该 URL 放入 iframe。模板下载按钮应请求 CMS 自己的下载接口，由 `downloadPageBuilderTemplate` 这类服务端逻辑根据 `templateId` 转发 PageBuilder ZIP。

### B.3 创建专题时初始化 PageBuilder

```ts
async function createAiTopic(request, topicInput) {
  const topic = await cmsTopicRepository.create(topicInput)

  try {
    const result = await callPageBuilder('/api/integrations/cms/projects', {
      method: 'POST',
      cmsRequestCookie: request.headers.cookie,
      body: {
        externalRecordId: String(topic.id),
        projectName: topic.title,
        siteId: String(topic.siteId),
        ...(topicInput.templateId ? { templateId: String(topicInput.templateId) } : {}),
      },
    })

    await cmsTopicRepository.update(topic.id, {
      pageBuilderProjectId: result.projectId,
      pageBuilderExternalRecordId: String(topic.id),
      ...(result.templateId ? { pageBuilderSourceTemplateId: result.templateId } : {}),
      pageBuilderStatus: 'ready',
    })
  } catch (error) {
    await cmsTopicRepository.update(topic.id, {
      pageBuilderStatus: 'failed',
    })
    throw error
  }

  return topic
}
```

### B.4 将专题另存为模板

```ts
async function saveAiTopicAsPageBuilderTemplate(request, topicId, name) {
  const topic = await cmsTopicRepository.findById(topicId)
  await assertCanSaveTopicAsTemplate(request.user, topic)

  return await callPageBuilder(
    `/api/integrations/cms/projects/${encodeURIComponent(topic.pageBuilderProjectId)}/templates`,
    {
      method: 'POST',
      cmsRequestCookie: request.headers.cookie,
      body: { name },
    },
  )
}
```

CMS 可以直接使用返回的 `template.previewUrl` 打开模板预览，也可以刷新模板列表后展示新模板。该接口不需要 CMS 获取或保存 PageBuilder 的 `workspaceId`、`sessionId`、编辑锁或 Builder Access Cookie。

### B.5 打开编辑页

```ts
async function openPageBuilderEditor(request, response, topicId) {
  const topic = await cmsTopicRepository.findById(topicId)
  await assertCanEditTopic(request.user, topic)

  const handoff = await callPageBuilder(
    `/api/integrations/cms/projects/${encodeURIComponent(topic.pageBuilderProjectId)}/handoffs`,
    {
      method: 'POST',
      cmsRequestCookie: request.headers.cookie,
      body: {
        target: 'builder',
        openMode: 'iframe',
        toolbarExtensions: {
          buttons: [
            {
              id: 'publish',
              label: '发布专题',
              tooltip: '发布到 CMS',
              icon: 'send',
              variant: 'primary',
              requiresPreview: true,
              order: 10,
            },
            {
              id: 'audit',
              label: '送审',
              icon: 'check',
              order: 20,
            },
          ],
        },
      },
    },
  )

  response.json({ openUrl: handoff.openUrl })
}
```

CMS 前端在同源 iframe 场景下可以监听 PageBuilder 工具栏消息：

```ts
function mountPageBuilderEditor(frame: HTMLIFrameElement, openUrl: string) {
  frame.src = openUrl

  window.addEventListener('message', async (event) => {
    if (event.origin !== window.location.origin) return
    if (event.source !== frame.contentWindow) return
    if (event.data?.source !== 'page-builder-host-bridge') return

    if (event.data.type === 'ready') {
      return
    }

    if (event.data.type !== 'toolbar-button-click') {
      return
    }

    if (event.data.buttonId === 'publish') {
      updatePageBuilderToolbarButton(frame, 'publish', {
        busy: true,
        disabled: true,
        label: '发布中',
      })

      try {
        await publishTopic()
        updatePageBuilderToolbarButton(frame, 'publish', {
          busy: false,
          disabled: false,
          label: '已发布',
          tooltip: '已发布到 CMS',
        })
      } catch {
        updatePageBuilderToolbarButton(frame, 'publish', {
          busy: false,
          disabled: false,
          label: '重新发布',
          tooltip: '发布失败，请重试',
        })
      }
    }
  })
}

function updatePageBuilderToolbarButton(
  frame: HTMLIFrameElement,
  buttonId: string,
  patch: {
    label?: string
    tooltip?: string
    disabled?: boolean
    busy?: boolean
    hidden?: boolean
  },
) {
  frame.contentWindow?.postMessage({
    source: 'page-builder-host-parent',
    type: 'toolbar-button-update',
    version: 1,
    buttonId,
    patch,
  }, window.location.origin)
}
```

### B.6 打开预览页

```ts
async function openPageBuilderPreview(request, response, topicId) {
  const topic = await cmsTopicRepository.findById(topicId)
  await assertCanPreviewTopic(request.user, topic)

  const handoff = await callPageBuilder(
    `/api/integrations/cms/projects/${encodeURIComponent(topic.pageBuilderProjectId)}/handoffs`,
    {
      method: 'POST',
      cmsRequestCookie: request.headers.cookie,
      body: {
        target: 'preview',
        openMode: 'iframe',
      },
    },
  )

  response.json({ openUrl: handoff.openUrl })
}
```

### B.7 发布时同步导出 ZIP

```ts
async function publishAiTopic(request, topicId) {
  const topic = await cmsTopicRepository.findById(topicId)
  await assertCanPublishTopic(request.user, topic)

  const exportResult = await fetchPageBuilderBinary(
    `/api/integrations/cms/projects/${encodeURIComponent(topic.pageBuilderProjectId)}/export`,
    {
      method: 'POST',
      cmsRequestCookie: request.headers.cookie,
      body: {
        downloadCmsRemoteAssets: true,
      },
    },
  )

  const tempZipPath = await writeTempZip(exportResult.bytes)
  const stagingDir = await unzipToStaging(tempZipPath)

  await assertNoZipSlip(stagingDir)
  await assertFileExists(stagingDir, 'index.html')
  await publishStaticFiles(stagingDir, topic)
}
```

## 附录 C：PageBuilder 部署侧联调变量

以下变量由 PageBuilder 部署侧配置，CMS 开发联调时需要知道其含义，但通常不由 CMS 业务代码读取。

| 变量 | 示例 | 说明 |
|---|---|---|
| `AI_PAGE_BUILDER_INTEGRATION_MODE` | `cms` | 启用 CMS 集成模式。 |
| `AI_PAGE_BUILDER_INTEGRATION_SECRET` | `********` | 与 CMS 侧 `PAGE_BUILDER_INTEGRATION_SECRET` 保持一致。 |
| `AI_PAGE_BUILDER_CMS_BASE_URL` | `https://cms.example.com/manager` | PageBuilder 调 CMS `/ui/login` 的 CMS 管理端 baseUrl，不是站点访问 URL。 |
| `AI_PAGE_BUILDER_PUBLIC_ORIGIN` | `https://cms.example.com` | 浏览器可访问的公开 origin，不能带 path。 |
| `AI_PAGE_BUILDER_BASE_PATH` | `/pagebuilder` | PageBuilder 在 CMS 同源下的挂载路径。 |
| `AI_PAGE_BUILDER_HANDOFF_TTL_MS` | `120000` | handoff 有效期，默认 2 分钟。 |
| `AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS` | `28800000` | access session 有效期，默认 8 小时。 |
| `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` | `0` | PageBuilder 服务端同步导出超时，`0` 表示不主动超时。 |
| `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB` | `100` | 模板导入 ZIP 原始大小上限，单位 MB。 |
| `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB` | `500` | 模板导入 ZIP 解压后累计大小上限，单位 MB。 |

本地联调示例：

```text
PAGE_BUILDER_API_ORIGIN=http://localhost.var123.cn:8088/pagebuilder
```

对应创建项目 URL：

```text
http://localhost.var123.cn:8088/pagebuilder/api/integrations/cms/projects
```

如果使用多级 base path：

```text
PAGE_BUILDER_API_ORIGIN=https://cms.example.com/ai/pagebuilder
```

对应创建项目 URL：

```text
https://cms.example.com/ai/pagebuilder/api/integrations/cms/projects
```
