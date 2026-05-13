## ADDED Requirements

### Requirement: CMS 集成模式 edit lock 必须在 builder context 成功后获取
PageBuilder BuilderPage 在 CMS 集成模式下 SHALL 只在 builder context 成功确认当前项目访问会话后获取、续约或释放 edit lock。

#### Scenario: builder context 成功后获取 edit lock
- **WHEN** CMS 集成模式下 BuilderPage 成功获取 builder context，且返回 workspace 是 page-builder 项目
- **THEN** 系统 SHALL 按现有 edit lock 流程复用或获取当前 workspace 的编辑锁
- **AND** 系统 SHALL 在 edit lock 可用后启用项目编辑操作

#### Scenario: builder context 失败时不触发 edit lock
- **WHEN** CMS 集成模式下 BuilderPage 获取 builder context 失败
- **THEN** 系统 SHALL NOT 请求 acquire、renew、status 或 release edit lock 接口
- **AND** 系统 SHALL NOT 从 sessionStorage 恢复 standalone edit lock 片段来绕过 builder context

#### Scenario: standalone edit lock 行为保持不变
- **WHEN** BuilderPage 处于 standalone 模式并进入 page-builder 项目
- **THEN** 系统 SHALL 继续优先复用已有锁上下文或直接获取新的编辑锁
- **AND** 系统 SHALL 继续在锁失效或被拒绝时禁用编辑能力并提示用户重新进入
