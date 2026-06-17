## Context

PageBuilder 模板库一期先建设后端注册表能力。当前工程已有 PageBuilder workspace、workspace 预览、CMS 集成访问控制、public base path 和历史项目 API，但没有用户模板目录、模板 manifest 校验、模板只读预览和删除用户模板的统一服务。

模板库后续能力分为多段：当前 change 只提供“已有模板可以被发现、查看、预览和删除”的基础 API；“当前项目另存为模板”“使用模板创建 workspace”和首页模板库 UI 由后续 change 消费这些 API。

## Goals / Non-Goals

**Goals:**

- 提供用户模板根目录：`getConfigDir()/page-builder-templates/`。
- 实时扫描用户模板目录，读取并校验 `template.json` v1。
- 提供模板列表、详情、只读预览、删除用户模板 API。
- 预览只服务模板 `workspace-files/`，不创建 workspace，不注入 PageBuilder 或 CMS 运行时。
- 所有浏览器可用 URL 都通过 `buildPageBuilderPublicUrl()` 生成，兼容 `AI_PAGE_BUILDER_BASE_PATH`。
- CMS 集成生产模式阻断全局模板库 API；开发 CMS 集成模式允许现有 dev bypass。

**Non-Goals:**

- 不实现当前项目另存为模板。
- 不实现使用模板创建 PageBuilder workspace。
- 不修改首页或 Builder UI。
- 不扫描内置模板目录。
- 不支持模板缩略图、截图、模板市场、zip 导入或外部 URL 抓取。
- 不支持 CMS 动态绑定迁移/复用。

## Decisions

### 1. 模板 registry 使用请求期目录扫描

每次列表、详情、预览和删除请求都扫描 `page-builder-templates/` 一级子目录，并基于合法 manifest 生成 registry。

理由：

- 一期明确不新增数据库、索引文件或额外存储。
- 模板数量预期较小，请求期扫描足够简单可靠。
- 后续另存模板和删除模板后天然实时可见，无需缓存失效协议。

替代方案：进程内缓存或持久索引。暂不采用，避免引入一致性和清理复杂度。

### 2. manifest 严格校验但未知字段不直接失败

合法模板必须满足：

- 子目录是普通目录，不跟随 symlink。
- `template.json` 存在且 JSON 合法。
- `version === 1`。
- `id` 匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`。
- `id`、目录名和路由参数一致。
- `sourceKind === 'saved-project'`。
- `entry === 'workspace-files/index.html'`。
- `workspace-files/index.html` 存在。

未知字段不导致模板非法，但 API 不返回 `thumbnail` / `thumbnailUrl`。这样可以兼容未来 manifest 扩展，同时确保一期不暴露缩略图能力。

### 3. 模板预览不复用 workspace 预览服务

模板预览新增独立静态文件响应逻辑，不调用 `createWorkspacePreviewResponse()`。

理由：

- workspace 预览会处理 PageBuilder bridge、CMS rendering preview runtime 和 CMS asset proxy，这些都不应出现在只读模板预览中。
- 模板预览不具备 workspace 上下文，也不应被 Agent 或编辑工具识别为可编辑页面。

预览路径解析要求：

- `/preview/` 映射到 `workspace-files/index.html`。
- `/preview/*` 映射到 `workspace-files/*`。
- 请求路径先去除前导 `/`，再用 `resolve()` 解析。
- 目标文件存在后使用真实路径校验，防止 symlink 或路径穿越逃逸 `workspace-files/`。
- 目录请求不做目录索引；除根预览入口外，目录请求返回 404。
- HTML 响应设置 `content-type: text/html; charset=utf-8` 和 `cache-control: no-store`；其他资源至少设置 `cache-control: no-store`。

### 4. 删除只能删除合法用户模板

`DELETE /api/page-builder/templates/:templateId` 必须先通过 registry 定位合法用户模板，再删除该模板目录。

理由：

- 不让 API 变成任意目录清理工具。
- 非法模板不会出现在列表中，也不会被删除接口解析到；用户可手工清理损坏目录。
- 删除只影响模板目录，不影响已经或未来由其他 change 创建的 workspace。

### 5. CMS 集成访问边界沿用现有 helper

全局模板库 API 在 CMS 集成模式下调用：

```ts
assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可访问全局模板库', {
  allowDevStandaloneEntry: true,
})
```

结果：

- 生产 CMS 集成模式阻断全局模板库 API。
- 开发 CMS 集成模式在 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS=true` 时允许调试 standalone 模板库。
- 当前 change 不引入 Builder Access Session 例外；后续“当前 workspace 另存模板”API 由独立 change 处理。

## Risks / Trade-offs

- [Risk] 请求期扫描在模板数量很大时可能变慢。→ 一期模板规模有限；后续如需缓存，只能使用短 TTL 进程内缓存并保证另存/删除后立即失效。
- [Risk] 非法模板被跳过后用户无法通过 API 删除。→ 这是刻意的安全取舍；损坏模板目录应由本地文件系统清理或后续专门维护接口处理。
- [Risk] 模板内资源引用远程 URL 时预览仍会由浏览器直连远程资源。→ Change 1 只读取既有模板，不负责模板质量生成；另存模板 change 会负责阻断不合规运行时依赖和关键资源失败。
- [Risk] `Bun.file` 内容类型推断可能不覆盖所有资源类型。→ HTML 明确设置 content type；其他资源第一期可使用运行时默认推断，必要时后续补 MIME 映射。

## Migration Plan

- 新增 API 和本地目录，不修改已有 workspace、历史记录或静态导出数据。
- 未创建任何模板时列表返回空数组，现有功能不受影响。
- 回滚时删除路由和服务即可；本 change 不迁移或改写用户数据。

## Open Questions

- 无阻塞问题。Change 1 按“只处理合法用户模板、不提供损坏模板清理 API、开发 CMS 模式允许 dev bypass”的口径推进。
