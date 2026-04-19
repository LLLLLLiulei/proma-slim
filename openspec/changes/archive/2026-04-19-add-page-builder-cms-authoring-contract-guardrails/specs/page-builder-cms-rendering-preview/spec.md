## ADDED Requirements

### Requirement: CMS preview 在当前作者态无效时必须优先回退到最近一次安全版本
系统 SHALL 在 page-builder workspace preview 发现当前作者态 HTML 存在阻断性的 CMS authoring 校验错误时，优先使用最近一次已通过 CMS 校验的安全版本生成预览，而不得直接把当前失效作者态暴露为最终预览结果。

#### Scenario: 当前作者态命中阻断性 CMS authoring error 时预览回退到安全版本
- **WHEN** preview 服务读取当前 `workspace-files/index.html` 并发现其中存在阻断性的 CMS authoring error
- **THEN** 系统 SHALL 优先使用最近一次安全版本生成本次 preview 响应
- **AND** 系统 SHALL NOT 将当前无效作者态直接作为成功预览返回

#### Scenario: 不存在安全版本时显式返回预览失败
- **WHEN** 当前作者态存在阻断性的 CMS authoring error，且系统尚未记录任何可用的安全版本
- **THEN** 系统 MAY 返回预览失败
- **AND** 该失败 SHALL 明确表达当前 CMS 作者态无效，而不是伪装成普通资源缺失

### Requirement: CMS preview 的安全回退不得静默吞掉作者态错误
系统 SHALL 在对 CMS preview 使用安全回退时保留结构化错误信号，使宿主会话或日志仍能感知当前作者态已经失效，而不得只悄悄展示旧预览。

#### Scenario: 使用安全回退时保留结构化错误上下文
- **WHEN** preview 服务因为 CMS authoring error 回退到最近一次安全版本
- **THEN** 系统 SHALL 保留本次 authoring error 的结构化上下文
- **AND** 宿主会话或调试日志 SHALL 能区分“当前源码有效预览”和“因 CMS 作者态失效而展示的安全回退预览”
