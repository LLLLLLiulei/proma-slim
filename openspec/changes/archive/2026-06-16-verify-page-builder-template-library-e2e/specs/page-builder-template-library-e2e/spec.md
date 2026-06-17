## ADDED Requirements

### Requirement: Standalone 模板库端到端闭环验证
系统 SHALL 在模板库一期归档前验证 standalone 主流程完整可用，覆盖当前项目另存模板、首页模板库展示、新窗口预览、使用模板创建项目、Builder 直接展示模板页面、删除模板和历史项目保留。

#### Scenario: 完整 standalone 用户路径
- **WHEN** 验证人员或自动化测试准备一个可预览的 standalone PageBuilder 项目，并从 Builder 将当前项目另存为用户模板
- **THEN** 系统 SHALL 在首页模板库展示该模板
- **AND** 系统 SHALL 能在新窗口打开该模板预览
- **AND** 用户输入项目名称并使用模板后，系统 SHALL 创建新的 workspace/session 并进入 Builder
- **AND** 新 Builder 的预览区 SHALL 直接展示模板页面
- **AND** 系统 SHALL NOT 触发 Agent 首轮消息或写入 bootstrap prompt
- **AND** 删除用户模板后，该模板 SHALL 从模板库消失
- **AND** 通过模板创建的历史项目 SHALL 仍保留在历史记录中

#### Scenario: 浏览器验证记录
- **WHEN** 完成 standalone 用户路径验证
- **THEN** 本 change 的任务记录 SHALL 写明验证方式、访问地址、关键步骤和结果
- **AND** 若使用 Playwright MCP 验证，记录 SHALL 覆盖模板库、历史记录、Builder 预览和删除后状态

### Requirement: 可重复回归验证
系统 SHALL 使用现有 Bun 单元、路由和组件测试覆盖模板库一期跨模块回归，不得只依赖手工浏览器验证。

#### Scenario: 后端与路由回归
- **WHEN** 执行本 change 的验证任务
- **THEN** 系统 SHALL 覆盖模板列表、详情、预览、删除、当前项目另存模板、使用模板创建项目、public base path、编辑锁和 CMS 集成路由边界的测试
- **AND** 测试 SHALL 验证无内置模板扫描、无缩略图字段或缩略图 API、模板预览不注入 workspace preview bridge 或 CMS runtime

#### Scenario: 前端页面和组件回归
- **WHEN** 执行本 change 的验证任务
- **THEN** 系统 SHALL 覆盖首页模板库 Tabs、模板卡片预览、使用模板项目名称弹框、preview state cache 写入、不写 bootstrap payload、删除模板反馈、Builder 另存模板入口和历史记录语义不回退

### Requirement: CMS 集成边界验证
系统 SHALL 在模板库一期归档前验证 CMS 集成相关边界，明确区分 CMS 集成生产模式、CMS dev standalone bypass 和 CMS integrated Builder 当前 workspace 另存模板 API。

#### Scenario: CMS 集成生产模式阻断 standalone 模板库
- **WHEN** 系统运行在 CMS 集成生产模式
- **THEN** 首页 SHALL NOT 挂载 standalone 模板库或历史记录资源区
- **AND** 全局模板库列表、详情、预览、使用和删除 API SHALL 返回 CMS 集成模式不可用或等价阻断结果

#### Scenario: CMS dev standalone bypass
- **WHEN** 系统运行在 CMS 集成模式且启用 dev standalone bypass
- **THEN** 首页 SHALL 按 standalone 行为展示模板库和历史记录资源区
- **AND** 全局模板库 API SHALL 可按 standalone 行为用于开发调试

#### Scenario: CMS integrated Builder 另存静态快照模板
- **WHEN** CMS integrated Builder 当前 workspace 在有效 Builder Access Session 和编辑锁下另存模板
- **THEN** workspace 维度另存模板 API SHALL 可用
- **AND** 生成的模板 SHALL 是静态快照
- **AND** 产物 SHALL NOT 残留 CMS 作者态标签、CMS runtime/manifest、CMS cookie、session、token、Builder Access Session 或 server-to-server secret

### Requirement: 不扩大模板库一期范围
系统 SHALL 在本验证 change 中保持模板库一期范围，不得引入新的业务能力或测试基础设施依赖。

#### Scenario: 不新增业务能力
- **WHEN** 实施本 change
- **THEN** 系统 SHALL NOT 新增内置模板、模板缩略图、模板市场、zip 导入、外部 URL 抓取、CMS 动态模板、CMS 侧模板资产或模板共享权限

#### Scenario: 不新增 E2E 框架依赖
- **WHEN** 实施本 change
- **THEN** 系统 SHALL NOT 引入新的 Playwright test runner、CI E2E 编排框架或生产运行时依赖
- **AND** 真实浏览器验证 SHALL 使用 Playwright MCP 或等效手工流程完成

### Requirement: OpenSpec 同步和归档前一致性验证
系统 SHALL 在模板库一期归档前验证 OpenSpec 文档、任务拆分文档、active change 规格和实现行为一致。

#### Scenario: 归档前文档一致性
- **WHEN** 本 change 完成验证并准备同步/归档模板库相关 changes
- **THEN** 系统 SHALL 检查任务拆分文档、需求设计文档、proposal/design/specs/tasks 与实现行为不存在已知冲突
- **AND** 系统 SHALL 运行 OpenSpec 严格校验
- **AND** 如发现规格描述与已确认行为冲突，系统 SHALL 先修正文档或规格再归档
