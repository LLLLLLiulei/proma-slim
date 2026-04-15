## ADDED Requirements

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

## MODIFIED Requirements

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
