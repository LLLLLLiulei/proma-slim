## MODIFIED Requirements

### Requirement: 默认部署必须将 page builder 运行状态持久化到宿主机 `~/.ai-page-builder`
系统 SHALL 允许默认部署将 page builder 所依赖的工作区、会话、导出文件、CMS 配置、CMS runtime handoff/access session 记录与运行时设置持久化到宿主机 `~/.ai-page-builder`，而不是仅保存在容器的临时文件系统中。

#### Scenario: server 服务在固定容器路径下使用挂载后的配置目录
- **WHEN** 默认 compose 部署启动 `server` 服务
- **THEN** 系统 SHALL 将宿主机 `~/.ai-page-builder` 绑定到容器内固定路径 `/home/bun/.ai-page-builder`
- **AND** `server` SHALL 使用该固定路径作为运行时配置与工作区根目录

#### Scenario: 使用同一宿主机配置目录重建容器后保留项目状态
- **WHEN** 操作者停止并重新创建容器，且继续使用同一个宿主机 `~/.ai-page-builder`
- **THEN** 系统 SHALL 保留已有的 page builder 项目、工作区、会话记录、导出结果与 CMS 配置
- **AND** 系统 SHALL NOT 因容器重建而将这些状态重置为全新环境

#### Scenario: 使用同一宿主机配置目录重建 server 后保留 CMS runtime 会话
- **WHEN** CMS 集成模式下 handoff 或 Builder Access Session 已写入 CMS runtime store
- **AND** 操作者停止并重新创建 `server` 容器，且继续使用同一个宿主机 `~/.ai-page-builder`
- **THEN** 系统 SHALL 能在 TTL 内读取这些 CMS runtime 会话记录
- **AND** 系统 SHALL NOT 因容器重建而把未过期 handoff/access session 全部视为不存在

### Requirement: Docker CMS 集成配置必须覆盖第一期运行时输入
系统 SHALL 在 Docker 部署资产中暴露 CMS 集成第一期需要的 PageBuilder 运行时配置，并 SHALL 保持 Docker 对外配置使用 `AI_PAGE_BUILDER_*` 命名。CMS 集成模式 SHALL 暴露 access session 续期阈值配置，并 SHALL 说明默认文件 runtime store 会持久化 Builder Access Cookie bearer token，因此宿主机配置目录需要按敏感数据目录保护。

#### Scenario: standalone 默认部署不启用 CMS 集成模式
- **WHEN** Docker 部署未设置 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`
- **THEN** 系统 SHALL 保持 standalone 行为
- **AND** 系统 SHALL NOT 因缺少 CMS base URL、public origin 或 integration secret 而启动失败

#### Scenario: CMS 集成模式声明所有必需运行时输入
- **WHEN** 操作者查看 Docker `.env` 示例、compose 和启动脚本
- **THEN** 系统 SHALL 提供 `AI_PAGE_BUILDER_INTEGRATION_MODE`、`AI_PAGE_BUILDER_PUBLIC_ORIGIN`、`AI_PAGE_BUILDER_BASE_PATH`、`AI_PAGE_BUILDER_CMS_BASE_URL`、`AI_PAGE_BUILDER_INTEGRATION_SECRET`、`AI_PAGE_BUILDER_HANDOFF_TTL_MS`、`AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS`、`AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS` 和 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 的配置入口
- **AND** `AI_PAGE_BUILDER_CMS_BASE_URL` 文档 SHALL 说明它是用于 `/ui/login` 的 CMS 管理端 API base URL，而不是 CMS Site URL
- **AND** 文档 SHALL 说明 Builder Access Cookie bearer token 会随 access session 写入 CMS runtime store

#### Scenario: Docker 外部配置不要求直接设置内部 PROMA 变量
- **WHEN** 操作者按 Docker 文档配置 PageBuilder
- **THEN** 文档和示例 SHALL NOT 要求操作者直接设置 `PROMA_CONFIG_DIR`、`PROMA_CLAUDE_HOME` 或 `PROMA_CMS_BASE_URL`
- **AND** 系统 SHALL 在容器启动边界把必要 `AI_PAGE_BUILDER_*` 映射到内部兼容变量

#### Scenario: CMS base URL 映射给现有内部 CMS 读取链路
- **WHEN** Docker 部署设置 `AI_PAGE_BUILDER_CMS_BASE_URL`
- **THEN** `server` 容器内现有 CMS gateway、CMS browser 和静态导出链路 SHALL 能通过内部兼容变量读取到相同 CMS 管理端 base URL

#### Scenario: 同步导出超时配置传入 server 容器
- **WHEN** Docker 部署设置 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS`
- **THEN** CMS 同步导出接口 SHALL 能在 `server` 容器运行时读取该值
- **AND** 系统 SHALL NOT 只在 `.env` 示例中声明该变量却不传入容器

#### Scenario: CMS runtime store 单实例边界写入文档
- **WHEN** 操作者查看 Docker `.env` 示例或部署说明
- **THEN** 文档 SHALL 说明默认 CMS runtime store 使用配置目录下的文件持久化
- **AND** 文档 SHALL 说明该默认文件 store 只支持单 `server` 实例语义
- **AND** 文档 SHALL NOT 宣称多个 `server` 实例可安全共享同一个文件 runtime store
