## ADDED Requirements

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
