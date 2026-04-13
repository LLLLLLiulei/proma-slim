## Context

当前 page-builder 的 CMS 读取链路建立在旧 `/ui/*` 接口与 Cookie 登录态之上，宿主配置依赖 `ZUSID`、`CurrentSite` 和固定请求头。这与已经实测可用的 slim API `/manager/api/*` 不一致，也让 CMS 浏览、runtime tools、预览资源重写与离线导出共享同一套脆弱的宿主鉴权策略。

基于真实接口探测，当前迁移约束已经明确：

- `baseUrl` 必须直接包含 `/manager`，例如 `https://cms.work.zving.com/manager`
- `POST {baseUrl}/api/token` 使用 `username/password` 返回 `Bearer` token 和 `expires_in`
- `siteID` 语义与现有 `CurrentSite` 对齐，默认使用 `1`
- `/api/catalogs/{id}/contents` 保留 0-based `pageIndex`
- 资源 URL 可直接访问，不需要鉴权头，但代理必须保留原始 query
- `loadextend` 在实测的 12 个有内容栏目上与省略/`false` 返回完全一致，不能作为恢复旧扩展结构的依据
- slim API 的内容列表未稳定提供 `extendJSON`、`shape` 相关计数或素材提示字段

这次变更是跨 `apps/app`、`apps/page-builder`、`packages/shared` 与 `packages/page-builder-cms-rendering` 的横切调整，并且会改变宿主配置模型与共享内容摘要 contract，因此需要在编码前固定设计。

## Goals / Non-Goals

**Goals:**

- 将 page-builder CMS 读取链路统一迁移到 `{baseUrl}/api/*` slim API
- 将宿主 CMS 配置改为 `baseUrl + siteID + username + password`
- 通过宿主侧 token provider 管理 Bearer token，并按过期时间刷新
- 保留 `/api/page-builder/cms/*` 代理入口，避免前端和 runtime islands 直接持有外部 CMS 鉴权
- 简化归一化 CMS 内容摘要类型，移除 slim API 无法稳定提供的形状与素材语义
- 保持 CMS 浏览弹框、preview、static export 与 runtime SDK tools 继续可用

**Non-Goals:**

- 不引入 CMS 写入、发布、删除能力
- 不重做 CMS 浏览弹框整体交互或视觉布局
- 不尝试从 `loadextend` 或正文内容中重新推导复杂素材结构
- 不移除 `/api/page-builder/cms/assets` 代理入口
- 不为本次迁移增加新的作者模板语法或动态 CMS 查询模式

## Decisions

### 1. `baseUrl` 直接包含 `/manager`，网关统一使用相对 `/api/*` 路径

宿主配置中的 `baseUrl` 直接表示 CMS manager 根地址，网关始终向 `${baseUrl}/api/token`、`${baseUrl}/api/catalogsTree`、`${baseUrl}/api/catalogs` 和 `${baseUrl}/api/catalogs/{id}/contents` 发起请求。

这样做的原因：

- 与真实可用入口对齐，避免在代码中隐式补 `/manager`
- 降低环境差异导致的路径拼接歧义
- 让配置文件和日志中的目标地址具有唯一含义

替代方案：

- 在代码中对任意 CMS host 自动补 `/manager`
  - 未采用，因为会让配置含义不稳定，也更难定位错误环境配置

### 2. 宿主配置改为 `baseUrl/siteID/username/password`，`siteID` 默认为 `1`

新的 CMS 配置模型只保留 slim API 接入必需字段：

- `baseUrl`
- `siteID`，默认 `1`
- `username`
- `password`

Cookie 相关字段不再作为主配置来源。

这样做的原因：

- 与新鉴权模型一致
- 保持配置最小化，避免同时维护 cookie/token 双轨模型
- 允许不同环境显式覆盖 `siteID`

替代方案：

- 继续兼容 `ZUSID`/`CurrentSite`/cookie 作为主路径
  - 未采用，因为这会延续旧链路心智并增加实现分支

### 3. 使用进程内 token provider，并按过期时间提前刷新

`CmsGateway` 不再自己持有短生命周期 token，而是依赖宿主侧共享 token provider：

- 首次请求前使用 `username/password` 获取 token
- 缓存 token 与到期时间
- 在接近过期时提前刷新
- 401/403 视为鉴权异常并触发脱敏错误，不回退到 Cookie 模式

这样做的原因：

- `CmsGateway` 目前按请求临时创建，实例级缓存无效
- 进程内缓存足以覆盖当前宿主使用方式
- 避免每次读取栏目、内容或代理资源前都重新登录

替代方案：

- 每个请求都重新调用 `/api/token`
  - 未采用，因为会显著放大上游调用和失败面
- 将 token 持久化到磁盘
  - 未采用，因为当前没有持久化需求，也会增加失效与安全复杂度

### 4. 栏目树使用 `/api/catalogsTree`，栏目详情由 `/api/catalogs` 结果组装

栏目浏览与详情分两条读取路径：

- 栏目树与扁平列表基础结构来自 `/api/catalogsTree?siteID=...`
- 栏目详情所需的 `alias`、`innerCode`、`status`、`logoFile` 等 richer metadata 来自 `/api/catalogs?siteID=...&level=All`

`/api/catalogs` 实测可以返回完整 catalog metadata，而 `/api/catalogsTree` 更适合直接构建嵌套树。文档中没有独立的栏目详情接口，因此 `GET /api/page-builder/cms/catalogs/:catalogId` 将由宿主在 catalog list/tree 数据之上组装。

这样做的原因：

- 避免继续依赖 undocumented 的旧 `/ui/catalogs/:id`
- 直接使用文档中声明且实测可用的 slim API
- 让树结构和详情字段都来自可验证的数据源

替代方案：

- 继续调用旧栏目详情接口
  - 未采用，因为与本次迁移目标冲突
- 只依赖 `/api/catalogsTree`
  - 未采用，因为 tree 返回字段不足以稳定覆盖 detail 面板

### 5. 归一化内容摘要 contract 收缩为基础摘要字段

`PageBuilderCmsContentSummary` 以及 runtime ViewModel 收缩为 slim API 能稳定提供的字段集合：

- `id`
- `catalogId`
- `title`
- `summary`
- `publishUrl`
- `listLogoUrl?`
- `addedAt?`

以下字段移除：

- `shape`
- `assetCounts`
- `assetHints`

同时移除仅服务于旧 UI 接口的 query 字段，例如 `contentSelectType` 和 `title`。

这样做的原因：

- slim API 实测未稳定提供 `extendJSON` 与多媒体计数字段
- `loadextend` 对返回值无可观察差异，不能作为兼容保障
- 继续保留这些字段只会制造伪精度和复杂兼容逻辑

替代方案：

- 基于 `contentTypeID`、`quantity`、`logoMode` 启发式推导 `shape`
  - 未采用，因为你已经确认这些语义可以去除，而且启发式结果不可验证

### 6. 保留资产代理，但去除资源鉴权头依赖

`/api/page-builder/cms/assets` 继续作为 page-builder 预览与导出的统一 CMS 资源代理入口，但资源拉取不再附带 Cookie 或 Bearer 头。代理仍然执行：

- CMS 源站 URL 校验
- 原始 query 参数透传
- 统一缓存策略和错误映射

这样做的原因：

- 预览 HTML 重写和静态导出已经依赖该代理入口
- 实际资源 URL 可直接访问，不需要额外鉴权头
- 保留代理能避免作者 HTML 和 runtime 直接暴露外部 CMS 源站细节

替代方案：

- 让预览和导出直接使用原始远程资源 URL
  - 未采用，因为会破坏现有统一代理链路并增加 HTML 重写分支

## Risks / Trade-offs

- [共享类型删减会波及多个 consumer] → 同步修改 `@proma/shared`、runtime client、browser dialog、SDK tools 与相关测试，避免留下悬空字段。
- [栏目详情中的描述字段在 slim API 中不稳定] → `CatalogDetail` 保留字段结构，但当上游不提供描述时返回空字符串，不再依赖旧详情接口补齐。
- [token 刷新可能出现并发竞争] → token provider 需要在刷新时串行化请求，避免并发重复登录。
- [`status` 枚举并未完全确认] → 保留 `20 => 启用`、`0 => 禁用` 的已知映射，其余状态统一回退为 `未知`。
- [`loadextend` 在其他 CMS 环境下可能出现差异] → 本次设计不依赖 `loadextend` 追加扩展字段；即使其他环境返回更多字段，也只按基础摘要 contract 消费。

## Migration Plan

1. 更新 CMS 宿主配置读取逻辑，切换到 `baseUrl/siteID/username/password`，并为 `siteID` 提供默认值 `1`。
2. 实现共享 token provider，将 `CmsGateway` 的请求路径与请求头迁移到 slim API 模型。
3. 用 `/api/catalogsTree` 和 `/api/catalogs` 重建栏目树与栏目详情归一化逻辑，移除旧 `/ui/*` 读取路径。
4. 收缩 `PageBuilderCmsContentSummary` 及 runtime ViewModel，移除 `shape`、`assetCounts`、`assetHints` 和旧查询字段。
5. 更新 CMS 浏览弹框、runtime SDK tools、preview browser client、资源代理、static export 与相关测试。
6. 通过既有 `/api/page-builder/cms/*` 路由对外保持宿主接口稳定，并在需要时通过回滚本次变更恢复旧接入实现。

## Open Questions

- 无阻塞性开放问题；未确认的上游栏目状态码将按未知状态处理，后续可在实现中扩充映射。
