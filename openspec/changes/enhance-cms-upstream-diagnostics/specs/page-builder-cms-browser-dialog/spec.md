## ADDED Requirements

### Requirement: CMS 浏览读取失败必须展示上游错误详情
系统 SHALL 在 Builder CMS 浏览弹框读取站点、栏目、栏目详情、内容或资源失败时，向用户展示包含 CMS 上游状态和错误摘要的可诊断错误。

#### Scenario: 站点列表读取失败时展示 HTTP 状态和 CMS 错误摘要
- **WHEN** CMS 浏览弹框加载站点列表失败，且宿主读取链路收到 CMS HTTP 错误或 CMS 业务错误响应
- **THEN** 弹框 SHALL 展示包含 HTTP 状态码和 CMS 错误摘要的错误提示
- **AND** 弹框 SHALL 保留重试入口

#### Scenario: 栏目或内容读取失败时展示接口失败详情
- **WHEN** CMS 浏览弹框加载栏目树、栏目详情或内容列表失败
- **THEN** 弹框 SHALL 展示宿主返回的 CMS 上游错误消息
- **AND** 错误消息 SHALL 能区分鉴权失败、权限不足、上游非 2xx、CMS 业务失败或网络失败

#### Scenario: CMS 资源代理失败时展示资源请求失败详情
- **WHEN** CMS 浏览弹框中的封面图或其他 CMS 资源代理请求失败
- **THEN** 宿主 SHALL 返回包含 CMS 资源 URL、HTTP 状态码和 CMS 错误摘要的失败消息
- **AND** 前端 SHALL 能在资源请求失败排查中看到该失败消息
