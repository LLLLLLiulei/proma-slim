## ADDED Requirements

### Requirement: 离线静态导出必须在资源本地化前完成 CMS islands 静态化
系统 SHALL 在 page-builder 离线静态导出中，先把 staging HTML 中的 CMS islands 固化为静态 HTML，再执行现有 HTML/CSS 资源本地化流程，以确保 SSR 新增的资源引用也能被扫描和改写。

#### Scenario: CMS island SSR 生成的新资源 URL 继续被本地化
- **WHEN** 某个导出页面包含 CMS islands，且这些 islands 的 SSR 结果新增 `img[src]`、`srcset`、`a[href]` 或 inline style `url(...)`
- **THEN** 系统 SHALL 先将这些 CMS island 的 SSR 结果写回 staging HTML
- **AND** 系统 SHALL 再对这些新增资源引用执行离线本地化

#### Scenario: 不含 CMS islands 的页面继续沿用现有资源本地化链路
- **WHEN** 某个导出页面的 staging HTML 不包含 CMS islands
- **THEN** 系统 SHALL 继续执行现有 HTML/CSS 资源本地化流程
- **AND** 系统 SHALL 不因为 CMS rendering 集成而改变普通页面的导出结果

### Requirement: 离线静态导出报告必须暴露 CMS island 渲染失败
系统 SHALL 在离线静态导出因 CMS island 渲染失败而终止时，将该失败写入结构化导出报告与任务状态，而不是只返回泛化的导出失败消息。

#### Scenario: CMS island 查询失败被写入报告和任务状态
- **WHEN** 某个导出任务因 CMS island 查询失败而终止
- **THEN** 系统 SHALL 在导出报告的 `failures` 中记录对应 failure
- **AND** 系统 SHALL 使该任务返回 `failed` 状态与可读失败原因

#### Scenario: CMS island 渲染失败不被降级为普通告警
- **WHEN** 某个导出任务因 CMS island 模板编译或 SSR 失败而终止
- **THEN** 系统 SHALL 在导出报告的 `failures` 中记录该 CMS island failure
- **AND** 系统 SHALL NOT 将该失败静默归类为普通 warning 或 unsupported runtime dependency
