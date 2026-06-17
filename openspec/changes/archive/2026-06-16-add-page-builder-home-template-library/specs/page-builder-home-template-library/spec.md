## ADDED Requirements

### Requirement: standalone 首页资源区 Tabs
系统 SHALL 在 PageBuilder standalone 首页启动输入框下方展示资源区 Tabs，并提供“模板库”和“历史记录”两个入口；资源区默认打开“模板库”。

#### Scenario: standalone 首页默认展示模板库 Tab
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 standalone 模式
- **THEN** 系统 SHALL 在启动输入框下方展示“模板库 / 历史记录”Tabs
- **AND** 系统 SHALL 默认选中“模板库”Tab

#### Scenario: 历史记录作为同级 Tab 入口
- **WHEN** standalone 首页资源区渲染完成
- **THEN** 系统 SHALL 提供可切换到“历史记录”的 Tab 入口
- **AND** 历史记录入口 SHALL 与模板库处于同一资源区层级

#### Scenario: Tab 内容保持挂载
- **WHEN** standalone 首页资源区渲染完成
- **THEN** 系统 SHALL 同时挂载模板库内容和历史记录内容
- **AND** 系统 SHALL 通过隐藏非当前 Tab 内容来切换可见区域
- **AND** 系统 SHALL NOT 在模板库和历史记录之间切换时卸载另一个 Tab 内容

#### Scenario: CMS 集成生产模式隐藏资源区
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL NOT 展示模板库 Tab、历史记录 Tab 或本地模板列表

#### Scenario: 开发态 CMS bypass 按 standalone 展示
- **WHEN** 用户访问 PageBuilder 首页且 integration status 返回 `integrationMode: "cms"`、`enabled: true` 和 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 按 standalone 行为展示“模板库 / 历史记录”Tabs
- **AND** 系统 SHALL 默认选中“模板库”Tab

### Requirement: 模板库列表状态
系统 SHALL 在模板库 Tab 中加载用户模板列表，并正确展示 loading、empty、error 和 retry 状态。

#### Scenario: 加载模板列表
- **WHEN** standalone 首页默认打开模板库 Tab
- **THEN** 系统 SHALL 请求全局 PageBuilder 模板列表 API
- **AND** 系统 SHALL 在请求完成前展示模板库加载态

#### Scenario: 展示模板卡片
- **WHEN** 模板列表 API 返回一个或多个用户模板
- **THEN** 系统 SHALL 为每个模板展示模板卡片
- **AND** 模板卡片 SHALL 展示模板名称
- **AND** 模板卡片 SHALL NOT 展示模板描述或标签

#### Scenario: 模板卡片展示实时预览而非缩略图
- **WHEN** 系统渲染模板卡片
- **THEN** 系统 SHALL 在卡片主体内使用 iframe 加载模板 `previewUrl` 展示预览效果
- **AND** iframe 预览 SHALL 使用与历史记录卡片一致的桌面缩略缩放策略
- **AND** 系统 SHALL NOT 请求或展示模板缩略图资源

#### Scenario: 模板列表为空
- **WHEN** 模板列表 API 返回空列表
- **THEN** 系统 SHALL 展示模板库空状态
- **AND** 空状态 SHALL 引导用户先在 Builder 中另存模板

#### Scenario: 模板列表加载失败
- **WHEN** 模板列表 API 请求失败
- **THEN** 系统 SHALL 在模板库区域展示错误信息和“重试”入口
- **AND** 系统 SHALL NOT 影响上方 prompt 创建入口或历史记录 Tab 入口

#### Scenario: 重试加载模板列表
- **WHEN** 用户在模板库错误态点击“重试”
- **THEN** 系统 SHALL 重新请求模板列表 API

### Requirement: 模板预览
系统 SHALL 在模板卡片内展示模板预览效果，并允许用户从模板卡片新窗口打开完整模板预览；两者都使用后端返回的模板 `previewUrl`。

#### Scenario: 新窗口打开模板预览
- **WHEN** 用户点击某个模板卡片的“预览”按钮
- **THEN** 系统 SHALL 使用新窗口打开该模板的 `previewUrl`

#### Scenario: 卡片内加载模板 iframe 预览
- **WHEN** 系统展示模板库列表
- **THEN** 系统 SHALL 在每个模板卡片内使用 iframe 加载该模板的 `previewUrl`
- **AND** iframe 预览 SHALL 以缩略缩放方式展示桌面页面效果，而不是按卡片宽度渲染成移动端效果
- **AND** iframe 预览 SHALL 不替代“预览”按钮的新窗口打开能力

#### Scenario: public base path 下预览地址保持可用
- **WHEN** 模板列表 API 返回包含 public base path 的 `previewUrl`
- **THEN** 系统 SHALL 直接使用该 `previewUrl` 作为卡片 iframe 地址和新窗口预览地址
- **AND** 系统 SHALL NOT 在前端重新拼接或破坏该预览地址

### Requirement: 使用模板创建项目
系统 SHALL 允许用户从模板库使用模板创建新的 PageBuilder 项目，并在当前窗口进入 Builder。

#### Scenario: 使用模板后进入 Builder
- **WHEN** 用户点击某个模板卡片的“使用模板”按钮，填写非空项目名称并确认，且模板实例化 API 成功返回 `workspace`、`session` 和 `previewState`
- **THEN** 系统 SHALL 在当前窗口跳转到该 `workspace.id` 和 `session.id` 对应的 Builder 页面

#### Scenario: 使用模板前输入项目名称
- **WHEN** 用户点击某个模板卡片的“使用模板”按钮
- **THEN** 系统 SHALL 打开项目名称输入弹框
- **AND** 项目名称默认值 SHALL 为模板名称
- **AND** 项目名称为空或仅包含空白字符时 SHALL 禁用确认提交

#### Scenario: 使用模板写入 preview state cache
- **WHEN** 模板实例化 API 成功返回有效 `previewState`
- **THEN** 系统 SHALL 将该 `previewState` 写入对应 workspace 的 preview state cache

#### Scenario: 使用模板不写 bootstrap prompt
- **WHEN** 用户点击“使用模板”前首页输入框中存在文本
- **AND** 模板实例化 API 成功
- **THEN** 系统 SHALL NOT 为返回的 session 写入 bootstrap payload
- **AND** Builder 页面 SHALL NOT 因该输入框文本自动触发首轮 Agent 消息

#### Scenario: 使用模板不调用 prompt 创建流程
- **WHEN** 用户在使用模板弹框中填写非空项目名称并确认
- **THEN** 系统 SHALL 调用模板使用 API，并在请求体中传入 trim 后的项目名称
- **AND** 系统 SHALL NOT 调用首页 prompt 创建项目流程或 `sendMessage`

#### Scenario: 使用模板期间防止重复提交
- **WHEN** 某个模板使用请求正在执行
- **THEN** 系统 SHALL 禁用模板卡片的“使用模板”提交入口和项目名称弹框确认入口，或等效防止重复创建多个项目

#### Scenario: 使用模板失败不导航
- **WHEN** 模板实例化 API 请求失败
- **THEN** 系统 SHALL 展示明确错误反馈
- **AND** 系统 SHALL NOT 跳转 Builder
- **AND** 系统 SHALL NOT 写入 bootstrap payload 或 preview state cache

#### Scenario: public base path 下进入 Builder
- **WHEN** 当前 PageBuilder 配置了 public base path
- **AND** 用户成功使用模板创建项目
- **THEN** 系统 SHALL 使用包含该 public base path 的 Builder 路径进行当前窗口跳转

### Requirement: 删除用户模板
系统 SHALL 允许用户删除可删除的用户模板，并确保删除模板不影响已经通过该模板创建出的 PageBuilder 项目。

#### Scenario: 可删除模板展示删除入口
- **WHEN** 模板列表中的模板 `deletable` 为 `true`
- **THEN** 系统 SHALL 在模板卡片上展示删除入口

#### Scenario: 删除前二次确认
- **WHEN** 用户点击模板卡片上的删除入口
- **THEN** 系统 SHALL 先展示删除确认
- **AND** 系统 SHALL NOT 在用户确认前删除模板

#### Scenario: 确认删除后更新列表
- **WHEN** 用户确认删除模板且删除 API 成功
- **THEN** 系统 SHALL 关闭确认状态
- **AND** 系统 SHALL 从模板库列表移除该模板或重新加载模板列表

#### Scenario: 删除模板不影响已创建项目
- **WHEN** 用户删除某个模板
- **THEN** 系统 SHALL NOT 删除或修改已经通过该模板创建出的 PageBuilder workspace

#### Scenario: 删除失败展示错误
- **WHEN** 删除模板 API 请求失败
- **THEN** 系统 SHALL 展示明确错误反馈
- **AND** 系统 SHALL NOT 误移除该模板卡片

### Requirement: 历史记录能力不回退
系统 SHALL 在引入首页模板库 Tabs 后保留历史记录现有预览、编辑、删除能力。

#### Scenario: 切换到历史记录 Tab 后展示历史记录
- **WHEN** 用户在 standalone 首页资源区切换到“历史记录”Tab
- **THEN** 系统 SHALL 展示现有 PageBuilder 历史记录区域

#### Scenario: 历史记录操作保持原语义
- **WHEN** 用户在“历史记录”Tab 中操作历史项目卡片
- **THEN** 历史项目预览、编辑、删除、锁定项目禁删和无预览空态 SHALL 保持既有语义
