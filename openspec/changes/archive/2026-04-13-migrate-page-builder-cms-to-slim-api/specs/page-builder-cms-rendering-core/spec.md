## MODIFIED Requirements

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
