## ADDED Requirements

### Requirement: compose 资产必须提供可选的内部 Playwright MCP sidecar
系统 SHALL 在 `page-builder` compose 资产中定义一个供 `server` 通过内部网络访问的可选 `playwright` sidecar，用于在 Docker 环境下承载 Playwright MCP HTTP 服务，而不是要求 `server` 在自身容器内本地拉起 Playwright MCP 进程。

#### Scenario: 操作者启用 playwright profile 时启动 sidecar
- **WHEN** 操作者基于仓库提供的 compose 资产并显式启用 `playwright` profile 执行 `docker compose up`
- **THEN** 系统 SHALL 启动名为 `playwright` 的服务作为内部 Playwright MCP 提供方
- **AND** `server` SHALL 能够通过 compose 内部网络访问该服务的 MCP HTTP 端点

#### Scenario: 操作者未启用 playwright profile 时不强制部署 sidecar
- **WHEN** 操作者基于仓库提供的 compose 资产执行 `docker compose up` 且未启用 `playwright` profile
- **THEN** 系统 SHALL 继续允许 `server` 与 `web` 组成基础部署运行
- **AND** 系统 SHALL NOT 要求默认 compose 必须启动 `playwright` 服务

#### Scenario: Playwright sidecar 不作为独立对外入口暴露
- **WHEN** 操作者使用默认 compose 配置部署 page builder
- **THEN** 系统 SHALL NOT 要求用户直接访问 Playwright sidecar 的独立宿主机入口
- **AND** 浏览器侧对外访问入口 SHALL 继续仅为 `web` 服务

#### Scenario: Playwright sidecar 使用 page-builder 专属 Docker 可见命名
- **WHEN** 操作者查看默认 compose 部署资产中的浏览器自动化 sidecar 定义
- **THEN** 系统 SHALL 使用 `playwright` 作为该 sidecar 的服务名称
- **AND** 系统 SHALL NOT 在该 sidecar 的 Docker 可见命名中继续暴露 legacy `proma` 字样

### Requirement: Docker 部署必须声明 Playwright sidecar 与内部预览 origin 的运行时输入
系统 SHALL 为 `server` 提供可外部覆盖的 Docker 运行时输入，用于解析 Playwright sidecar MCP 地址与 page-builder 预览的内部访问 origin，而不是把这些容器网络地址写入工作区持久化配置。

#### Scenario: compose 为 server 声明 Docker 运行时标记
- **WHEN** 操作者查看 compose 资产中的 `server` 环境变量定义
- **THEN** 系统 SHALL 为 `server` 声明一个内部 Docker 运行时标记
- **AND** 该标记 SHALL 让应用层能够区分“Docker 中未部署 sidecar”和“本地非 Docker 运行”

#### Scenario: sidecar 输入默认留空，启用时再配置 Playwright MCP 地址
- **WHEN** 操作者查看 compose 资产与 `.env` 模板中的可配置运行参数
- **THEN** 系统 SHALL 为 `server` 声明 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL` 这一运行时输入
- **AND** 该输入在未启用 sidecar 时 SHALL 默认为空
- **AND** 在启用 sidecar 时 SHALL 可配置为指向 compose 内部 `playwright` 服务的 MCP HTTP 端点

#### Scenario: sidecar 输入默认留空，启用时再配置内部预览 origin
- **WHEN** 操作者查看 compose 资产与 `.env` 模板中的可配置运行参数
- **THEN** 系统 SHALL 为 `server` 声明 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 这一运行时输入
- **AND** 该输入在未启用 sidecar 时 SHALL 默认为空
- **AND** 在启用 sidecar 时 SHALL 可配置为指向 compose 内部用于访问工作区预览路由的 `server` HTTP origin

### Requirement: 启用 sidecar 时必须让 server 与 playwright 共享 page-builder 运行时存储
系统 SHALL 在启用 `playwright` sidecar 的 compose 部署中让 `server` 与 `playwright` 共享同一份 page-builder 运行时存储，以便 sidecar 生成的截图、快照等文件能够被 `server` 与宿主机读取，而不是停留在 sidecar 的独占文件系统中。

#### Scenario: 启用 sidecar 时 compose 为 server 与 playwright 挂载同一份运行时目录
- **WHEN** 操作者查看启用 `playwright` sidecar 的 compose 资产中的 `server` 与 `playwright` 定义
- **THEN** 系统 SHALL 将同一份 page-builder 运行时存储同时挂载到这两个服务
- **AND** 两个服务 SHALL 在各自容器内通过稳定路径访问该共享存储

#### Scenario: Playwright sidecar 产物可被 server 与宿主机读取
- **WHEN** 启用中的 runtime `playwright` 在共享 page-builder 存储中写入截图、快照或其他自动化产物
- **THEN** `server` SHALL 能从其挂载路径读取同一份文件
- **AND** 宿主机 SHALL 能从该默认 bind mount 对应的目录中检查同一份文件
