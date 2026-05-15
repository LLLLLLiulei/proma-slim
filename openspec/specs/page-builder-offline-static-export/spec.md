## Purpose
定义 `page-builder` 离线静态导出任务的创建、状态、资源本地化、导出报告与安全限制要求，确保 Builder 可生成可离线打开的完整静态包。

## Requirements

### Requirement: Page-builder 必须支持创建离线静态导出任务
系统 SHALL 允许用户针对当前 `page-builder` 工作区创建一个离线静态导出任务，以当前工作区的 `workspace-files/` 为导出源生成可离线打开的静态包，而不是直接依赖预览响应或用户手动收集文件。

#### Scenario: 当前工作区存在页面产物时创建导出任务
- **WHEN** 用户在 `page-builder` Builder 中为一个存在 `workspace-files/index.html` 的工作区触发 `导出静态包`
- **THEN** 系统 SHALL 为该工作区创建一个新的离线静态导出任务
- **AND** 该任务 SHALL 以当前工作区 `workspace-files/` 的内容作为导出输入

#### Scenario: 预览入口缺失时拒绝创建导出任务
- **WHEN** 用户为一个不存在 `workspace-files/index.html` 的 `page-builder` 工作区触发 `导出静态包`
- **THEN** 系统 SHALL 拒绝创建离线静态导出任务
- **AND** 系统 SHALL 返回“当前项目没有可导出的页面产物”之类的明确错误

#### Scenario: 同一工作区存在活动导出任务时不重复创建
- **WHEN** 用户为某个 `page-builder` 工作区触发 `导出静态包`，且该工作区已经存在一个状态为进行中的离线静态导出任务
- **THEN** 系统 SHALL 不为该工作区再次创建第二个并发导出任务
- **AND** 系统 SHALL 返回当前活动任务的状态信息或等价提示

### Requirement: 离线静态导出任务必须暴露状态与可下载结果
系统 SHALL 为离线静态导出任务提供可轮询的状态信息，并在导出成功后暴露一个可下载的静态包结果。

#### Scenario: 运行中的导出任务返回阶段化状态
- **WHEN** 前端查询一个状态为进行中的离线静态导出任务
- **THEN** 系统 SHALL 返回该任务当前状态
- **AND** 系统 SHALL 返回该任务所处阶段，例如复制输入、扫描资源、下载资源或打包输出

#### Scenario: 导出成功后暴露静态包下载结果
- **WHEN** 某个离线静态导出任务完成且没有阻断导出的关键错误
- **THEN** 系统 SHALL 为该任务提供一个可下载的静态包结果
- **AND** 下载结果 SHALL 是一个包含 `index.html` 的压缩包

#### Scenario: 导出失败时返回失败阶段与原因
- **WHEN** 某个离线静态导出任务因关键错误而失败
- **THEN** 系统 SHALL 返回该任务失败状态
- **AND** 系统 SHALL 返回失败所处阶段与可读错误原因

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

### Requirement: 离线静态导出包必须附带结构化导出报告
系统 SHALL 为每个离线静态导出结果生成一个结构化 report，用于说明该导出包的离线完整性情况。

#### Scenario: 导出成功的压缩包包含结构化报告
- **WHEN** 用户下载某个成功完成的离线静态导出结果
- **THEN** 系统 SHALL 在该压缩包中包含一个结构化导出报告文件
- **AND** 该报告 SHALL 记录入口文件、已本地化资源、保留外链、告警与失败信息摘要

#### Scenario: 未支持的运行时依赖被记录到报告中
- **WHEN** 当前页面仍包含未被第一版离线导出支持的运行时依赖，例如远程脚本、远程 iframe 或 JS 运行时请求风险
- **THEN** 系统 SHALL 在导出报告中将这些依赖记录为离线完整性风险
- **AND** 系统 SHALL 不将这些依赖静默忽略为“完全成功”

### Requirement: 离线静态导出必须区分关键资源失败与附件告警
系统 SHALL 将影响页面渲染完整性的资源失败视为阻断错误，并将附件类下载失败视为允许继续导出的告警。

#### Scenario: 关键渲染资源下载失败时导出任务失败
- **WHEN** 导出过程中某个样式表、字体、页面图片、海报图或页面内直接使用的音视频资源无法成功本地化
- **THEN** 系统 SHALL 将该导出任务标记为失败
- **AND** 系统 SHALL 不把该结果当作可离线打开的完整静态包继续交付

#### Scenario: 附件类链接下载失败时允许继续导出
- **WHEN** 导出过程中某个附件类下载链接资源无法成功本地化
- **THEN** 系统 SHALL 允许导出任务继续完成
- **AND** 系统 SHALL 在报告中将该失败记录为 warning

#### Scenario: 附件下载失败时保留原始链接
- **WHEN** 某个附件类下载链接资源本地化失败，但导出任务仍被允许完成
- **THEN** 系统 SHALL 保留该链接的原始 `href`
- **AND** 系统 SHALL 不把该链接静默改写为空链接或失效占位

### Requirement: 离线静态导出远程抓取必须受安全与预算限制
系统 SHALL 对离线静态导出中的通用远程资源抓取施加协议、目标地址、数量、体积和时长限制，以避免导出能力滥用宿主网络环境。

#### Scenario: 非法协议或高风险目标地址被拒绝
- **WHEN** 导出过程中发现某个远程资源引用使用了不受支持的协议，或目标地址属于 `localhost`、内网 IP 或其他高风险内部地址
- **THEN** 系统 SHALL 拒绝抓取该资源
- **AND** 系统 SHALL 将其作为导出错误或离线完整性风险处理

#### Scenario: 超出抓取预算时终止导出
- **WHEN** 导出过程中远程资源抓取超出了系统配置的数量、体积、重定向次数或超时预算
- **THEN** 系统 SHALL 终止当前导出任务
- **AND** 系统 SHALL 返回与预算超限相对应的明确失败原因

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

### Requirement: 离线静态导出下载 URL 必须支持 public base path
系统 SHALL 在离线静态导出任务完成后返回浏览器可直接访问的下载 URL，并在 PageBuilder public base path runtime 下包含当前 public base path。

#### Scenario: base path 下导出任务返回带前缀下载地址
- **WHEN** 某个离线静态导出任务完成，且 public base path 为 `/pagebuilder`
- **THEN** 任务状态中的 `downloadUrl` SHALL 位于 `/pagebuilder/api/workspaces/<workspaceId>/page-builder/export-static-jobs/<jobId>/download`
- **AND** 浏览器 SHALL NOT 请求 CMS 根路径 `/api/workspaces/<workspaceId>/page-builder/export-static-jobs/<jobId>/download`

#### Scenario: 无 base path 时导出下载地址保持兼容
- **WHEN** 某个离线静态导出任务完成，且未配置 public base path
- **THEN** 任务状态中的 `downloadUrl` SHALL 继续位于 `/api/workspaces/<workspaceId>/page-builder/export-static-jobs/<jobId>/download`

### Requirement: CMS 集成模式浏览器侧离线静态导出 API 必须受 Builder Access Session 保护
系统 SHALL 在 CMS 集成模式下保护浏览器侧离线静态导出任务 API，确保当前浏览器只能为 Builder Access Session 绑定的 workspace 创建、查询和下载导出任务。

#### Scenario: CMS 模式创建离线导出任务必须匹配 workspace 并校验来源
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/workspaces/:workspaceId/page-builder/export-static-jobs`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **AND** 校验失败时 SHALL NOT 创建离线静态导出任务

#### Scenario: CMS 模式查询离线导出任务必须匹配 workspace
- **WHEN** CMS 模式下浏览器请求 `GET /api/workspaces/:workspaceId/page-builder/export-static-jobs/:jobId`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL NOT 因普通 `GET` 请求缺少 `Origin` header 而拒绝

#### Scenario: CMS 模式下载离线导出结果必须匹配 workspace
- **WHEN** CMS 模式下浏览器请求 `GET /api/workspaces/:workspaceId/page-builder/export-static-jobs/:jobId/download`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 校验失败时 SHALL NOT 返回导出 ZIP 文件

### Requirement: 静态导出核心必须支持浏览器异步 job 与 CMS 同步导出复用
系统 SHALL 将 page-builder 静态导出的复制、扫描、CMS islands 静态化、远程资源处理、报告生成和 ZIP 打包逻辑收口为可复用核心，使浏览器异步 job 与 CMS 同步导出使用同一导出行为。

#### Scenario: 浏览器异步导出继续使用共享核心
- **WHEN** 用户在 Builder 中创建离线静态导出任务
- **THEN** 系统 SHALL 通过共享静态导出核心生成 ZIP 和导出报告
- **AND** 系统 SHALL 继续返回可轮询的 job 状态、阶段、报告摘要和下载 URL
- **AND** 现有浏览器异步导出 API 契约 SHALL 保持兼容

#### Scenario: CMS 同步导出使用同一共享核心
- **WHEN** CMS 同步导出接口执行静态导出
- **THEN** 系统 SHALL 使用与浏览器异步导出相同的 workspace-files 输入、CMS islands 静态化、远程资源处理、报告生成和 ZIP 打包逻辑
- **AND** 系统 SHALL NOT 维护第二套独立导出实现

#### Scenario: 导出阶段更新只影响当前导出运行
- **WHEN** 多个不同 workspace 的浏览器异步导出或同步导出并行运行
- **THEN** 系统 SHALL 只更新当前导出运行对应的 job phase 或内部状态
- **AND** 系统 SHALL NOT 因一个 workspace 的下载或打包阶段错误修改另一个 workspace 的导出状态

### Requirement: 同 workspace 静态导出活动必须互斥
系统 SHALL 对同一个 page-builder workspace 的浏览器异步导出和 CMS 同步导出建立统一活动边界，避免同一 workspace 同时执行多个静态导出流程。

#### Scenario: 浏览器重复创建异步导出保持现有兼容行为
- **WHEN** 某个 workspace 已存在运行中的浏览器异步导出 job，且浏览器再次请求创建异步导出 job
- **THEN** 系统 SHALL 继续返回当前活动 job 的状态信息或等价提示
- **AND** 系统 SHALL NOT 为该 workspace 创建第二个并发异步 job

#### Scenario: CMS 同步导出遇到活动导出时失败
- **WHEN** 某个 workspace 已存在运行中的浏览器异步导出或 CMS 同步导出，且 CMS 请求同步导出该 workspace 绑定的项目
- **THEN** 系统 SHALL 拒绝该同步导出
- **AND** 系统 SHALL 返回 `project_busy`
- **AND** 系统 SHALL NOT 复用另一个导出活动的 ZIP 作为本次 CMS 发布结果

#### Scenario: CMS 同步导出活动阻止浏览器创建并发导出
- **WHEN** 某个 workspace 正在执行 CMS 同步导出，且浏览器请求创建离线静态导出 job
- **THEN** 系统 SHALL 拒绝创建新的并发导出任务或返回项目 busy 的等价错误
- **AND** 系统 SHALL NOT 同时执行第二个导出流程

#### Scenario: 导出失败后释放活动边界
- **WHEN** 某个 workspace 的同步导出或异步导出失败并完成清理
- **THEN** 系统 SHALL 释放该 workspace 的导出活动状态
- **AND** 后续导出请求 SHALL 能重新按正常前置条件执行

### Requirement: CMS 同步导出产物必须包含导出报告但不暴露浏览器 job 契约
系统 SHALL 让 CMS 同步导出的 ZIP 产物包含与浏览器异步导出一致的结构化导出报告，但 CMS 同步 API SHALL 不暴露浏览器 jobId、轮询 URL 或下载 URL 作为成功契约。

#### Scenario: CMS 同步导出 ZIP 包含 export-report.json
- **WHEN** CMS 同步导出成功返回 ZIP
- **THEN** ZIP 包 SHALL 包含 `export-report.json`
- **AND** 该报告 SHALL 记录入口文件、已本地化资源、保留外链、告警、失败摘要和 CMS 远程资源选项语义

#### Scenario: CMS 同步导出成功响应不返回 job 状态对象
- **WHEN** CMS 同步导出成功
- **THEN** 系统 SHALL 直接返回 ZIP body
- **AND** 系统 SHALL NOT 把浏览器异步 job snapshot、jobId、轮询 URL 或下载 URL 作为成功响应 JSON 返回
