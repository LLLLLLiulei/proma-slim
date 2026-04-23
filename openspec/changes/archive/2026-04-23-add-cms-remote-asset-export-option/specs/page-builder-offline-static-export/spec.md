## MODIFIED Requirements

### Requirement: 离线静态导出必须本地化 HTML/CSS 中静态可分析的远程资源
系统 SHALL 在离线静态导出过程中扫描 HTML 和 CSS 中静态可分析的资源引用，并将可支持的远程资源下载到导出包内，再把页面引用改写为包内相对路径；当导出任务显式选择不导出 CMS 远程资源时，系统 SHALL 仅跳过 CMS 远程资源下载，并将这些引用保留或恢复为 CMS 源站可访问 URL。

#### Scenario: HTML 中的远程图片与媒体资源被本地化
- **WHEN** 当前页面 HTML 中存在远程 `img[src]`、`audio[src]`、`video[src]`、`source[src]`、`poster` 或 `srcset` 资源，且这些资源不是被用户选择跳过的 CMS 远程资源
- **THEN** 系统 SHALL 将这些受支持的远程资源下载到导出包内
- **AND** 系统 SHALL 将对应 HTML 引用改写为导出包内的相对路径

#### Scenario: 远程样式表及其嵌套资源被本地化
- **WHEN** 当前页面 HTML 中引用了远程样式表，且该样式表内部还引用字体、背景图或其他 CSS `url(...)` 资源，且这些资源不是被用户选择跳过的 CMS 远程资源
- **THEN** 系统 SHALL 将该远程样式表下载到导出包内
- **AND** 系统 SHALL 继续解析并本地化该样式表内部受支持的嵌套资源

#### Scenario: CMS 资源通过受控 CMS 通路被本地化
- **WHEN** 当前页面引用了属于已配置 CMS 基址的远程资源，且导出任务选择导出 CMS 远程资源
- **THEN** 系统 SHALL 通过受控 CMS 资源获取通路下载该资源
- **AND** 系统 SHALL 不要求离线导出直接暴露 CMS 登录态或绕过既有 CMS 源站校验

#### Scenario: 未选择导出 CMS 远程资源时保留 CMS 源站 URL
- **WHEN** 当前页面引用了属于已配置 CMS 基址的远程资源，且导出任务选择不导出 CMS 远程资源
- **THEN** 系统 SHALL 不下载该 CMS 远程资源到导出包内
- **AND** 系统 SHALL 将页面中的该资源引用保留或改写为 CMS 源站可访问 URL
- **AND** 系统 SHALL NOT 在静态导出产物中保留 `/api/page-builder/cms/assets?url=...` 形式的 preview 代理 URL

#### Scenario: CMS 远程样式表被跳过时不解析其嵌套资源
- **WHEN** 当前页面引用了属于已配置 CMS 基址的远程 stylesheet，且导出任务选择不导出 CMS 远程资源
- **THEN** 系统 SHALL 不下载该 CMS 远程 stylesheet 到导出包内
- **AND** 系统 SHALL 不解析该 CMS 远程 stylesheet 内部的嵌套资源
- **AND** 系统 SHALL 在导出产物中保留或改写为 CMS 源站 stylesheet URL，使浏览器运行时直接从 CMS 源站加载该 stylesheet 及其依赖

#### Scenario: CMS 根相对资源在跳过下载时解析为源站绝对 URL
- **WHEN** 当前页面引用 `/preview/...`、`/upload/...`、`/upload/resources/...` 或 `/assets/...` 等 CMS 根相对资源，且导出任务选择不导出 CMS 远程资源
- **THEN** 系统 SHALL 使用已配置 CMS 基址将该资源解析为 CMS 源站绝对 URL
- **AND** 系统 SHALL 在导出产物中使用解析后的 CMS 源站绝对 URL

#### Scenario: CMS 内容导航链接不受 CMS 资源下载选项影响
- **WHEN** 当前页面包含 CMS 内容导航链接，例如 `publishUrl` 生成的文章详情页链接，且导出任务选择不导出 CMS 远程资源
- **THEN** 系统 SHALL 不将该内容导航链接当作需要跳过下载的 CMS 远程资源
- **AND** 系统 SHALL 不因为该选项而改写、下载或记录该内容导航链接为跳过资源

#### Scenario: 工作区本地相对资源保持在导出包内可访问
- **WHEN** 当前页面已经通过相对路径引用 `workspace-files/` 下的本地资源
- **THEN** 系统 SHALL 将这些本地资源保留在导出包中
- **AND** 系统 SHALL 不因为远程资源本地化或 CMS 远程资源跳过下载而破坏这些本地相对引用

### Requirement: 离线静态导出必须在资源本地化前完成 CMS islands 静态化
系统 SHALL 在 page-builder 离线静态导出中，先把 staging HTML 中的 CMS islands 固化为静态 HTML，再执行现有 HTML/CSS 资源处理流程，以确保 SSR 新增的资源引用也能按导出任务选项被扫描、本地化或保留为 CMS 源站 URL。

#### Scenario: CMS island SSR 生成的新资源 URL 继续按任务选项处理
- **WHEN** 某个导出页面包含 CMS islands，且这些 islands 的 SSR 结果新增 `img[src]`、`srcset`、`a[href]` 或 inline style `url(...)`
- **THEN** 系统 SHALL 先将这些 CMS island 的 SSR 结果写回 staging HTML
- **AND** 系统 SHALL 再对这些新增资源引用执行离线资源处理
- **AND** 当导出任务选择不导出 CMS 远程资源时，系统 SHALL 对新增的 CMS 远程资源引用保留或改写为 CMS 源站可访问 URL

#### Scenario: 不含 CMS islands 的页面继续沿用现有资源本地化链路
- **WHEN** 某个导出页面的 staging HTML 不包含 CMS islands
- **THEN** 系统 SHALL 继续执行现有 HTML/CSS 资源本地化流程
- **AND** 系统 SHALL 不因为 CMS rendering 集成或 CMS 远程资源导出选项而改变普通非 CMS 资源的导出结果

## ADDED Requirements

### Requirement: 离线静态导出任务必须支持按任务选择是否下载 CMS 远程资源
系统 SHALL 在创建 page-builder 离线静态导出任务时接受一个任务级选项，用于控制是否下载 CMS 远程资源；未提供该选项时 SHALL 使用下载 CMS 远程资源的默认行为。

#### Scenario: 默认创建导出任务时继续下载 CMS 远程资源
- **WHEN** 调用方创建离线静态导出任务且未显式传入 CMS 远程资源下载选项
- **THEN** 系统 SHALL 按下载 CMS 远程资源处理
- **AND** 系统 SHALL 保持与既有静态导出行为兼容

#### Scenario: 创建任务时显式关闭 CMS 远程资源下载
- **WHEN** 调用方创建离线静态导出任务并传入“不下载 CMS 远程资源”选项
- **THEN** 系统 SHALL 在该任务的整个 HTML/CSS 资源处理过程中跳过 CMS 远程资源下载
- **AND** 系统 SHALL 继续下载和本地化非 CMS 远程资源

#### Scenario: 活动导出任务存在时不因选项不同创建并发任务
- **WHEN** 某个工作区已经存在状态为进行中的离线静态导出任务
- **AND** 用户再次以不同 CMS 远程资源下载选项触发导出
- **THEN** 系统 SHALL 不为该工作区创建第二个并发导出任务
- **AND** 系统 SHALL 返回当前活动任务的状态信息或等价提示

### Requirement: 离线静态导出报告必须记录被跳过的 CMS 远程资源
系统 SHALL 在导出任务选择不下载 CMS 远程资源且实际遇到 CMS 远程资源时，将这些资源记录为离线完整性告警，而不是记录为关键下载失败。

#### Scenario: 跳过 CMS 远程资源时报告 warning
- **WHEN** 导出任务选择不下载 CMS 远程资源，且页面中存在一个被跳过下载的 CMS 远程资源
- **THEN** 系统 SHALL 在结构化导出报告中记录该资源 URL
- **AND** 系统 SHALL 将该资源记录为 warning
- **AND** 系统 SHALL 使报告摘要的 `hasWarnings` 为 true

#### Scenario: 跳过 CMS 远程资源不导致导出失败
- **WHEN** 导出任务选择不下载 CMS 远程资源，且所有其他关键资源均处理成功
- **THEN** 系统 SHALL 允许导出任务完成
- **AND** 系统 SHALL 提供可下载静态包
- **AND** 系统 SHALL 不把被跳过的 CMS 远程资源记录为 failure

#### Scenario: 未遇到 CMS 远程资源时不产生跳过告警
- **WHEN** 导出任务选择不下载 CMS 远程资源，但页面中不存在 CMS 远程资源
- **THEN** 系统 SHALL 正常完成导出
- **AND** 系统 SHALL NOT 仅因为该选项被关闭而生成离线完整性 warning
