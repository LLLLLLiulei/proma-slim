## ADDED Requirements

### Requirement: CMS 访问配置必须由宿主本地运行时文件提供
系统 SHALL 由 Proma 主进程从 `getConfigDir()/cms-settings.json` 或等价的宿主本地配置文件读取 CMS 访问配置，并使用其中的 `baseUrl`、`currentSite`、`zusid` 组装只读代理请求；系统 MUST NOT 将实时 Cookie 凭证写入仓库模板、工作区文件、前端页面或 Agent 可见消息中。

#### Scenario: 宿主通过本地配置文件组装 CMS Cookie
- **WHEN** page-builder 会话首次需要访问 CMS 栏目、内容或资源
- **THEN** 系统 SHALL 从宿主本地配置中读取 `baseUrl`、`currentSite` 与 `zusid`
- **AND** 系统 SHALL 以 `CurrentSite=<currentSite>; ZUSID=<zusid>` 的形式组装上游请求 Cookie
- **AND** 系统 SHALL 不把这些原始值透传给前端、Agent 或工作区私有文件之外的任何持久化位置

### Requirement: Builder 必须提供 CMS 数据源选择器模态框
系统 SHALL 在 `page-builder` 的 Builder 页中提供专用的 CMS 数据源选择器模态框，使用户能够在不离开当前左右分栏工作台的前提下，为目标页面区域选择来自 CMS 的栏目或内容数据源。

#### Scenario: 用户手动打开 CMS 选择器
- **WHEN** 用户位于 `page-builder` 的 Builder 页，并主动点击“从 CMS 选择”入口
- **THEN** 系统 SHALL 在当前 Builder 页上打开 CMS 数据源选择器模态框
- **AND** 系统 SHALL 保持左侧预览与右侧对话主布局不被替换为单独页面

#### Scenario: Agent 在对话过程中主动触发 CMS 选择器
- **WHEN** 当前 Builder 会话中的 Agent 判断用户请求需要从 CMS 选择数据源，并调用相应交互工具
- **THEN** 系统 SHALL 在当前 Builder 页上自动打开同一个 CMS 数据源选择器模态框
- **AND** 系统 SHALL 将当前选择请求与该次工具调用关联，供用户完成选择后继续当前对话轮次

### Requirement: CMS 选择器必须支持栏目与内容两类数据源模式
系统 SHALL 允许用户在 CMS 选择器中以统一交互方式浏览和选择栏目或内容，并把选择结果归一化为 `channel-node`、`channel-children`、`content-item`、`content-list` 四类数据源语义。

#### Scenario: 选择栏目子项作为导航数据源
- **WHEN** 用户在 CMS 选择器中选择某个栏目并指定使用其子栏目集合
- **THEN** 系统 SHALL 生成 `channel-children` 类型的数据源结果
- **AND** 该结果 SHALL 保留栏目标识与子栏目集合信息，供后续导航或栏目列表类区块消费

#### Scenario: 选择单条内容作为单区块数据源
- **WHEN** 用户在 CMS 选择器中选定一条具体内容作为当前区域的数据来源
- **THEN** 系统 SHALL 生成 `content-item` 类型的数据源结果
- **AND** 该结果 SHALL 保留该内容的稳定标识、内容类型与用于渲染的基础字段摘要

#### Scenario: 选择栏目内容列表作为图文列表或轮播数据源
- **WHEN** 用户在 CMS 选择器中选择某个栏目下的一组内容作为当前区域的数据来源
- **THEN** 系统 SHALL 生成 `content-list` 类型的数据源结果
- **AND** 该结果 SHALL 保留栏目标识、内容类型与列表查询条件，供图文列表、新闻列表或轮播区块消费

### Requirement: 第一阶段内容浏览必须以栏目内列表和标题搜索为主
系统 SHALL 在第一阶段基于“先选栏目，再浏览或搜索内容”的方式构建内容选择交互；内容搜索 SHALL 优先基于当前已选栏目与标题字段进行，而不是假设存在稳定的全站全文检索或多状态筛选接口。

#### Scenario: 在已选栏目内按标题搜索内容
- **WHEN** 用户已在 CMS 选择器中选定某个栏目，并输入内容搜索词
- **THEN** 系统 SHALL 基于该栏目标识与标题查询条件请求内容列表
- **AND** 系统 SHALL 返回与该栏目范围匹配的内容项分页结果

#### Scenario: 未选栏目时不依赖全局内容搜索
- **WHEN** 用户尚未选定栏目且尝试直接搜索内容
- **THEN** 系统 SHALL 引导用户先选定栏目或由 Agent 明确目标栏目范围
- **AND** 系统 SHALL 不把全局内容搜索视为第一阶段的必备能力

### Requirement: Agent 交互式 CMS 选择必须返回结构化结果
系统 SHALL 通过 page-builder 专用交互工具向 Agent 返回结构化的 CMS 选择结果，而不是将用户选择降级为普通聊天文本或有限选项标签。

#### Scenario: RequestCmsSelection 在用户完成选择后恢复当前工具调用
- **WHEN** Agent 在 page-builder 会话中发起一次 CMS 选择请求，且用户完成了选择并确认
- **THEN** 系统 SHALL 将该选择结果以结构化对象返回给当前工具调用
- **AND** Agent SHALL 能在同一轮执行中继续基于该结果生成或修改页面

#### Scenario: 结构化结果包含稳定数据源字段
- **WHEN** 系统向 Agent 返回一次成功的 CMS 选择结果
- **THEN** 返回结果 SHALL 至少包含数据源类型、稳定标识、显示名称与可选的渲染 hint
- **AND** 系统 SHALL 不要求 Agent 从自由文本中反向解析这些结构化字段

#### Scenario: 用户取消选择时不伪造结果
- **WHEN** 用户关闭 CMS 选择器模态框或显式取消当前 CMS 选择请求
- **THEN** 系统 SHALL 将该次交互标记为已取消
- **AND** 系统 SHALL 不向 Agent 伪造栏目或内容选择结果

### Requirement: 受保护 CMS 资源必须通过服务端代理预览并可导入工作区
系统 SHALL 通过 Proma 主进程托管的统一只读代理访问受保护 CMS 资源，并在页面生成需要本地资源时将其导入工作区，而不是把受保护的原始 CMS 链接直接暴露给前端或最终静态页面。

#### Scenario: CMS 选择器通过受保护代理预览媒体资源
- **WHEN** 用户在 CMS 选择器中浏览带有图片、文件、音频或视频封面的内容
- **THEN** 系统 SHALL 通过 Proma 服务端代理为该选择器提供预览资源
- **AND** 前端 SHALL 不直接持有 CMS 服务账号凭证或使用原始受保护资源地址

#### Scenario: 页面生成时导入受保护资源到工作区
- **WHEN** Agent 基于 CMS 数据源生成页面，并需要在页面中使用受保护图片或文件资源
- **THEN** 系统 SHALL 将对应资源导入当前工作区的 `workspace-files` 下
- **AND** 生成后的静态页面 SHALL 优先引用工作区内的本地相对路径，而不是 CMS 的原始受保护地址

#### Scenario: 导入器优先使用 preview/news 受控资源链路
- **WHEN** CMS 列表项仅返回 `upload/...` 形式的相对资源路径
- **THEN** 系统 SHALL 优先基于 `baseUrl` 对应的 `preview/news/<relative-path>` 受控地址构造预览与导入来源
- **AND** 系统 SHALL 不直接假设裸 `https://<host>/upload/...` 根路径可访问

### Requirement: CMS 数据源绑定必须以轻量元数据持久化
系统 SHALL 在 page-builder 中以轻量绑定元数据形式记录页面区块与 CMS 数据源之间的关联，为后续“重新从 CMS 同步”保留基础，同时不把这类绑定信息直接写入可见聊天历史或导出的静态 HTML。

#### Scenario: 成功生成后记录区块与数据源绑定
- **WHEN** 用户基于某个 CMS 数据源完成一次页面生成或区块更新
- **THEN** 系统 SHALL 在当前工作区的私有元数据中记录目标区块与该 CMS 数据源的绑定关系
- **AND** 该绑定 SHALL 包含数据源类型、稳定标识与最近一次快照信息

#### Scenario: 绑定元数据不进入可见聊天历史或导出页面
- **WHEN** 系统持久化 CMS 数据源绑定信息
- **THEN** 系统 SHALL 不把该绑定元数据作为普通聊天正文写入消息历史
- **AND** 系统 SHALL 不把该绑定元数据直接内嵌到导出的静态 HTML 中作为运行时依赖
