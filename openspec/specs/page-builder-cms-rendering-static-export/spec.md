## Purpose
定义 `page-builder-cms-rendering` 在离线静态导出中的服务端 runtime、任务级缓存复用、CMS islands 预取与 SSR 失败上浮要求，确保 CMS 驱动内容在导出时被稳定固化为静态 HTML。

## Requirements

### Requirement: 静态导出必须为 CMS islands 提供任务级 server runtime 与查询复用
系统 SHALL 在每个 page-builder 离线静态导出任务内为 CMS islands 创建独立的服务端 runtime client，并且只在该任务范围内复用等价 CMS 查询结果，而不是跨导出任务共享进程级缓存或复用浏览器 preview client。

#### Scenario: 同一导出任务中的重复查询复用同一份结果
- **WHEN** 某个离线静态导出任务中的多个 CMS islands 触发等价的 catalog 或 content 查询
- **THEN** 系统 SHALL 在该任务内复用同一份 CMS 查询结果
- **AND** 系统 SHALL 不为这些等价查询重复发起多次上游请求

#### Scenario: 不同导出任务之间不共享 CMS 查询缓存
- **WHEN** 两个不同的离线静态导出任务分别执行相同的 CMS 查询
- **THEN** 系统 SHALL 为每个任务创建独立的服务端 runtime client
- **AND** 系统 SHALL 不复用另一个任务中遗留的缓存结果

### Requirement: 静态导出必须使用共享 CMS island 管线预取并固化顶层 islands
系统 SHALL 在 page-builder 离线静态导出中复用共享的 CMS island 扫描、模板编译和组件 contract，对 staging HTML 中的顶层 `cms-catalog` 与 `cms-content` 先完成预取，再逐 island 执行 SSR，并将结果替换回 staging HTML；当 island 使用 fixed-ids 来源时，导出期预取 MUST 走受控取数路径，而不得通过全量栏目树或整站内容列表退化实现。

#### Scenario: 包含多个顶层 CMS islands 的页面被固化为静态 HTML
- **WHEN** 某个导出页面的 staging HTML 中包含多个顶层 `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 先为这些 islands 完成所需 CMS 数据预取
- **AND** 系统 SHALL 将每个 island 的 SSR 结果写回 staging HTML
- **AND** 系统 SHALL 不在最终 staging HTML 中保留未替换的顶层 `cms-*` 标签

#### Scenario: 预取与 SSR 按每个 island 的显式站点上下文执行
- **WHEN** 某个导出页面中的多个 CMS islands 使用不同的 `site-id`
- **THEN** 系统 SHALL 按每个 island 自身的显式 `site-id` 预取并执行 SSR
- **AND** 当标签缺少 `site-id` 时，系统 SHALL 按 `siteId = 1` 兼容执行
- **AND** 任务级缓存 SHALL 将 `siteId` 纳入等价查询判断

#### Scenario: 服务端 SSR 输出保留原始 CMS 资源 URL
- **WHEN** 某个 `cms-content` island 的 SSR 结果中包含来自 CMS 数据的图片或链接 URL
- **THEN** 系统 SHALL 在 SSR 输出中保留该原始 CMS 资源 URL
- **AND** 系统 SHALL NOT 将其改写为 preview 专用的 `/api/page-builder/cms/assets?...` 代理地址

#### Scenario: fixed-ids 来源通过受控读取预取并保持顺序
- **WHEN** 某个 `cms-catalog` 或 `cms-content` island 使用作者态 `ids` 来源
- **THEN** 系统 SHALL 对固定栏目 `ids` 只预取这些有序 `ids` 对应的栏目
- **AND** 对固定内容 `ids`，系统 SHALL 在作者态 `catalog-id` 对应的单一栏目范围内解析这些内容
- **AND** 系统 SHALL NOT 通过全量栏目树或整站内容列表加载来模拟 fixed-ids 行为
- **AND** 预取结果 SHALL 保持输入顺序并默认丢弃失效项
- **AND** 当所有 id 都失效时，导出期 SSR SHALL 渲染 empty 状态
### Requirement: CMS island 导出失败必须上浮为结构化渲染失败
系统 SHALL 将 CMS island 的预取失败、模板编译失败或 SSR 失败视为导出期结构化失败，并至少记录失败来源组件和归一化 props，而不是静默导出空内容或未替换的占位结果。

#### Scenario: island 预取失败时导出任务失败
- **WHEN** 某个 CMS island 在导出预取阶段无法成功获取其所需 CMS 数据
- **THEN** 系统 SHALL 将该导出任务标记为失败
- **AND** 系统 SHALL 在对应 failure 记录中包含该 island 的组件名和归一化 props

#### Scenario: island SSR 失败时导出任务失败
- **WHEN** 某个 CMS island 在模板编译或服务端渲染阶段发生错误
- **THEN** 系统 SHALL 将该导出任务标记为失败
- **AND** 系统 SHALL 在对应 failure 记录中包含该 island 的组件名和归一化 props
