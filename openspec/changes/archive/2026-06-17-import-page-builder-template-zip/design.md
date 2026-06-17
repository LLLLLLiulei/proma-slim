## Context

当前 PageBuilder 模板库的模板来源主要是 Builder 页面“另存为模板”，后端通过扫描 `getConfigDir()/page-builder-templates/` 读取 `template.json` 和 `workspace-files/`。用户如果已经在其他平台生成了静态页面，只能手工迁移文件，无法通过模板库复用。

本 change 需要把“任意包含 `index.html` 的静态 zip”导入为现有模板格式，同时不破坏已有模板列表、预览、使用模板、删除和重命名流程。由于导入来源不可信，设计重点是 zip 入口识别、路径安全、大小限制、临时目录原子落盘和预览隔离。

## Goals / Non-Goals

**Goals:**

- 支持上传任意包含 `index.html` 的静态 zip 并导入为 PageBuilder 用户模板。
- 将外部 zip 统一整理为现有模板目录结构：`template.json` + `workspace-files/`。
- 支持 zip 原始大小和解压后总大小限制，默认分别为 100MB 和 500MB，且可通过环境变量配置。
- 允许导入页面中的本地、内联和远程 JavaScript 保留并运行，模板预览通过 CSP sandbox 隔离，同时授予 `allow-same-origin` 以支持字体等同源资源加载。
- CMS 集成生产模式下模板库 API 全量开放；首页展示模板库和导入入口，但不展示“使用模板”入口、standalone prompt 创建入口或历史记录 Tab。
- 首页模板库增加导入入口，导入成功后刷新列表。

**Non-Goals:**

- 不做外部 URL 抓取。
- 不做远程资源自动下载或离线化。
- 不支持批量导入多个 zip。
- 不在 CMS 集成生产首页展示模板库或导入按钮。
- 不替换现有静态导出 zip 生成逻辑。
- 不为导入模板新增数据库、索引文件或模板市场能力。

## Decisions

### 1. 新增导入 API，复用现有模板 registry

新增 `POST /api/page-builder/templates/import`，请求使用 `multipart/form-data`，字段为 `file`。成功后返回 `PageBuilderTemplateImportResponse`，其中包含现有 `PageBuilderTemplateSummary`。

导入后的模板仍落在 `getConfigDir()/page-builder-templates/<templateId>/`，列表和详情继续通过实时目录扫描获得。这样不需要新增数据库或索引，也能复用现有预览、使用、删除和重命名能力。

### 2. 导入时始终生成新的本地 templateId

外部 zip 可能包含重复、非法或恶意构造的 `template.json.id`，因此导入时不复用 zip 内 ID。模板名称优先读取 zip 内合法 `template.json.name`，否则使用上传文件名去掉 `.zip` 后的名称；导入后用户仍可通过模板卡片标题重命名。

### 3. 入口识别采用可解释规则

导入服务按以下顺序识别站点根目录：

1. zip 根目录存在 `index.html`，以根目录为站点根。
2. zip 存在 `workspace-files/index.html`，按 PageBuilder 模板包兼容处理。
3. zip 只有一个顶层目录且该目录下存在 `index.html`，以该顶层目录为站点根。
4. 全 zip 只有一个 `index.html`，以该文件所在目录为站点根。
5. 其他情况失败，并返回明确错误。

选择该规则是为了覆盖常见静态站点导出结构，同时避免多个入口时系统猜错。

### 4. 使用低内存/流式 zip 解压库，仅用于导入链路

当前项目使用 `fflate.unzipSync` 和 `zipSync` 处理模板与静态导出 zip。`fflate` 性能高，但同步整包解压会在 100MB zip / 500MB 解压上限下产生较高内存峰值。

导入链路新增更适合大 zip 的低内存/流式解压依赖，优先采用 `node-stream-zip`；如果实现阶段发现 Bun 兼容性问题，则回退到 `yauzl` / `yauzl-promise`，但不改变对外行为。现有静态导出 zip 生成继续保留 `fflate`，避免扩大本 change 范围。

### 5. 双大小限制，不限制文件数量

导入服务读取环境变量：

- `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB`，默认 `100`
- `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB`，默认 `500`

原始 zip 大小在读取请求文件后校验；解压后总大小在枚举或提取 entry 时累计校验。文件数量不限制。环境变量缺失、非数字或小于等于 0 时回退默认值。

### 6. 临时目录导入，校验成功后原子落盘

导入流程先写入临时 zip 文件，再把识别出的站点根目录内容提取到临时模板目录的 `workspace-files/`。生成 `template.json` 和 `reports/template-import-report.json` 后，复用模板输出校验，全部成功后再 `rename` 到正式模板目录。任何失败都清理临时文件和临时目录。

### 7. 允许 JS 运行，但模板预览必须隔离

用户导入的外部模板可能依赖本地或远程 JS。为了最大程度还原页面效果，导入时不因脚本存在而拒绝。但模板预览 HTML 响应必须增加 CSP sandbox，例如：

```http
Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-same-origin; frame-ancestors 'self'
```

授予 `allow-same-origin`，以保证导入模板中的字体、样式等同源资源能按浏览器规则正常加载。模板卡片 iframe 仍通过自身 sandbox 约束交互能力。

### 8. CMS 集成生产模式开放模板库 API

CMS 集成生产模式下模板库不再区分 CMS/standalone 可用性：模板列表、详情、预览、下载、重命名、删除、使用模板和导入 API 均可按模板库语义工作。PageBuilder 首页在 CMS 集成生产模式下可以展示模板库和导入入口，但不展示“使用模板”入口、standalone prompt 创建入口或历史记录 Tab。

## Risks / Trade-offs

- **Zip bomb 或超大解压导致资源压力** → 通过 zip 原始大小和解压后总大小限制降低风险；实现必须把可捕获解压异常转换为明确错误并清理临时目录。
- **文件数量不限制可能造成大量小文件开销** → 按用户要求不限制文件数；后续如出现实际问题再增加可配置文件数限制。
- **导入页面脚本可能执行恶意逻辑** → 预览响应使用 CSP sandbox；为保证字体等同源资源加载授予 `allow-same-origin`，模板卡片 iframe 仍通过自身 sandbox 约束交互能力。
- **外部资源不可用导致预览缺失** → 一期不做远程资源离线化，导入结果按原始链接运行；用户可在 Builder 中继续调整。
- **多个 `index.html` 结构可能无法自动判断入口** → 采用确定性入口识别规则，多入口不明确时失败并提示用户整理 zip。
- **新增 zip 依赖在 Bun/Docker 中兼容性不确定** → 实现阶段先做最小兼容性验证，必要时切换到 `yauzl` 系列库，行为要求保持一致。
