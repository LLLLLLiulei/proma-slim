## ADDED Requirements

### Requirement: 首页模板库导入入口
系统 SHALL 在首页模板库 Header 的刷新按钮左侧提供“导入模板”入口，用于上传静态 zip 并导入为用户模板。

#### Scenario: 模板库展示导入按钮
- **WHEN** 用户访问 PageBuilder 首页且模板库 Tab 可见
- **THEN** 系统 SHALL 在模板库 Header 的“刷新”按钮左侧展示“导入模板”按钮

#### Scenario: 选择 zip 后上传
- **WHEN** 用户点击“导入模板”并选择一个 zip 文件
- **THEN** 系统 SHALL 调用模板 zip 导入 API
- **AND** 请求 SHALL 使用 `multipart/form-data` 上传该文件

#### Scenario: 导入期间防止重复提交
- **WHEN** 模板 zip 导入请求正在执行
- **THEN** 系统 SHALL 禁用导入入口或等效防止重复上传同一个请求
- **AND** 系统 SHALL 向用户展示导入中的状态

#### Scenario: 导入成功后刷新列表
- **WHEN** 模板 zip 导入 API 成功返回导入模板摘要
- **THEN** 系统 SHALL 刷新模板库列表或将新模板加入当前列表
- **AND** 新导入模板 SHALL 可继续执行预览、使用、重命名和删除操作

#### Scenario: 导入失败展示错误
- **WHEN** 模板 zip 导入 API 返回错误或上传失败
- **THEN** 系统 SHALL 在模板库区域展示明确错误反馈
- **AND** 系统 SHALL NOT 错误地向列表加入模板卡片

#### Scenario: 允许重复选择同一文件
- **WHEN** 一次导入请求结束后用户再次选择同一个 zip 文件
- **THEN** 系统 SHALL 能再次触发上传流程

#### Scenario: CMS 集成生产首页展示导入入口但禁用使用模板
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 展示模板库资源区和“导入模板”入口
- **AND** 系统 SHALL NOT 在首页展示“使用模板”入口
