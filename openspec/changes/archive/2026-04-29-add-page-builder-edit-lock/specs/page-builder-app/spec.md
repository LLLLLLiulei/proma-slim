## ADDED Requirements

### Requirement: Builder 页面编辑能力必须持有项目编辑锁
系统 SHALL 仅在当前 builder 页面持有目标 page-builder 工作区的有效编辑锁时启用项目编辑能力；当编辑锁缺失、失效或被后端拒绝时，系统 SHALL 禁用会修改项目的交互。

#### Scenario: Builder 进入后验证编辑锁
- **WHEN** 用户进入 page-builder builder 页面
- **THEN** 系统 SHALL 验证或取得该工作区的有效编辑锁
- **AND** 系统 SHALL 仅在编辑锁有效时启用对话发送、项目名编辑、内联文本保存、图片替换、block 删除、CMS handoff 和静态导出任务创建等项目操作能力

#### Scenario: 直接访问 builder 旧链接时获取锁
- **WHEN** 用户直接打开一个 builder URL 且该页面没有当前编辑锁
- **THEN** 系统 SHALL 尝试为该项目取得编辑锁
- **AND** 系统 SHALL 仅在取得锁后进入可编辑状态

#### Scenario: 直接访问 builder 但项目已锁定
- **WHEN** 用户直接打开一个 builder URL 且该项目已经被其他编辑者或活跃 Agent 运行锁定
- **THEN** 系统 SHALL NOT 启用 builder 编辑能力
- **AND** 系统 SHALL 提示用户返回首页或打开当前预览查看项目

#### Scenario: 编辑锁丢失时禁用编辑能力
- **WHEN** 当前 builder 页面持有的编辑锁过期、续约失败或被后端判定无效
- **THEN** 系统 SHALL 禁用会修改项目的 builder 交互
- **AND** 系统 SHALL 保留当前可用预览的查看能力
- **AND** 系统 SHALL 提示用户重新从首页进入编辑

### Requirement: Builder 页面必须续约并释放项目编辑锁
系统 SHALL 在 builder 页面保持打开期间定期续约项目编辑锁，并在页面关闭或离开时尽力释放该锁。

#### Scenario: Builder 定期续约
- **WHEN** builder 页面持有有效 page-builder 编辑锁
- **THEN** 系统 SHALL 按后端返回的 heartbeat 间隔定期续约该锁
- **AND** 系统 SHALL 在续约成功后继续保持编辑能力

#### Scenario: Builder 正常关闭时释放锁
- **WHEN** 用户关闭 builder 页面、刷新页面或离开 builder 路由
- **THEN** 系统 SHALL 尽力向后端发送编辑锁释放请求
- **AND** 系统 SHALL NOT 依赖该释放请求作为异常退出的唯一解锁机制

#### Scenario: 刷新 builder 不重复发送初始化需求
- **WHEN** 用户刷新持有编辑锁的 builder 页面
- **THEN** 系统 SHALL 保持既有首页初始化需求只发送一次的语义
- **AND** 系统 SHALL NOT 因编辑锁续约或重新验证而重复发送初始化需求

### Requirement: Page-builder 写请求必须携带编辑锁凭据
系统 SHALL 在 builder 发起 page-builder 写请求时携带当前编辑锁凭据，以便后端验证该页面仍是项目的唯一编辑者。

#### Scenario: 对话发送携带编辑锁
- **WHEN** 用户在 page-builder builder 对话区发送会修改项目的消息
- **THEN** 系统 SHALL 在发送请求中携带当前编辑锁凭据

#### Scenario: 项目级编辑请求携带编辑锁
- **WHEN** 用户在 builder 中修改项目名、保存内联文本、替换图片、删除 block、触发 CMS handoff 或创建静态导出任务
- **THEN** 系统 SHALL 在对应写请求中携带当前编辑锁凭据

#### Scenario: 后端拒绝写请求时展示锁失效反馈
- **WHEN** 后端因编辑锁缺失、过期或不匹配而拒绝 page-builder 写请求
- **THEN** 系统 SHALL 显示编辑锁失效或项目已被占用的反馈
- **AND** 系统 SHALL 禁用后续写入交互直到用户重新进入编辑
