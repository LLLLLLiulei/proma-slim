## ADDED Requirements

### Requirement: CMS 同步导出必须沿用 CMS islands 静态化语义
系统 SHALL 在 CMS 同步静态导出中复用现有离线静态导出的 CMS islands 服务端渲染、任务级查询缓存、固定 ids 读取和结构化失败上浮语义。

#### Scenario: CMS 同步导出固化顶层 CMS islands
- **WHEN** CMS 同步导出的 staging HTML 中包含顶层 `cms-catalog` 或 `cms-content` islands
- **THEN** 系统 SHALL 在资源本地化前完成这些 islands 的预取和服务端渲染
- **AND** 系统 SHALL 将每个 island 的 SSR 结果写回 staging HTML
- **AND** 最终 ZIP 中的 HTML SHALL NOT 保留未替换的顶层 `cms-*` 标签

#### Scenario: CMS 同步导出使用任务级查询缓存
- **WHEN** CMS 同步导出中多个 CMS islands 触发等价 CMS 查询
- **THEN** 系统 SHALL 在本次同步导出范围内复用同一份查询结果
- **AND** 系统 SHALL NOT 跨另一次同步导出或浏览器异步导出复用进程级 CMS 查询缓存

#### Scenario: CMS 同步导出中的 fixed-ids 来源走受控读取路径
- **WHEN** CMS 同步导出的 CMS island 使用 fixed-ids 来源
- **THEN** 系统 SHALL 按现有静态导出 fixed-ids 规则读取指定栏目或内容
- **AND** 系统 SHALL NOT 通过全量栏目树或整站内容列表退化模拟 fixed-ids 行为

#### Scenario: CMS island 失败导致同步导出失败
- **WHEN** CMS 同步导出中的 CMS island 预取、模板编译或服务端渲染失败
- **THEN** 系统 SHALL 将该失败作为结构化导出 failure 记录到导出报告
- **AND** CMS 同步导出接口 SHALL 返回 `export_upstream_failed`
- **AND** 系统 SHALL NOT 返回半成品 ZIP
