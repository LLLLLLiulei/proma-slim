## Purpose
定义 page-builder CMS 渲染链路的共享核心包 contract，包括运行时 client、稳定 ViewModel、内置 CMS 组件与共享模板扫描/编译基础设施，供后续 preview、static export 与相关工具链复用。

## Requirements

### Requirement: 系统必须提供共享的 CMS rendering core workspace package
系统 SHALL 提供一个共享 workspace package `packages/page-builder-cms-rendering`，作为 page-builder CMS 渲染链路的统一核心模块，而不是继续让 preview、static export 或工具链直接复制 demo 实现。

#### Scenario: Workspace 可以识别并引用核心包
- **WHEN** 仓库安装并解析 workspace package
- **THEN** 系统 SHALL 识别 `packages/page-builder-cms-rendering` 为可引用的 workspace package
- **AND** 该包 SHALL 暴露统一入口以供运行时、组件、ViewModel 和模板工具被其他模块复用

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
### Requirement: 内置 CMS 组件必须暴露稳定的 ViewModel 与 slot scope 合同
系统 SHALL 使 `cms-catalog` 与 `cms-content` 先将归一化 CMS 数据映射为稳定 ViewModel，再向模板暴露统一的 slot scope 合同 `{ items, loading, error, empty }`。

#### Scenario: `cms-catalog` 暴露递归 catalog ViewModel
- **WHEN** `cms-catalog` 接收到包含嵌套 children 的归一化栏目数据
- **THEN** 系统 SHALL 向 slot `items` 暴露包含 `id`、`name`、`path`、`parentId`、`hasChild`、`total`、`contentType`、`contentTypeName` 与 `children` 的 ViewModel
- **AND** `children` SHALL 保留递归层级结构

#### Scenario: `cms-content` 暴露稳定 content ViewModel
- **WHEN** `cms-content` 接收到归一化内容列表数据
- **THEN** 系统 SHALL 向 slot `items` 暴露包含 `id`、`catalogId`、`title`、`summary`、`publishUrl`、`listLogoUrl` 与 `addedAt` 的 ViewModel

#### Scenario: 组件在 loading、empty、error 状态下暴露统一 slot 合同
- **WHEN** 任一内置 CMS 组件处于加载中、空结果或运行时错误状态
- **THEN** 系统 SHALL 向模板暴露统一的 slot scope 字段 `items`、`loading`、`error` 与 `empty`
- **AND** 系统 SHALL 允许模板基于 `default`、`empty` 与 `error` slots 消费这些状态

#### Scenario: `cms-catalog` 在组件层处理 level、parent-id 与 take 语义
- **WHEN** `cms-catalog` 使用 `level`、`parent-id` 或 `take` props
- **THEN** 系统 SHALL 基于归一化 catalog 结果在组件层完成这些展示语义处理
- **AND** 系统 SHALL NOT 要求底层 runtime contract 必须提供等价的 transport-level 查询参数

### Requirement: 核心包必须提供共享的 CMS island template 扫描与编译基础设施
系统 SHALL 提供共享 template utilities，用于从作者 HTML 中识别 `cms-*` 节点并将其作者模板编译为可复用于 preview 与 export 的 render 表示。

#### Scenario: 扫描工具只识别 CMS 组件节点
- **WHEN** 作者 HTML 同时包含普通 HTML、`cms-catalog` 和 `cms-content`
- **THEN** 系统 SHALL 仅返回 `cms-catalog` 与 `cms-content` 的扫描结果
- **AND** 每个扫描结果 SHALL 至少包含组件名、原始模板源码和归一化 props

#### Scenario: 模板扫描将作者态 site-id 归一化为 siteId
- **WHEN** 作者 HTML 中的 `cms-catalog` 或 `cms-content` 写有 `site-id`
- **THEN** 扫描结果 SHALL 在归一化 props 中返回 `siteId`
- **AND** 后续 manifest、preview 与 SSR SHALL 可直接复用该归一化结果

#### Scenario: 编译工具使用作者模板生成可复用 render 表示
- **WHEN** 某个已扫描的 CMS island 模板被传入编译工具
- **THEN** 系统 SHALL 基于该作者模板生成 render 表示
- **AND** 后续 preview 与 static export SHALL 能复用该编译结果而不需要各自重新定义模板处理逻辑

### Requirement: CMS rendering core 必须基于 canonical contract 暴露统一 authoring 元数据
系统 SHALL 让 `packages/page-builder-cms-rendering` 的扫描、编译、运行时与 validator 基于 canonical CMS authoring contract 工作，而不得继续各自维护分散的 props、字段或禁用结构判断逻辑。

#### Scenario: 扫描与 validator 使用同一份 contract 判断合法 props
- **WHEN** 模板扫描器、props 归一化逻辑和 validator 判断某个 `cms-*` 标签是否使用了受支持 props
- **THEN** 系统 SHALL 基于同一份 canonical contract 做出判断
- **AND** 系统 SHALL NOT 让这些模块各自维护不同的 props 白名单

#### Scenario: 组件字段元数据与 contract 保持一致
- **WHEN** `cms-catalog` 或 `cms-content` 的 ViewModel 字段被暴露给编译器、validator 或其他消费者
- **THEN** 系统 SHALL 使这些字段元数据与 canonical contract 中声明的字段保持一致
- **AND** 系统 SHALL NOT 额外暴露 contract 未声明的字段给默认 authoring 流程消费

### Requirement: 模板编译与 validation 必须拒绝超出 contract 的字段访问和结构
系统 SHALL 在 CMS island 模板编译与 validation 阶段拒绝任何超出 canonical contract 的字段访问、slot 变量或结构；只要作者模板访问了未声明字段、使用了未声明 slot 变量，或出现禁止结构，系统 MUST 将其视为阻断性错误。

#### Scenario: 未声明字段访问被视为阻断性错误
- **WHEN** 某个 `cms-catalog` 或 `cms-content` 的作者模板访问 `item.url`、`item.link` 或其他当前 contract 未声明字段
- **THEN** CMS 模板 validation SHALL 将其视为阻断性错误
- **AND** 系统 SHALL NOT 将该模板编译为可继续使用的 render 表示

#### Scenario: 未声明 slot 变量或禁止结构被视为阻断性错误
- **WHEN** 某个 CMS 作者模板引用了不在统一 slot scope 中的变量，或包含 `<script>`、`<style>`、嵌套 `cms-*`、外层 `template v-slot:*` 包装等禁止结构
- **THEN** CMS 模板 validation SHALL 将其视为阻断性错误
- **AND** 系统 SHALL 不把该模板视为合法的 CMS island 作者模板

### Requirement: CMS validation 必须对常见高风险 Vue 作者态坏模式给出稳定诊断
系统 SHALL 为当前 CMS island 作者模板中的常见高风险 Vue 作者态坏模式提供稳定诊断，以减少“字段名写对了但模板仍不稳”的情况；这些坏模式至少包括 `v-for` 缺少稳定 `:key`，以及对可选 URL/图片字段缺少显式守卫。

#### Scenario: `v-for` 缺少 `:key` 时给出稳定诊断
- **WHEN** 某个 CMS slot 模板包含 `v-for` 循环，但未提供稳定的 `:key`
- **THEN** CMS validation SHALL 产出稳定诊断
- **AND** 该诊断 SHALL 能被正式写入链路、测试或指导材料消费

#### Scenario: 可选 URL 或图片字段缺少守卫时给出稳定诊断
- **WHEN** 某个 CMS slot 模板直接绑定可选 URL 或图片字段，但未用 `v-if`、`v-else-if` 或等价守卫限制渲染
- **THEN** CMS validation SHALL 产出稳定诊断
- **AND** 该诊断 SHALL 反映当前 contract 中对可选字段的语义约束
