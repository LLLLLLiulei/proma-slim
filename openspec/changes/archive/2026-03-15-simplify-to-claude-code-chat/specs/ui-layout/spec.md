## ADDED Requirements

### Requirement: 双面板布局
系统 SHALL 提供双面板 Web 界面：左侧会话列表侧边栏 + 右侧对话区域。

#### Scenario: 基础布局
- **WHEN** 用户在浏览器中访问应用
- **THEN** 系统 SHALL 展示左侧会话列表侧边栏和右侧对话主区域

#### Scenario: 空状态
- **WHEN** 用户首次打开应用或无任何会话时
- **THEN** 系统 SHALL 在对话区域展示欢迎提示和"新建会话"引导

#### Scenario: 侧边栏流式指示
- **WHEN** 某个会话正在流式输出
- **THEN** 系统 SHALL 在侧边栏对应会话条目上展示加载指示器

### Requirement: 顶部会话页签条
系统 SHALL 在对话区域顶部提供轻量会话页签条，用于展示和切换当前已打开的多个会话。

#### Scenario: 打开多个会话页签
- **WHEN** 用户先后从侧边栏打开多个会话
- **THEN** 系统 SHALL 在顶部保留这些已打开会话的页签，而不是每次只保留一个

#### Scenario: 切换已打开的会话页签
- **WHEN** 用户点击顶部某个已打开会话页签
- **THEN** 系统 SHALL 切换右侧对话区域到该页签对应的会话内容

### Requirement: 主题切换
系统 SHALL 支持 light/dark 主题切换，使用 CSS 变量实现。

#### Scenario: 手动切换
- **WHEN** 用户在设置中切换主题
- **THEN** 系统 SHALL 立即切换 light/dark 模式，持久化到 localStorage

#### Scenario: 系统主题跟随
- **WHEN** 用户选择"跟随系统"主题
- **THEN** 系统 SHALL 监听 `prefers-color-scheme` 媒体查询，自动跟随系统主题变化
