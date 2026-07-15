## ADDED Requirements

### Requirement: 后端诊断日志必须覆盖 CMS 上游调用详情
系统 SHALL 将 CMS 上游调用事件纳入后端诊断日志，并以结构化字段记录请求、响应、耗时和异常上下文。

#### Scenario: CMS 上游调用日志写入 backend diagnostic log
- **WHEN** PageBuilder 调用任意 CMS 上游接口
- **THEN** 系统 SHALL 将该事件写入 backend diagnostic log
- **AND** 日志 SHALL 包含可检索的组件名、日志类别、operation、phase、method、url、durationMs 和响应状态字段

#### Scenario: CMS 上游调用日志保留原始请求响应字段
- **WHEN** CMS 上游请求或响应包含请求头、请求体、响应头或响应体
- **THEN** 系统 SHALL 在 CMS upstream diagnostic payload 中记录这些字段
- **AND** 系统 SHALL NOT 对 CMS upstream diagnostic payload 执行敏感字段脱敏

#### Scenario: CMS 二进制资源成功响应不写入完整 body
- **WHEN** CMS 上游资源请求成功且响应是图片、字体、压缩包或其他二进制内容
- **THEN** 系统 SHALL 记录响应状态、响应头、content-type 和 content-length
- **AND** 系统 SHALL NOT 为了写日志而读取并持久化完整二进制响应体
