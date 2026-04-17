## MODIFIED Requirements

### Requirement: 核心运行时契约必须对齐 page-builder 归一化 CMS 类型
系统 SHALL 将 `CmsRuntimeClient` 定义为基于 `@proma/shared` 的归一化 CMS query/result 类型，而不是直接暴露 demo 专用 ViewModel 返回结构；该运行时契约 MUST 同时支持查询式来源和 fixed-ids 精确来源，并 SHALL 在 exact-ids 模式下保持输入顺序与稳定降级行为。

#### Scenario: Catalog 与 content 方法使用归一化 query/result 契约
- **WHEN** 任意 consumer 调用 `CmsRuntimeClient` 的 catalog 或 content 查询方法
- **THEN** 系统 SHALL 使这些方法接受 `PageBuilderCmsCatalogQuery` 与 `PageBuilderCmsContentQuery`
- **AND** 系统 SHALL 使这些方法返回 `PageBuilderCmsCatalogList` 与 `PageBuilderCmsContentList`

#### Scenario: 归一化 query 契约显式包含 siteId 维度
- **WHEN** 任意 consumer 为 `cms-catalog` 或 `cms-content` 发起 CMS 查询
- **THEN** 系统 SHALL 允许在 `PageBuilderCmsCatalogQuery` 与 `PageBuilderCmsContentQuery` 中显式传入 `siteId`
- **AND** 当作者态标签缺少显式站点时，运行时 SHALL 按 `siteId = 1` 兼容执行

#### Scenario: 归一化 query 契约支持 exact-ids 来源
- **WHEN** 任意 consumer 为 `cms-catalog` 或 `cms-content` 发起 fixed-ids 查询
- **THEN** 系统 SHALL 允许在归一化 query 契约中显式传入按顺序排列的 `ids`
- **AND** 当查询对象为 `cms-content` fixed-ids 来源时，系统 SHALL 同时要求显式传入单一 `catalogId`
- **AND** 系统 SHALL 不要求调用方先查询整棵栏目树或整站内容后再本地过滤

#### Scenario: Content 查询保留 0-based pageIndex 语义
- **WHEN** `cms-content` 相关查询传入 `pageIndex` 为 `0`
- **THEN** 系统 SHALL 在归一化后的 runtime query 中保留该值
- **AND** 系统 SHALL NOT 将其改写为 `undefined`、`1` 或其他仅支持正整数的语义

### Requirement: 内置 CMS 组件必须通过注入的 runtime client 取数
系统 SHALL 提供内置 `cms-catalog` 与 `cms-content` 组件，并使它们通过注入的 `CmsRuntimeClient` 获取数据，而不是写死浏览器端 URL、`CmsGateway` 实例或其他环境专属取数方式；内置组件 MUST 同时支持查询式来源与 fixed-ids 来源，并 MUST 阻止相互冲突的来源 props 组合。

#### Scenario: 同一组件可复用于不同运行时 client
- **WHEN** preview 与 static export 为同一内置 CMS 组件分别注入不同的 `CmsRuntimeClient` 实现
- **THEN** 该组件 SHALL 通过注入 client 完成取数
- **AND** 组件本身 SHALL 不要求感知当前运行在浏览器 preview 还是服务端 export 环境

#### Scenario: 内置 CMS 组件接受作者态 site-id 与 ids 并传入 runtime query
- **WHEN** 作者 HTML 中的 `cms-catalog` 或 `cms-content` 显式写出 `site-id` 或 `ids`
- **THEN** 系统 SHALL 让组件 props 接受这些来源属性
- **AND** 组件 SHALL 将其归一化为 runtime query 中的 `siteId` 与有序 `ids`

#### Scenario: `cms-catalog` 的 fixed-ids 来源不与父栏目查询来源混用
- **WHEN** 作者 HTML 中的某个 `cms-catalog` 同时写出 `ids` 与 `level`、`parent-id`、`content-type`、`search-keyword` 或 `take`
- **THEN** 系统 SHALL 将其视为冲突来源配置
- **AND** 运行时 SHALL NOT 将其当作合法来源继续执行

#### Scenario: `cms-content` 必须始终携带 `catalog-id`，fixed-ids 模式额外携带 `ids`
- **WHEN** 作者 HTML 中的某个 `cms-content` 缺少 `catalog-id`
- **THEN** 系统 SHALL 将其视为非法来源配置
- **AND** 运行时 SHALL NOT 将其当作合法来源继续执行

#### Scenario: `cms-content` fixed-ids 模式不得混用分页查询字段
- **WHEN** 作者 HTML 中的某个 `cms-content` 同时写出 `ids` 与 `keyword`、`page-index` 或 `page-size`
- **THEN** 系统 SHALL 将其视为非法来源配置
- **AND** 运行时 SHALL NOT 将其当作合法来源继续执行

#### Scenario: fixed-ids 来源默认丢弃失效项并保留顺序
- **WHEN** 某个 `cms-catalog` 或 `cms-content` 使用 fixed-ids 来源，且其中部分 id 已失效、无权限或无法解析
- **THEN** 系统 SHALL 保留其余有效项
- **AND** 系统 SHALL 保持这些有效项与输入 `ids` 一致的顺序
- **AND** 系统 SHALL 默认丢弃失效项，而不是让整块进入 error
- **AND** 当所有 id 都失效时，组件 SHALL 进入 empty 状态
