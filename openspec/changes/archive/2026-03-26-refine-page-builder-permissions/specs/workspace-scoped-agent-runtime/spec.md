## MODIFIED Requirements

### Requirement: Agent 工作区必须作为持久化实体存在
系统 SHALL 将 Agent 工作区作为独立持久化实体管理，并在首次启动或缺失时自动提供默认工作区；工作区元数据 MUST 支持保存可选的模板/类型标记，以便运行时解析工作区级行为，但不影响已有普通工作区的兼容性。

#### Scenario: 首次启动创建默认工作区
- **WHEN** 应用启动且尚未存在任何 Agent 工作区索引或默认工作区记录
- **THEN** 系统 SHALL 创建一个可持久化的默认工作区，并为其建立稳定的工作区目录与标识

#### Scenario: 工作区 CRUD 持久化
- **WHEN** 用户创建、重命名或删除工作区
- **THEN** 系统 SHALL 更新工作区索引元数据，并保持工作区 slug 与根目录的稳定映射关系

#### Scenario: 新建 page-builder 工作区持久化模板标记
- **WHEN** 用户通过 `page-builder` 入口创建工作区，且创建参数显式指定 `template: 'page-builder'`
- **THEN** 系统 SHALL 在工作区索引中持久化该工作区的 `page-builder` 模板标记，供后续运行时直接识别

#### Scenario: 普通工作区不写入 page-builder 模板标记
- **WHEN** 用户通过普通入口创建工作区，且未指定 `page-builder` 模板
- **THEN** 系统 SHALL 将其作为普通工作区持久化，而不写入 `page-builder` 模板标记

#### Scenario: 删除仍有会话归属的工作区被拒绝
- **WHEN** 用户删除某个仍有 Agent 会话绑定的工作区
- **THEN** 系统 SHALL 拒绝该删除请求，避免留下指向已删除工作区的会话归属

## ADDED Requirements

### Requirement: 工作区级权限策略必须由持久化工作区元数据解析
系统 SHALL 在会话运行前根据其所属工作区的持久化元数据解析工作区级权限策略；带有 `page-builder` 模板标记的工作区 MUST 使用保留 `AskUserQuestion`、自动放行其他工具请求的专用策略，其他工作区继续遵循全局权限模式。

#### Scenario: Page-builder 会话使用工作区专用权限策略
- **WHEN** 某个会话所属工作区带有 `page-builder` 模板标记
- **THEN** 系统 SHALL 以该标记为准解析会话的有效权限行为，而不是仅依赖全局 `agentPermissionMode`

#### Scenario: 历史或普通工作区继续使用原有全局权限模式
- **WHEN** 某个会话所属工作区没有 `page-builder` 模板标记
- **THEN** 系统 SHALL 继续使用原有全局权限模式解析该会话的权限行为，不要求为历史工作区补写新标记
