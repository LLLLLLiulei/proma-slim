## MODIFIED Requirements

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
系统 SHALL 通过宿主管理的 CMS 读取链路向 Builder 浏览弹框提供栏目与内容数据，并使用宿主配置的 `baseUrl`、`siteID`、`username` 与 `password` 管理 slim API 访问上下文，而不是要求用户在 UI 中提供原始 CMS 凭据。

#### Scenario: 宿主配置有效时可以读取栏目和内容
- **WHEN** 宿主 CMS 配置有效且上游请求成功
- **THEN** 系统 SHALL 在弹框中加载栏目树与内容摘要数据
- **AND** 系统 SHALL 不要求用户在浏览弹框中输入 `username`、`password`、Bearer token 或其他原始鉴权信息

#### Scenario: CMS 数据读取失败时在弹框内展示错误
- **WHEN** 宿主 CMS 配置缺失、鉴权失败或上游请求失败
- **THEN** 系统 SHALL 在弹框内展示明确的错误提示和重试入口
- **AND** 系统 SHALL 不在错误内容中泄露密码、token、Cookie 值或完整请求头
