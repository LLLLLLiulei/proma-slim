## ADDED Requirements

### Requirement: 系统必须提供共享的 CMS rendering core workspace package
系统 SHALL 提供一个共享 workspace package `packages/page-builder-cms-rendering`，作为 page-builder CMS 渲染链路的统一核心模块，而不是继续让 preview、static export 或工具链直接复制 demo 实现。

#### Scenario: Workspace 可以识别并引用核心包
- **WHEN** 仓库安装并解析 workspace package
- **THEN** 系统 SHALL 识别 `packages/page-builder-cms-rendering` 为可引用的 workspace package
- **AND** 该包 SHALL 暴露统一入口以供运行时、组件、ViewModel 和模板工具被其他模块复用

### Requirement: 核心运行时契约必须对齐 page-builder 归一化 CMS 类型
系统 SHALL 将 `CmsRuntimeClient` 定义为基于 `@proma/shared` 的归一化 CMS query/result 类型，而不是直接暴露 demo 专用 ViewModel 返回结构。

#### Scenario: Catalog 与 content 方法使用归一化 query/result 契约
- **WHEN** 任意 consumer 调用 `CmsRuntimeClient` 的 catalog 或 content 查询方法
- **THEN** 系统 SHALL 使这些方法接受 `PageBuilderCmsCatalogQuery` 与 `PageBuilderCmsContentQuery`
- **AND** 系统 SHALL 使这些方法返回 `PageBuilderCmsCatalogList` 与 `PageBuilderCmsContentList`

#### Scenario: Content 查询保留 0-based pageIndex 语义
- **WHEN** `cms-content` 相关查询传入 `pageIndex` 为 `0`
- **THEN** 系统 SHALL 在归一化后的 runtime query 中保留该值
- **AND** 系统 SHALL NOT 将其改写为 `undefined`、`1` 或其他仅支持正整数的语义

### Requirement: 内置 CMS 组件必须通过注入的 runtime client 取数
系统 SHALL 提供内置 `cms-catalog` 与 `cms-content` 组件，并使它们通过注入的 `CmsRuntimeClient` 获取数据，而不是写死浏览器端 URL、`CmsGateway` 实例或其他环境专属取数方式。

#### Scenario: 同一组件可复用于不同运行时 client
- **WHEN** preview 与 static export 为同一内置 CMS 组件分别注入不同的 `CmsRuntimeClient` 实现
- **THEN** 该组件 SHALL 通过注入 client 完成取数
- **AND** 组件本身 SHALL 不要求感知当前运行在浏览器 preview 还是服务端 export 环境

### Requirement: 内置 CMS 组件必须暴露稳定的 ViewModel 与 slot scope 合同
系统 SHALL 使 `cms-catalog` 与 `cms-content` 先将归一化 CMS 数据映射为稳定 ViewModel，再向模板暴露统一的 slot scope 合同 `{ items, loading, error, empty }`。

#### Scenario: `cms-catalog` 暴露递归 catalog ViewModel
- **WHEN** `cms-catalog` 接收到包含嵌套 children 的归一化栏目数据
- **THEN** 系统 SHALL 向 slot `items` 暴露包含 `id`、`name`、`path`、`parentId`、`hasChild`、`total`、`contentType`、`contentTypeName` 与 `children` 的 ViewModel
- **AND** `children` SHALL 保留递归层级结构

#### Scenario: `cms-content` 暴露稳定 content ViewModel
- **WHEN** `cms-content` 接收到归一化内容列表数据
- **THEN** 系统 SHALL 向 slot `items` 暴露包含 `id`、`catalogId`、`title`、`summary`、`publishUrl`、`listLogoUrl`、`addedAt`、`shape` 与 `assetCounts` 的 ViewModel

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

#### Scenario: 编译工具使用作者模板生成可复用 render 表示
- **WHEN** 某个已扫描的 CMS island 模板被传入编译工具
- **THEN** 系统 SHALL 基于该作者模板生成 render 表示
- **AND** 后续 preview 与 static export SHALL 能复用该编译结果而不需要各自重新定义模板处理逻辑
