## Why

PageBuilder 模板库一期需要先具备可靠的用户模板后端注册表能力，后续“另存为模板”“使用模板创建项目”和首页模板库 UI 都依赖它。当前工程还没有模板目录扫描、manifest 校验、只读预览和删除用户模板的统一能力，直接做前端或实例化会缺少稳定的 API 与安全边界。

## What Changes

- 新增用户模板目录约定：从本地配置目录下的 `page-builder-templates/` 扫描用户保存的模板。
- 新增模板 manifest 读取与校验能力，第一期只接受 `template.json` v1、`sourceKind: saved-project`、`entry: workspace-files/index.html` 的用户模板。
- 新增模板列表、详情、只读预览和删除用户模板 API。
- 模板预览只服务模板目录中的 `workspace-files/`，不创建 workspace、不写历史记录、不注入 PageBuilder preview bridge、不注入 CMS rendering preview runtime。
- 一期不扫描内置模板目录，不支持缩略图字段或缩略图 API。
- CMS 集成生产模式下不开放全局模板库 API；开发 CMS 集成模式允许沿用现有 dev bypass 进入 standalone 调试能力。

## Capabilities

### New Capabilities

- `page-builder-template-registry`: 定义 PageBuilder 用户模板注册表能力，包括用户模板目录、`template.json` v1 校验、实时目录扫描、列表/详情、只读预览、删除用户模板，以及 CMS 集成模式下全局模板库 API 的访问边界。

### Modified Capabilities

- 无。

## Impact

- 影响后端路径工具、PageBuilder 路由和新的模板服务：
  - `apps/app/src/main/lib/config-paths.ts`
  - `apps/app/src/main/lib/page-builder-template-service.ts`
  - `apps/app/src/main/http/routes/page-builder.ts`
- 可能新增 shared public types：
  - `packages/shared/src/types/page-builder-template.ts`
  - `packages/shared/src/types/index.ts`
- 需要补充 HTTP 路由和模板服务测试，覆盖合法模板、非法模板跳过、预览路径安全、删除规则、无缩略图返回和 CMS 模式访问边界。
