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

### Requirement: CMS 浏览弹框必须提供只读的双页签界面
系统 SHALL 以模态弹框提供只读 CMS 浏览界面，并包含 `栏目` 与 `内容` 两个页签；首版 MUST NOT 提供确认选择、内容填充或页面写入操作。

#### Scenario: 打开弹框时默认进入栏目页签
- **WHEN** 用户首次打开 CMS 浏览弹框
- **THEN** 系统 SHALL 显示弹框标题和 `栏目`、`内容` 两个页签
- **AND** 系统 SHALL 默认激活 `栏目` 页签
- **AND** 系统 SHALL 不显示“确认选择”或“填充页面”类操作按钮

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

### Requirement: CMS 浏览流程必须独立于页面区块选择模式
系统 SHALL 允许用户在未进入页面区块选择模式的情况下直接浏览 CMS，并且 MUST NOT 在本次变更中因打开或关闭弹框而触发页面内容填充或区块绑定行为。

#### Scenario: 未选择页面区块时仍可浏览 CMS
- **WHEN** 用户未进入页面区块选择模式且未选中任何页面区块
- **THEN** 系统 SHALL 仍允许用户打开 CMS 浏览弹框并浏览栏目和内容

#### Scenario: 关闭弹框后不触发页面写入
- **WHEN** 用户关闭 CMS 浏览弹框
- **THEN** 系统 SHALL 不自动修改页面内容
- **AND** 系统 SHALL 不创建任何新的内容绑定或填充结果
