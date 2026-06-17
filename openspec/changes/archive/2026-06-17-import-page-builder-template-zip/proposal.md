## Why

PageBuilder 模板库当前只能消费系统内部另存出的模板，用户无法复用其他平台已有的静态页面或模板资产。支持导入任意包含 `index.html` 的静态 zip，可以让已有页面快速进入模板库，并继续走现有预览、使用、重命名和删除流程。

## What Changes

- 在模板库后端新增 zip 导入 API，接受用户上传的 `.zip` 文件并导入为 PageBuilder 用户模板。
- 支持任意包含 `index.html` 的静态站点 zip，自动识别站点根目录并统一整理为现有模板目录结构。
- 导入时始终生成新的本地 `templateId`，模板名称优先取 zip 内合法 `template.json.name`，否则取上传文件名。
- 增加 zip 原始大小和解压后总大小限制：默认分别为 100MB 和 500MB，并支持通过环境变量配置。
- 引入更适合大 zip 的低内存/流式解压依赖，仅用于模板导入链路。
- 在模板预览响应上增加 CSP sandbox 隔离策略，允许导入页面脚本和同源资源加载。
- 首页模板库在刷新按钮左侧增加“导入模板”入口，导入成功后刷新列表。
- CMS 集成生产模式下模板库 API 全量开放；首页展示模板库和导入入口，但不展示“使用模板”入口、standalone prompt 创建入口或历史记录 Tab。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `page-builder-template-registry`: 增加任意静态 zip 导入 API、导入校验、模板落盘规则、导入大小限制、CMS 集成模式模板库开放和模板预览隔离要求。
- `page-builder-home-template-library`: 增加首页模板库“导入模板”入口、上传状态、成功刷新和失败反馈行为。

## Impact

- 后端 API：新增 `POST /api/page-builder/templates/import`。
- 后端服务：模板服务需要新增导入管道、zip 入口识别、临时目录写入、原子落盘和导入报告。
- 依赖：新增一个低内存/流式 zip 解压库；现有静态导出压缩逻辑继续保留 `fflate`。
- 配置：新增 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB` 和 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB`。
- 前端：模板库 Header 新增导入按钮和文件选择上传逻辑。
- 安全：模板预览 HTML 需要增加 CSP sandbox 隔离，避免导入 zip 中的脚本获得同源权限。
