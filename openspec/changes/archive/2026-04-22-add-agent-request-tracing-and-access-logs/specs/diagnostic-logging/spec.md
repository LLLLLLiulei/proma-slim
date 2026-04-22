## ADDED Requirements

### Requirement: 后端诊断日志必须使用统一的结构化 schema 并持久化到本地日志目录
系统 SHALL 为后端 access log、Agent turn trace 和 SSE transport log 使用统一的结构化日志 schema，并将这些日志持久化到宿主本地日志目录，而不是仅临时输出到非结构化控制台文本。

#### Scenario: 结构化文本日志写入本地日志文件
- **WHEN** 后端处理任意被纳入诊断覆盖范围的 HTTP、Agent 或 SSE 事件
- **THEN** 系统 SHALL 将该事件以结构化文本日志写入本地日志文件
- **AND** 每条日志 SHALL 至少包含时间戳、日志级别、组件名和日志类别字段

#### Scenario: 主文本日志以单行摘要形式输出并包含中文说明
- **WHEN** 系统将 access log、turn trace 或 SSE transport log 写入主文本日志
- **THEN** 系统 SHALL 让单条主日志默认只占一行，便于直接查看和检索
- **AND** 系统 SHALL 在该行中包含中文说明或中文消息，帮助人工快速理解事件含义

#### Scenario: 同一条链路的日志可通过关联字段检索
- **WHEN** 某次用户发送触发了 access log、turn trace 和 SSE transport log
- **THEN** 这些日志 SHALL 共享稳定的关联字段
- **AND** 系统 SHALL 允许通过这些字段把同一条处理链路中的日志串联起来

### Requirement: 诊断日志必须默认记录所有日志级别
系统 SHALL 默认记录系统支持的所有日志级别，包括高频诊断路径中的 `debug` / `trace` 类日志；日志级别字段 SHALL 保留在日志记录中供后续筛选，但默认配置 SHALL NOT 过滤任何级别。

#### Scenario: 默认配置持久化所有日志级别
- **WHEN** 系统使用默认诊断日志配置启动
- **THEN** 系统 SHALL 持久化所有支持的日志级别
- **AND** 系统 SHALL NOT 默认只保留 `info`、`warn` 或 `error`

#### Scenario: 高噪声调试日志默认也会落盘
- **WHEN** 某个 access log、turn trace 或 transport log 被标记为 `debug` 或 `trace`
- **THEN** 系统 SHALL 在默认配置下继续持久化该日志
- **AND** 该日志 SHALL 保留自身的级别字段

### Requirement: 诊断日志必须默认完整记录核心链路的完整可诊断载荷
系统 SHALL 默认完整记录核心请求链路的完整可诊断载荷，包括用户消息、组合消息、结构化请求载荷、final prompt、system prompt、stderr 和关键上游错误信息；日志级别 MAY 用于分类和筛选，但 SHALL NOT 关闭这些核心链路日志。

#### Scenario: 默认配置记录完整 send turn 诊断载荷
- **WHEN** 某次 `POST /api/sessions/:id/send` 被正式受理执行
- **THEN** 系统 SHALL 为该次 turn 记录完整的用户消息、组合消息、结构化请求载荷、final prompt 和 system prompt 诊断内容
- **AND** 系统 SHALL NOT 将这些核心链路内容降级为仅摘要模式

#### Scenario: turn 级消息 sidecar 不应重复整个会话历史
- **WHEN** 系统为某次 send turn 写入与消息相关的 turn 级 sidecar
- **THEN** 系统 SHALL 至少记录该次 turn 新增的用户消息、助手消息或状态消息
- **AND** 系统 MAY 省略已经持久化在会话存储中的更早历史消息，只要当前 turn 的诊断上下文仍可通过消息 sidecar 与 prompt sidecar 完整回溯

#### Scenario: 文件上传请求记录完整结构化载荷而不是原始二进制
- **WHEN** 某个被诊断记录覆盖的请求使用 `multipart/form-data`、文件上传或其他包含二进制内容的请求体
- **THEN** 系统 SHALL 记录该请求的完整结构化字段和上传文件元数据
- **AND** 系统 SHALL NOT 将原始二进制文件内容直接写入诊断日志或 sidecar

#### Scenario: 日志级别不关闭核心原始 payload 记录
- **WHEN** 用户调整诊断日志级别
- **THEN** 系统 MAY 调整额外调试型日志的输出密度
- **AND** 系统 SHALL 继续记录 send turn 的核心原始 payload

### Requirement: 大体积诊断内容必须默认以 sidecar 文件保留全文
系统 SHALL 将完整的结构化请求载荷、final prompt、system prompt、stderr 等大体积诊断内容以按 turn 组织的 sidecar 文件默认落盘；主文本日志 SHALL 记录对应字段类型和 sidecar 路径，而不得用截断摘要替代全文保留。

#### Scenario: 默认保留完整 prompt 与结构化请求载荷全文
- **WHEN** 某次 send turn 完成了请求载荷和 prompt 组装
- **THEN** 系统 SHALL 将对应的结构化请求载荷、final prompt 和 system prompt 全文写入与该 turn 关联的 sidecar 文件
- **AND** 主日志 SHALL 记录这些全文对应的 sidecar 路径

#### Scenario: 关键上游错误全文默认可回溯
- **WHEN** 某次 send turn 出现 stderr、typed_error 或 catch error 相关的关键上游错误信息
- **THEN** 系统 SHALL 将这些错误全文保留到与该 turn 关联的诊断日志或 sidecar 文件中
- **AND** 系统 SHALL 允许通过主日志中的关联字段回溯到对应全文

### Requirement: 持久化诊断日志文件必须在 `10 MB` 上限内自动滚动或分片
系统 SHALL 对所有持久化诊断日志文件实施自动滚动与分片策略，确保单个日志文件不超过 `10 MB`；这里的 `10 MB` MUST 解释为 `10 * 1024 * 1024` 字节。

#### Scenario: 主日志达到上限后自动滚动并续写新文件
- **WHEN** 某个活跃的结构化主日志文件达到 `10 MB` 上限
- **THEN** 系统 SHALL 将当前活跃日志文件归档为带日期时间的文件名
- **AND** 系统 SHALL 打开新的活跃日志文件继续写入后续日志

#### Scenario: 后端重启时旧活跃主日志会被立即归档
- **WHEN** 后端服务启动时检测到上一次进程遗留的活跃主日志文件
- **THEN** 系统 SHALL 先将该旧活跃日志文件归档为带日期时间的文件名
- **AND** 系统 SHALL 为当前进程创建新的活跃日志文件

#### Scenario: preview access 主日志在重启时也会立即归档旧活跃文件
- **WHEN** 后端服务启动时检测到上一次进程遗留的 preview access 活跃主日志文件
- **THEN** 系统 SHALL 先将该旧活跃日志文件归档为带日期时间的文件名
- **AND** 系统 SHALL 为当前进程创建新的 preview access 活跃日志文件

#### Scenario: 单个大 payload sidecar 超过上限时自动分片
- **WHEN** 某次 send turn 的 request body、prompt 或 stderr 全文超过 `10 MB`
- **THEN** 系统 SHALL 将该全文拆分为多个有序的 sidecar part 文件
- **AND** 每个 part 文件 SHALL 不超过 `10 MB`
- **AND** 系统 SHALL NOT 因文件大小限制截断原始内容

### Requirement: 滚动后的诊断日志必须执行 retention 清理
系统 SHALL 为滚动后的主日志文件和旧 turn sidecar 目录执行 retention 清理，防止历史诊断文件无限增长；retention 策略 MAY 基于最大保留数量、最大总大小预算、最大保留时长或它们的组合，但系统 SHALL 在超过策略上限时删除最旧的归档项。

#### Scenario: 超过 retention 上限时删除最旧归档
- **WHEN** 滚动后的主日志文件或旧 turn sidecar 目录超过当前 retention 策略上限
- **THEN** 系统 SHALL 删除最旧的归档项
- **AND** 系统 SHALL 保留当前活跃日志文件和当前正在写入的 turn 相关文件
