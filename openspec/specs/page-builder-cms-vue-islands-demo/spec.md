## Purpose
定义一个自包含的 CMS Vue islands demo package，用于独立验证 HTML-first 作者模板在 preview CSR 与 export SSR 静态化链路中的行为。

## Requirements

### Requirement: 系统必须提供一个自包含的 CMS Vue islands demo package
系统 SHALL 在 `packages/` 下提供一个自包含的 demo workspace package，用于独立验证 HTML-first 的 CMS Vue islands preview CSR 与 export SSR 静态化链路，而不要求接入现有生产 `page-builder` 运行时。

#### Scenario: Demo package 可被 workspace 识别并独立运行
- **WHEN** 开发者在仓库根目录安装依赖并执行该 demo package 的脚本
- **THEN** 系统 SHALL 将该 demo package 识别为当前 monorepo workspace 的一个可运行 package
- **AND** 该 package SHALL 不要求先启动 `apps/app` 或 `apps/page-builder` 的生产服务

#### Scenario: Demo package 保持与生产 page-builder 解耦
- **WHEN** 开发者运行 demo package
- **THEN** 系统 SHALL 使用 package 内部的 mock 数据、preview 逻辑和 export 逻辑完成验证
- **AND** 系统 SHALL NOT 依赖真实 `CmsGateway`、preview bridge 或 Builder 页面状态

### Requirement: Demo package 必须支持 HTML-first 的 preview CSR islands 渲染
系统 SHALL 允许开发者使用普通 HTML 页面作为作者模板真相，并在 preview 阶段通过 Vue islands 为其中的 `cms-catalog` 与 `cms-content` 标签注入真实渲染结果。

#### Scenario: Preview 消费普通 HTML 作者页面
- **WHEN** 某个 demo 页面以普通 HTML 文件形式定义，且其中包含 `cms-catalog` 或 `cms-content` 标签
- **THEN** preview 流程 SHALL 将该 HTML 文件作为输入
- **AND** preview 流程 SHALL NOT 要求作者先将页面改写为整页 Vue 应用或 `.vue` 文件

#### Scenario: Preview 逐岛挂载 CMS 组件
- **WHEN** 开发者在浏览器中打开 demo preview 页面
- **THEN** 系统 SHALL 仅对页面中的 `cms-catalog` 与 `cms-content` islands 执行 Vue 挂载
- **AND** 系统 SHALL 让非 CMS 的普通 HTML 区域保持原有文档结构存在

#### Scenario: Preview 通过浏览器端 client 渲染 mock CMS 数据
- **WHEN** preview 中的 CMS island 首次挂载
- **THEN** 系统 SHALL 通过浏览器端运行时 client 获取 mock CMS 数据
- **AND** 系统 SHALL 使用组件 slot 模板在浏览器中渲染对应结果

### Requirement: Demo package 必须支持从同一作者模板导出 SSR 静态 HTML
系统 SHALL 使用与 preview 相同的作者模板来源执行服务端 SSR，并生成无需浏览器端 Vue runtime 或 CMS 请求即可显示内容的静态 HTML 产物。

#### Scenario: Export 从同一份作者模板执行逐岛 SSR
- **WHEN** 开发者对某个 demo HTML 页面执行 export 命令
- **THEN** 系统 SHALL 读取与 preview 相同的作者模板文件
- **AND** 系统 SHALL 对其中的 `cms-catalog` 与 `cms-content` islands 逐个执行 SSR 渲染并替换回 HTML 文档

#### Scenario: Export 产物不依赖 Vue runtime 或浏览器端 CMS 请求
- **WHEN** export 命令完成并写出静态 HTML 文件
- **THEN** 该 HTML 产物 SHALL 在不加载 Vue runtime 的情况下直接显示 CMS 内容
- **AND** 该 HTML 产物 SHALL NOT 依赖浏览器运行时再次请求 mock CMS 数据才可见内容

### Requirement: Demo package 必须提供可稳定复现的 mock 数据与示例页面
系统 SHALL 为 demo package 提供稳定的 mock CMS 数据和示例页面，使开发者可以重复观察作者源码、preview 结果和 export 产物之间的关系。

#### Scenario: Demo 提供导航与内容列表示例页面
- **WHEN** 开发者查看 demo package 自带的示例页面
- **THEN** 系统 SHALL 至少提供一个验证 `cms-catalog` 的示例页面
- **AND** 系统 SHALL 至少提供一个验证 `cms-content` 的示例页面
- **AND** 系统 SHALL 至少提供一个普通 HTML 与 CMS islands 混排的示例页面

#### Scenario: Mock 数据覆盖基础渲染分支
- **WHEN** 开发者运行 demo preview 或 export
- **THEN** 系统 SHALL 提供足以覆盖基础导航和内容列表渲染的 mock CMS 数据
- **AND** 系统 SHALL 允许通过示例或数据集观察至少一种非完整内容形态，例如空结果、无图条目或基础字段差异

### Requirement: Demo package 必须同时提供浏览器预览和命令行导出入口
系统 SHALL 为 demo package 提供明确的命令入口，使开发者既可以在浏览器中查看 preview CSR islands 效果，也可以在命令行中生成 export SSR 静态产物。

#### Scenario: 开发者可启动本地 preview 入口
- **WHEN** 开发者执行 demo package 的 preview 启动命令
- **THEN** 系统 SHALL 启动一个本地可访问的 preview 入口
- **AND** 该入口 SHALL 允许在浏览器中查看示例页面的 islands 渲染效果

#### Scenario: 开发者可生成静态 export 产物
- **WHEN** 开发者执行 demo package 的 export 命令
- **THEN** 系统 SHALL 生成可检查的静态 HTML 输出目录
- **AND** 该输出 SHALL 允许开发者将 export 结果与作者源码或 preview 结果进行对比
