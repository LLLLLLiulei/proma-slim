## ADDED Requirements

### Requirement: CMS rendering core 必须保留增强后的栏目和内容 URL ViewModel 字段
系统 SHALL 在 CMS rendering core 中保持归一化 CMS 数据到 ViewModel 的字段语义一致；`cms-catalog` slot item MUST 保留增强后的 `path` 与可选 `logoUrl`，`cms-content` slot item MUST 保留增强后的 `publishUrl` 与可选 `listLogoUrl`，并 SHALL NOT 暴露未声明的上游原始别名作为默认 authoring surface。本 requirement 补充并澄清现有 catalog ViewModel 字段列表必须包含可选 `logoUrl`。

#### Scenario: catalog ViewModel 保留增强后的链接和封面字段
- **WHEN** runtime client 返回的归一化栏目包含 `path` 与 `logoUrl`
- **THEN** `cms-catalog` 暴露给 slot 的 item SHALL 保留这些字段
- **AND** `logoUrl` SHALL 继续作为可选字段暴露
- **AND** 系统 SHALL NOT 额外暴露 `item.link`、`item.url` 或 `item.logoFile` 给默认 slot authoring

#### Scenario: content ViewModel 保留增强后的链接和封面字段
- **WHEN** runtime client 返回的归一化内容包含 `publishUrl` 与 `listLogoUrl`
- **THEN** `cms-content` 暴露给 slot 的 item SHALL 保留这些字段
- **AND** `listLogoUrl` SHALL 继续作为可选字段暴露
- **AND** 系统 SHALL NOT 额外暴露 `item.link`、`item.url` 或 `item.logoFile` 给默认 slot authoring

### Requirement: 浏览器 CMS runtime 必须一致代理栏目和内容封面图 URL
系统 SHALL 让浏览器 CMS runtime 对可选 CMS 封面图 URL 使用宿主管理的 CMS asset proxy；该处理 MUST 同时覆盖内容 `listLogoUrl` 与栏目 `logoUrl`，并 MUST 避免对已经是 proxy URL 的地址重复包装。

#### Scenario: 内容封面图通过 host asset proxy 重写
- **WHEN** 浏览器 runtime client 收到内容列表项并且 `listLogoUrl` 非空
- **THEN** 系统 SHALL 将该 URL 重写为 `/api/page-builder/cms/assets?url=...` 或等价 host proxy URL
- **AND** 若该 URL 已经指向 host proxy，系统 SHALL 保持其不变

#### Scenario: 栏目封面图通过 host asset proxy 重写
- **WHEN** 浏览器 runtime client 收到栏目列表项并且 `logoUrl` 非空
- **THEN** 系统 SHALL 将该 URL 重写为 `/api/page-builder/cms/assets?url=...` 或等价 host proxy URL
- **AND** 系统 SHALL 对嵌套 `children` 中的栏目项应用同样的重写语义
- **AND** 若该 URL 已经指向 host proxy，系统 SHALL 保持其不变
