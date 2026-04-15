## ADDED Requirements

### Requirement: CMS 读写工具必须接受显式 siteId，并区分读路径兼容回退与正式写路径校验
系统 SHALL 让 page-builder CMS 读工具、正式 `apply_cms_binding` 写工具与其宿主管理的内部读取路由接受显式 `siteId` 业务参数，以表达当前业务站点；读取旧页面时，系统 MAY 继续按 `siteId = 1` 做兼容回退，但正式写入新的 CMS 标签时 MUST 使用显式 `siteId`，而不得再从宿主静态 `siteID` 配置继承运行时站点。

#### Scenario: 读工具按显式站点返回栏目与内容
- **WHEN** 模型或宿主内部调用 CMS 栏目 / 内容读取链路，并显式传入 `siteId`
- **THEN** 系统 SHALL 基于该 `siteId` 请求上游 CMS 数据
- **AND** 系统 SHALL 不从宿主配置中覆盖或改写该业务站点

#### Scenario: 读取旧页面时缺少显式站点可兼容回退到站点 1
- **WHEN** CMS 栏目 / 内容读取链路处理旧作者态页面，且当前标签缺少显式 `siteId`
- **THEN** 系统 SHALL 以 `siteId = 1` 作为兼容回退值继续执行读取
- **AND** 系统 SHALL 不读取宿主静态 `siteID` 配置作为该次请求的站点

#### Scenario: 正式写入工具缺少显式站点时拒绝执行
- **WHEN** `apply_cms_binding` 缺少显式 `siteId`
- **THEN** 系统 SHALL 拒绝该次正式写入
- **AND** 系统 SHALL NOT 以 `siteId = 1` 继续生成新的 CMS 标签

## MODIFIED Requirements

### Requirement: CMS 请求上下文必须由宿主管理
系统 SHALL 在宿主侧管理 CMS `baseUrl`、`username`、`password`、token 刷新上下文以及 `apply_cms_binding` 所需的工作区与 mutation pipeline 上下文；站点上下文 MUST 作为显式 `siteId` 业务参数进入读写工具或宿主管理的内部 CMS 读取路由，而 MUST NOT 再由宿主静态 `siteID` 配置隐式决定。

#### Scenario: Tool 输入不暴露原始鉴权字段或宿主内部路径
- **WHEN** 模型调用 `mcp__cms__list_catalogs`、`mcp__cms__list_contents` 或 `mcp__cms__apply_cms_binding`
- **THEN** tool 输入 SHALL 只包含业务查询字段、显式 `siteId`（若有）或 block-scoped apply 字段
- **AND** 输入 SHALL NOT 包含 `username`、`password`、Bearer token、Cookie、原始请求头、绝对工作区路径或 manifest 文件路径

#### Scenario: 鉴权失败时返回脱敏错误
- **WHEN** 宿主使用当前 CMS 连接配置发起请求，但上游返回鉴权失败、权限不足或其他认证错误
- **THEN** 系统 SHALL 向模型返回可操作的工具错误
- **AND** 系统 SHALL NOT 在错误内容中泄露密码、token、Cookie 值或完整请求头
