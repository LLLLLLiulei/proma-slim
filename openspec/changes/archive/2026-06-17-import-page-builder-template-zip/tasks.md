## 1. 后端导入基础

- [x] 1.1 选择并接入低内存/流式 zip 解压依赖，验证其在 Bun 本地测试环境可枚举 entry 并提取文件
- [x] 1.2 增加模板导入配置解析，支持 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB` 默认 100MB 和 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB` 默认 500MB
- [x] 1.3 在 shared types 中增加模板导入响应类型和前端 API 所需类型导出

## 2. 后端导入服务

- [x] 2.1 新增模板 zip 导入服务或服务方法，支持保存上传 zip 到临时文件并在失败时清理临时产物
- [x] 2.2 实现 zip entry 路径规范化、安全校验和无关系统文件忽略逻辑
- [x] 2.3 实现入口识别规则：根目录 `index.html`、`workspace-files/index.html`、单一顶层目录 `index.html`、全包唯一 `index.html`
- [x] 2.4 实现原始 zip 大小和解压后总大小校验，超限时停止导入并返回明确错误
- [x] 2.5 实现站点根目录内容提取到临时模板 `workspace-files/`，保留脚本和外链资源且不做远程资源离线化
- [x] 2.6 生成新的本地 templateId、`template.json` 和 `reports/template-import-report.json`，并原子移动到正式模板目录

## 3. 后端 HTTP 与预览隔离

- [x] 3.1 新增 `POST /api/page-builder/templates/import` multipart 路由，读取 `file` 并映射导入服务错误到合适 HTTP 响应
- [x] 3.2 调整 CMS 集成访问边界，使 CMS 生产模式下模板库列表、详情、预览、下载、重命名、删除、使用和导入 API 全量可用
- [x] 3.3 为模板 HTML 预览响应增加 CSP sandbox 隔离，允许脚本运行并授予 `allow-same-origin` 以支持字体等同源资源加载
- [x] 3.4 补充后端测试覆盖导入成功、入口识别、大小限制、路径穿越、无入口、多入口、CMS 模式导入例外和预览 CSP

## 4. 前端导入入口

- [x] 4.1 在 renderer API 中增加 `importPageBuilderTemplate(file)`，使用 `multipart/form-data` 上传 zip
- [x] 4.2 扩展 `usePageBuilderTemplates`，增加导入状态、导入方法、成功刷新列表和失败错误反馈
- [x] 4.3 在首页模板库 Header 的刷新按钮左侧增加“导入模板”按钮和隐藏文件选择器
- [x] 4.4 实现导入中禁用重复提交、导入失败提示、导入结束后允许重复选择同一文件
- [x] 4.5 补充前端测试覆盖导入按钮展示、上传 FormData、成功刷新、失败反馈和 CMS 生产首页展示模板库但不展示“使用模板”入口

## 5. 文档与验证

- [x] 5.1 更新模板库需求/任务拆分文档中“zip 导入”为非目标的描述，改为支持任意包含 `index.html` 的静态 zip 导入
- [x] 5.2 运行相关后端和前端单元测试
- [x] 5.3 运行 `openspec validate import-page-builder-template-zip --strict`
- [x] 5.4 运行类型检查和 `git diff --check`
