# page-builder-cms-sdk-tools Specification

## Purpose
定义 `page-builder` 会话可用的宿主创建 CMS SDK tools，包括 runtime MCP server 挂载条件、只读工具面、宿主管理的鉴权上下文，以及归一化栏目与内容摘要结果。
## Requirements
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

#### Scenario: 鉴权失败时返回脱敏错误
- **WHEN** 宿主使用当前 CMS 配置发起请求，但上游返回鉴权失败、权限不足或其他认证错误
- **THEN** 系统 SHALL 向模型返回可操作的工具错误
- **AND** 系统 SHALL NOT 在错误内容中泄露密码、token、Cookie 值或完整请求头

### Requirement: CMS 读写工具必须区分“读取兼容回退”与“正式写入强约束”
系统 SHALL 让 page-builder CMS 读工具继续接受显式 `siteId` 业务参数，以表达当前业务站点；其中读取链路在兼容旧页面时 MAY 按 `siteId = 1` 回退，但正式 confirmed CMS 写入链路 MUST 先通过 `mcp__cms__decide_cms_binding` 创建有效 `decisionId`，再由 `mcp__cms__apply_cms_binding` 从宿主持久化 apply plan 派生正式站点与 binding props，而不得继续从宿主静态 `siteID` 配置、caller 显式 `siteId` 或 raw binding 输入继承运行时站点。

#### Scenario: 读工具按显式站点返回栏目与内容
- **WHEN** 模型或宿主内部调用 CMS 栏目 / 内容读取链路，并显式传入 `siteId`
- **THEN** 系统 SHALL 基于该 `siteId` 请求上游 CMS 数据
- **AND** 系统 SHALL NOT 从宿主配置中覆盖或改写该业务站点

#### Scenario: 缺少显式站点时统一回退到站点 1
- **WHEN** CMS 栏目 / 内容读取链路缺少显式 `siteId`
- **THEN** 系统 SHALL 以 `siteId = 1` 作为兼容回退值继续执行
- **AND** 系统 SHALL NOT 读取宿主静态 `siteID` 配置作为该次请求的站点

#### Scenario: 正式 CMS 写入缺少有效 decision 或 apply plan 中站点信息时拒绝执行
- **WHEN** `mcp__cms__apply_cms_binding` 缺少有效 `decisionId`，或其对应 apply plan 缺少正式 `siteId`
- **THEN** 系统 SHALL 拒绝本次正式 CMS 写入
- **AND** 系统 SHALL NOT 擅自写出 `site-id="1"` 或其他猜测值

### Requirement: CMS tool 结果必须提供稳定的归一化内容形状
系统 SHALL 将 CMS 的栏目列表与内容列表响应转换为稳定的归一化结果，使后续 Agent 能基于统一字段理解栏目和内容摘要，而不是直接依赖上游异构 JSON 或无法稳定提供的素材形状字段。

#### Scenario: 栏目列表返回归一化树结构
- **WHEN** 模型调用 `mcp__cms__list_catalogs`
- **THEN** 系统 SHALL 返回包含栏目 `id`、`name`、`parentId`、`path`、`contentType`、`contentTypeName`、`hasChild`、`total` 与 `children` 的归一化树结构

#### Scenario: 内容列表返回分页摘要与基础内容项
- **WHEN** 模型调用 `mcp__cms__list_contents`
- **THEN** 系统 SHALL 返回分页信息与归一化内容项列表
- **AND** 每个内容项 SHALL 至少包含 `id`、`catalogId`、`title`、`summary` 与 `publishUrl`
- **AND** 当上游提供 `logoFile` 或 `addTime`/`publishDate` 时，系统 SHALL 在归一化结果中返回 `listLogoUrl` 与 `addedAt`

#### Scenario: 不再返回宿主推导的素材形状与计数
- **WHEN** 宿主通过 slim API 读取内容列表
- **THEN** 系统 SHALL NOT 在归一化结果中返回基于旧 `extendJSON` 或素材计数字段推导的 `shape`、`assetCounts` 或 `assetHints`

### Requirement: 宿主管理的 CMS 读取链路必须支持受控的 fixed-ids 查询
系统 SHALL 在宿主管理的 CMS 读取链路中支持固定栏目 ID 和固定内容 ID 的受控查询能力，以供 preview、static export 与共享 runtime 复用；固定栏目 `ids` MAY 通过 batch API、并发单条读取或等价宿主实现完成；固定内容 `ids` MUST 绑定到单一 `catalogId`，并 MAY 通过该栏目内容列表的分页读取后本地过滤保序实现；系统 MUST NOT 退化为整棵栏目树或整站内容列表加载后再本地过滤。

#### Scenario: 固定栏目 ids 返回有序栏目摘要集合
- **WHEN** 宿主管理的 CMS 读取链路收到某个站点下的有序栏目 `ids`
- **THEN** 系统 SHALL 只查询这些 `ids` 对应的栏目摘要
- **AND** 返回结果 SHALL 保持输入 `ids` 的顺序

#### Scenario: 固定内容 ids 在单一栏目上下文内返回有序内容摘要集合
- **WHEN** 宿主管理的 CMS 读取链路收到某个站点下、同一 `catalogId` 内的有序内容 `ids`
- **THEN** 系统 SHALL 只在该 `catalogId` 的内容范围内解析这些 `ids`
- **AND** 返回结果 SHALL 保持输入 `ids` 的顺序

#### Scenario: fixed-ids 查询不得退化为全量加载
- **WHEN** 宿主管理的 CMS 读取链路执行固定栏目或固定内容 `ids` 查询
- **THEN** 系统 SHALL NOT 先加载整棵栏目树或整站内容列表再本地过滤
- **AND** 系统 SHALL NOT 将 fixed-ids 读取语义退化为全量扫描

#### Scenario: fixed-ids 查询部分失效时默认丢弃无效项
- **WHEN** 某次固定 `ids` 查询中只有部分栏目或内容仍然有效
- **THEN** 系统 SHALL 保留有效项并保持其原始顺序
- **AND** 系统 SHALL 默认丢弃失效项
- **AND** 当所有 `ids` 都失效时，系统 SHALL 返回空结果而不是结构化读取失败

### Requirement: CMS runtime SDK tools must return unified agent-actionable error guidance
系统 SHALL 在 `page-builder` 会话的 runtime CMS SDK tools 失败时，将底层 gateway、domain store、参数校验或未预期异常收敛为单条 plain-text 工具错误；该错误 MUST 同时包含失败原因摘要、下一步恢复方向与 agent 禁止执行的动作，并且 MUST NOT 依赖额外的建议字段、结构化 UI 元数据或暴露宿主凭据、内部路径、完整请求头等敏感信息。

#### Scenario: Upstream authentication or gateway failure returns safe recovery guidance
- **WHEN** `mcp__cms__list_catalogs`、`mcp__cms__list_contents`、`mcp__cms__decide_cms_binding` 或 `mcp__cms__apply_cms_binding` 因上游 CMS 认证失败、权限不足或网关异常而终止
- **THEN** 系统 SHALL 返回说明当前是 CMS 上游失败的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出应检查 CMS 配置或权限，或仅在瞬时网关失败时稍后重试
- **AND** 错误内容 SHALL 明确禁止 agent 伪造栏目、内容、`handoffId`、`decisionId` 或宣称本次 CMS 操作已经成功
- **AND** 错误内容 SHALL NOT 泄露密码、token、Cookie、完整请求头或宿主内部地址

#### Scenario: Tool input validation failure tells agent to fix the input before retrying
- **WHEN** 某个 CMS runtime SDK tool 因输入缺少必填字段、字段组合非法或 payload 不符合当前 contract 而被拒绝
- **THEN** 系统 SHALL 返回指出具体缺失或非法字段的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出应先修正 tool 参数或模板输入，再重新调用该 tool
- **AND** 错误内容 SHALL 明确禁止 agent 在不改动参数的情况下重复提交同一次调用

#### Scenario: Unclassified tool failure falls back to a guarded default message
- **WHEN** 某个未被分类的异常到达 CMS runtime SDK tool 边界
- **THEN** 系统 SHALL 返回统一兜底的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出当前 CMS 步骤未完成，需停止当前调用链并交由宿主侧进一步排查
- **AND** 错误内容 SHALL 明确禁止 agent 伪造缺失上下文、推断成功结果或继续执行依赖本次失败结果的后续 CMS tool
