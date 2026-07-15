## ADDED Requirements

### Requirement: CMS 静态导出失败记录必须包含上游错误详情
系统 SHALL 在 page-builder CMS 静态导出、CMS 同步导出和另存模板静态化过程中，将底层 CMS 上游失败详情写入导出失败记录。

#### Scenario: CMS island 预取失败记录上游接口详情
- **WHEN** 静态导出预取 `cms-catalog` 或 `cms-content` island 所需 CMS 数据失败
- **THEN** 导出 failure 记录 SHALL 包含失败组件、归一化 props、CMS 请求路径、HTTP 状态码和 CMS 错误响应摘要
- **AND** 系统 SHALL NOT 只记录通用的 CMS island 预取失败文案

#### Scenario: CMS 资源本地化失败记录上游资源详情
- **WHEN** 静态导出或另存模板本地化 CMS 远程资源失败
- **THEN** 导出 warning 或 failure 记录 SHALL 包含失败资源 URL、HTTP 状态码、CMS 响应摘要或底层异常 message
- **AND** 系统 SHALL 保留该详情供同步导出接口和后台日志排查

#### Scenario: 另存模板沿用静态导出错误详情
- **WHEN** CMS 集成项目另存模板时因 CMS 数据或 CMS 资源请求失败
- **THEN** 另存模板接口 SHALL 沿用静态导出生成的 CMS 上游错误详情
- **AND** 系统 SHALL NOT 将该失败重新折叠为不可诊断的通用错误
