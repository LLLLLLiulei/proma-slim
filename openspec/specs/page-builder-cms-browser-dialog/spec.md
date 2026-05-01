# page-builder-cms-browser-dialog Specification

## Purpose
定义 `page-builder` Builder 页中的 CMS 浏览弹框能力，包括对话区入口、只读双页签浏览体验、共享栏目上下文，以及通过宿主读取链路提供的栏目和内容摘要展示。
## Requirements
### Requirement: Builder 对话区必须提供 CMS 浏览入口
系统 SHALL 在 `page-builder` Builder 页右侧对话输入区的动作区域提供一个常驻的“浏览 CMS”入口，使用户能够在不离开当前工作台的情况下打开 CMS 浏览弹框。

#### Scenario: 用户从对话动作区打开 CMS 浏览弹框
- **WHEN** 用户进入某个 `page-builder` Builder 页
- **THEN** 系统 SHALL 在现有 composer action 区域展示“浏览 CMS”入口
- **AND** 当用户点击该入口时，系统 SHALL 打开 CMS 浏览弹框

### Requirement: CMS 浏览弹框必须提供双页签浏览界面
系统 SHALL 以模态弹框提供 CMS 浏览界面，并包含站点下拉框、`栏目` 与 `内容` 两个页签；具体的确认选择协议与确认后自动 handoff 行为 SHALL 由相关 CMS selection / handoff specs 约束。

#### Scenario: 打开弹框时默认进入栏目页签
- **WHEN** 用户首次打开 CMS 浏览弹框
- **THEN** 系统 SHALL 显示弹框标题、站点下拉框和 `栏目`、`内容` 两个页签
- **AND** 系统 SHALL 默认激活 `栏目` 页签

#### Scenario: 切换到内容页签时显示左右分栏布局
- **WHEN** 用户在 CMS 浏览弹框中切换到 `内容` 页签
- **THEN** 系统 SHALL 在左侧显示栏目树
- **AND** 系统 SHALL 在右侧显示当前栏目下的内容列表区域

### Requirement: 栏目树必须在两个页签中共享当前栏目上下文
系统 SHALL 在 `栏目` 与 `内容` 两个页签之间共享同一个当前栏目状态，使用户在切换页签时不会丢失当前浏览上下文。

#### Scenario: 在栏目页签选择栏目后切换到内容页签
- **WHEN** 用户在 `栏目` 页签中选择某个栏目后切换到 `内容` 页签
- **THEN** 系统 SHALL 保留该栏目作为当前栏目
- **AND** 系统 SHALL 基于该栏目展示右侧内容列表

#### Scenario: 用户尚未手动选择栏目时进入内容页签
- **WHEN** 栏目树已成功加载，且用户尚未手动选择任何栏目后进入 `内容` 页签
- **THEN** 系统 SHALL 自动选择第一个可用栏目作为当前栏目
- **AND** 系统 SHALL 使用该栏目初始化内容列表区域

### Requirement: CMS 浏览弹框必须在栏目与内容页签前提供显式站点选择
系统 SHALL 在 Builder 的 CMS 浏览弹框中于 `栏目` / `内容` tabs 前提供站点下拉框，并 SHALL 先建立当前站点上下文，再加载该站点下的栏目树、栏目详情和内容列表。

#### Scenario: 打开弹框后先建立默认站点上下文
- **WHEN** 用户打开 CMS 浏览弹框，且宿主成功返回可用站点列表
- **THEN** 系统 SHALL 在 tabs 前渲染站点下拉框
- **AND** 系统 SHALL 优先选中 `siteId = 1` 的站点（若存在）
- **AND** 若站点列表中不存在 `siteId = 1`，系统 SHALL 选中第一个可用站点

#### Scenario: 切换站点后重置站点范围内浏览与勾选状态
- **WHEN** 用户在 CMS 浏览弹框中切换到另一个站点
- **THEN** 系统 SHALL 清空当前栏目、栏目勾选和内容勾选结果
- **AND** 系统 SHALL 清空栏目详情与内容列表缓存
- **AND** 系统 SHALL 重新加载新站点下的栏目树与后续内容数据

### Requirement: 内容页签必须展示当前栏目下的归一化内容摘要
系统 SHALL 为当前栏目展示只读的内容摘要列表，并且每一项至少包含可稳定浏览的标题以及 slim API 能稳定提供的基础摘要元数据，而不直接暴露上游异构原始结构，也不再要求宿主推导内容形状或素材计数。

#### Scenario: 当前栏目存在内容时展示内容摘要列表
- **WHEN** 用户进入 `内容` 页签且当前栏目下存在内容
- **THEN** 系统 SHALL 展示该栏目下的内容项列表
- **AND** 每个内容项 SHALL 至少显示 `title`
- **AND** 当上游提供 `summary`、`addTime`/`publishDate` 或 `logoFile` 时，系统 SHALL 分别以归一化摘要文本、归一化时间和预览图形式展示这些信息
- **AND** 系统 SHALL NOT 展示由宿主推导的 `shape` 标签或素材计数摘要

#### Scenario: 当前栏目没有内容时展示空态
- **WHEN** 用户进入 `内容` 页签且当前栏目下没有任何内容
- **THEN** 系统 SHALL 在右侧内容区域展示空态提示
- **AND** 系统 SHALL 保留左侧栏目树供用户继续切换栏目

### Requirement: CMS 浏览数据必须通过宿主管理的读取链路提供
系统 SHALL 通过宿主管理的 CMS 读取链路向 Builder 浏览弹框提供站点、栏目与内容数据，并仅使用宿主配置的 `baseUrl`、`username` 与 `password` 管理 slim API 访问上下文；站点上下文 MUST 由弹框中的显式站点选择决定，而不是继续要求用户在 UI 中提供原始 CMS 凭据或继续依赖宿主静态 `siteID` 配置。

#### Scenario: 宿主配置有效时可以先读取站点再读取当前站点下的数据
- **WHEN** 宿主 CMS 配置有效，且上游站点、栏目与内容请求成功
- **THEN** 系统 SHALL 在弹框中先加载站点下拉框
- **AND** 系统 SHALL 基于当前选中站点加载对应的栏目树、栏目详情与内容摘要数据
- **AND** 系统 SHALL 不要求用户在浏览弹框中输入 `username`、`password`、Bearer token 或其他原始鉴权信息

#### Scenario: 站点列表或当前站点数据读取失败时在弹框内展示错误
- **WHEN** 宿主配置缺失、站点列表读取失败，或当前选中站点下的栏目 / 内容请求失败
- **THEN** 系统 SHALL 在弹框内展示明确的错误提示和重试入口
- **AND** 系统 SHALL 不在错误内容中泄露密码、token、Cookie 值或完整请求头

### Requirement: CMS 浏览流程必须独立于页面区块选择模式
系统 SHALL 允许用户在未进入页面区块选择模式的情况下直接浏览 CMS，并且 MUST NOT 在本次变更中因打开或关闭弹框而触发页面内容填充或区块绑定行为。

#### Scenario: 未选择页面区块时仍可浏览 CMS
- **WHEN** 用户未进入页面区块选择模式且未选中任何页面区块
- **THEN** 系统 SHALL 仍允许用户打开 CMS 浏览弹框并浏览栏目和内容

#### Scenario: 关闭弹框后不触发页面写入
- **WHEN** 用户关闭 CMS 浏览弹框
- **THEN** 系统 SHALL 不自动修改页面内容
- **AND** 系统 SHALL 不创建任何新的内容绑定或填充结果

### Requirement: CMS 浏览弹框的确认动作必须将当前浏览状态映射为可执行来源模式
系统 SHALL 在 CMS 浏览弹框中根据“当前高亮栏目”和“已勾选固定项”这两类状态，输出可直接交给后续 handoff 与 apply 链路消费的来源模式；固定勾选结果 MUST 优先于仅高亮当前栏目；当当前栏目不满足父栏目来源前提时，系统 MUST 阻止该确认路径，而不是生成一个稳定空来源结果。

#### Scenario: 栏目页签未勾选固定栏目时按当前栏目确认父栏目来源
- **WHEN** 用户位于栏目页签，当前已高亮某个栏目，且没有勾选任何固定栏目
- **THEN** 系统 SHALL 允许用户确认当前栏目
- **AND** 系统 SHALL 将本次确认映射为 `catalogs-by-parent`

#### Scenario: 栏目页签已勾选固定栏目时固定集合优先
- **WHEN** 用户位于栏目页签，并勾选了一个或多个固定栏目
- **THEN** 系统 SHALL 优先将本次确认映射为 `catalogs-by-ids`
- **AND** 系统 SHALL NOT 再把当前高亮栏目解释为父栏目来源

#### Scenario: 当前栏目没有直接子栏目时禁止确认父栏目来源
- **WHEN** 用户位于栏目页签，当前已高亮某个栏目，没有勾选任何固定栏目，且该栏目下没有可用直接子栏目
- **THEN** 系统 SHALL 禁止用户以父栏目来源确认
- **AND** 系统 SHALL 提示当前栏目下没有可用子栏目

#### Scenario: 内容页签未勾选固定内容时按当前栏目确认按栏目取内容来源
- **WHEN** 用户位于内容页签，当前已高亮某个栏目，且没有勾选任何固定内容条目
- **THEN** 系统 SHALL 允许用户确认当前栏目
- **AND** 系统 SHALL 将本次确认映射为 `contents-by-catalog`

#### Scenario: 内容页签已勾选固定内容时固定集合优先
- **WHEN** 用户位于内容页签，并勾选了一个或多个固定内容条目
- **THEN** 系统 SHALL 优先将本次确认映射为 `contents-by-ids`
- **AND** 系统 SHALL NOT 再把当前高亮栏目解释为 `contents-by-catalog`
- **AND** 固定内容勾选结果 SHALL 只允许来自当前同一个栏目

### Requirement: CMS 浏览读取链路必须返回作者态可用的栏目链接和封面字段
系统 SHALL 通过宿主管理的 CMS 读取链路向 Builder CMS 浏览弹框提供作者态可用的归一化栏目字段；当 `/api/catalogsTree` 仅提供树结构字段时，系统 MUST 使用 `/api/catalogs` 的栏目 metadata 补齐 `logoFile`、`listLink`、`link`、`url`、`path` 与 `siteID` 等显示与跳转所需字段，并将其归一化到现有 `PageBuilderCmsCatalog` 字段中。

#### Scenario: 栏目树响应缺少显示字段时使用栏目 metadata 补齐
- **WHEN** 当前站点的 `/api/catalogsTree` 响应包含 `ID`、`parentID`、`siteID`、`name` 与 `children`，但不包含 `logoFile`、`listLink`、`link` 或 `path`
- **THEN** 系统 SHALL 继续保留该响应提供的栏目层级结构
- **AND** 系统 SHALL 从同站点 `/api/catalogs` metadata 中按栏目 id 合并封面与链接字段
- **AND** CMS 浏览弹框消费到的归一化栏目 SHALL 在上游提供数据时包含可用于作者态的 `logoUrl` 与 `path`

#### Scenario: 固定栏目读取直接使用精确 metadata 字段
- **WHEN** CMS 浏览或运行时请求固定栏目 `ids`
- **THEN** 系统 SHALL 使用精确栏目 metadata 响应填充对应栏目
- **AND** 系统 SHALL 保持输入 `ids` 顺序
- **AND** 系统 SHALL 在上游提供数据时返回同样语义的 `logoUrl` 与 `path`

### Requirement: CMS 浏览读取链路必须按 slim API 字段语义归一化内容链接和封面
系统 SHALL 将 `/api/catalogs/{id}/contents` 返回的内容摘要字段归一化为现有 `PageBuilderCmsContentSummary` 字段，其中封面图 MUST 优先来自上游 `logoFile`，跳转链接 MUST 优先来自上游 `link` 或 `url`，而不得要求前端或模型直接消费上游原始字段名。

#### Scenario: 内容摘要包含 logoFile 和 link 时归一化为现有字段
- **WHEN** 内容接口返回包含 `catalogID`、`title`、`logoFile`、`link`、`url`、`summary` 或时间字段的内容项
- **THEN** 系统 SHALL 将 `catalogID` 归一化为 `catalogId`
- **AND** 系统 SHALL 将 `logoFile` 归一化为 `listLogoUrl`
- **AND** 系统 SHALL 将 `link` 或 `url` 归一化为 `publishUrl`
- **AND** 系统 SHALL NOT 要求 CMS 浏览弹框或后续 handoff 直接读取 `item.logoFile`、`item.link` 或 `item.url`

### Requirement: CMS 浏览读取链路必须用站点 URL 解析相对封面图地址
系统 SHALL 对栏目和内容封面图执行统一 URL 解析：绝对 `http(s)` 地址 MUST 原样保留；相对 `logoFile` 地址 MUST 优先使用对应站点的 `url` 作为基准解析；当站点 `url` 缺失或不可用时，系统 MAY 使用既有 CMS `baseUrl` 解析行为作为兜底。CMS `baseUrl` 是宿主调用 slim API 的接口基址，站点 `url` 是 CMS 单个站点的访问地址，两者 MUST NOT 被视为同一个概念。

#### Scenario: 相对栏目 logoFile 使用栏目所属站点 URL 解析
- **WHEN** 栏目 metadata 返回 `siteID` 与相对 `logoFile`
- **AND** `/api/sites` 返回该 `siteID` 对应的有效 `url`
- **THEN** 系统 SHALL 将该 `logoFile` 解析为基于站点 `url` 的绝对 `logoUrl`
- **AND** 系统 SHALL NOT 默认把该路径解析到 CMS `/manager` API base 下

#### Scenario: 栏目详情 logoFile 使用同一站点 URL 解析规则
- **WHEN** CMS 浏览弹框读取栏目详情，且栏目 metadata 返回相对 `logoFile`
- **AND** 本次栏目详情请求携带 `siteId` 或 metadata 包含 `siteID`
- **AND** `/api/sites` 返回对应站点的有效 `url`
- **THEN** 系统 SHALL 将详情中的 `logoUrl` 解析为基于站点 `url` 的绝对地址
- **AND** 该解析语义 SHALL 与栏目列表和 fixed-id 栏目读取保持一致

#### Scenario: 相对内容 logoFile 使用请求站点上下文解析
- **WHEN** 内容接口返回相对 `logoFile` 且内容项本身没有 `siteID`
- **AND** 本次内容请求携带 `siteId`
- **THEN** 系统 SHALL 使用该请求 `siteId` 对应站点的 `url` 解析 `listLogoUrl`
- **AND** 系统 SHALL 保持内容项的 `catalogId` 来自上游 `catalogID`
