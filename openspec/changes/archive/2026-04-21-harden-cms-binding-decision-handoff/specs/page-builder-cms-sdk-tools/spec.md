## MODIFIED Requirements

### Requirement: Page-builder 会话必须暴露宿主创建的 CMS SDK tools
系统 SHALL 在满足 CMS 集成启用条件时，为 `page-builder` 会话的 Agent 查询附加一个宿主创建的 runtime SDK MCP server `cms`，并在保留宿主管理边界的前提下暴露只读 CMS data tools、宿主管理的 `decide_cms_binding` 工具与受控 `apply_cms_binding` 工具，而不是要求用户配置外部 MCP 进程或修改工作区 `mcp.json`。

#### Scenario: Page-builder 查询附加查询、decision 与 apply tools
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询，且宿主 CMS 配置可用
- **THEN** 系统 SHALL 为该查询附加 runtime `cms` SDK MCP server
- **AND** 系统 SHALL 允许该查询调用 `mcp__cms__list_catalogs`、`mcp__cms__list_contents`、`mcp__cms__decide_cms_binding` 与 `mcp__cms__apply_cms_binding`

#### Scenario: 普通工作区默认不附加 CMS tools
- **WHEN** 某个不带 `page-builder` 模板标记的会话开始执行 Agent 查询
- **THEN** 系统 SHALL 不为其默认附加 runtime `cms` SDK MCP server

#### Scenario: CMS tools 维持宿主管理的受控边界
- **WHEN** 系统为某个查询附加 runtime `cms` SDK MCP server
- **THEN** 该 server SHALL 仅暴露读取栏目、读取内容列表、创建 CMS binding decision 以及 decision-gated `apply_cms_binding` 四类工具
- **AND** 系统 SHALL NOT 通过该 server 暴露发布、删除、任意文件写入或任意工作区改写能力

### Requirement: CMS 请求上下文必须由宿主管理
系统 SHALL 在宿主侧管理 CMS `baseUrl`、`username`、`password`、token 刷新上下文，以及 confirmed CMS apply 所需的 decision store、persisted apply plan、工作区与 mutation pipeline 上下文。读取链路继续以显式 `siteId` 表达业务站点；宿主必须在 confirmed handoff 阶段预注册 confirmed selection、`targetSelection`、`authoringContext`、`targetSnapshot` 与当前 authoring revision 等上下文，而 `mcp__cms__decide_cms_binding` MUST 只接收 `handoffId` 与候选决策结论，并通过该 `handoffId` 解析宿主管理的上下文；`mcp__cms__apply_cms_binding` MUST 只接收 `decisionId` 与模板字段，而 MUST NOT 再暴露 raw binding identity、显式 `siteId` 或宿主内部路径。

#### Scenario: Decision tool 输入不暴露鉴权字段或宿主内部路径
- **WHEN** 模型调用 `mcp__cms__decide_cms_binding`
- **THEN** tool 输入 SHALL 只包含 `handoffId` 与候选决策字段
- **AND** confirmed CMS apply 所需的结构化业务上下文 SHALL 通过宿主预注册的 handoff record 解析
- **AND** 输入 SHALL NOT 包含 `username`、`password`、Bearer token、Cookie、原始请求头、绝对工作区路径或 manifest 文件路径

#### Scenario: Formal apply tool 输入收敛为 `decisionId` 与模板字段
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`
- **THEN** tool 输入 SHALL 只包含 `decisionId`、`templateBody`、`emptyTemplate?` 与 `errorTemplate?`
- **AND** 输入 SHALL NOT 再要求模型显式提供 `siteId`、`targetSelection`、`kind`、raw source props 或等价 binding identity 字段

### Requirement: CMS 读写工具必须区分“读取兼容回退”与“正式写入强约束”
系统 SHALL 让 page-builder CMS 读工具继续接受显式 `siteId` 业务参数，以表达当前业务站点；其中读取链路在兼容旧页面时 MAY 按 `siteId = 1` 回退，但正式 confirmed CMS 写入链路 MUST 先通过 `mcp__cms__decide_cms_binding` 创建有效 `decisionId`，再由 `mcp__cms__apply_cms_binding` 从宿主持久化 apply plan 派生正式站点与 binding props，而不得继续从宿主静态 `siteID` 配置、caller 显式 `siteId` 或 raw binding 输入继承运行时站点。

#### Scenario: 读工具按显式站点返回栏目与内容
- **WHEN** 模型或宿主内部调用 CMS 栏目 / 内容读取链路，并显式传入 `siteId`
- **THEN** 系统 SHALL 基于该 `siteId` 请求上游 CMS 数据
- **AND** 系统 SHALL NOT 从宿主配置中覆盖或改写该业务站点

#### Scenario: 缺少显式站点时读取链路统一回退到站点 1
- **WHEN** CMS 栏目 / 内容读取链路缺少显式 `siteId`
- **THEN** 系统 SHALL 以 `siteId = 1` 作为兼容回退值继续执行
- **AND** 系统 SHALL NOT 读取宿主静态 `siteID` 配置作为该次请求的站点

#### Scenario: 正式 CMS 写入缺少有效 decision 或 apply plan 中站点信息时拒绝执行
- **WHEN** `mcp__cms__apply_cms_binding` 缺少有效 `decisionId`，或其对应 apply plan 缺少正式 `siteId`
- **THEN** 系统 SHALL 拒绝本次正式 CMS 写入
- **AND** 系统 SHALL NOT 擅自写出 `site-id="1"` 或其他猜测值
