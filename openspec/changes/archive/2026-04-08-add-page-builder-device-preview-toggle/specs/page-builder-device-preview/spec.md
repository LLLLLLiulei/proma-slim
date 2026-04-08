## ADDED Requirements

### Requirement: Builder 预览面板必须支持 PC 与 Mobile 设备模式切换
系统 SHALL 在 `page-builder` Builder 左侧预览面板中提供项目级设备模式切换入口，使用户可以在不离开当前 Builder 工作台的情况下切换 `PC` 与 `Mobile` 两种预览模式。

#### Scenario: 初次进入 Builder 时默认使用 PC 模式
- **WHEN** 用户首次进入某个 `page-builder` 项目的 Builder 页面，且左侧预览面板完成渲染
- **THEN** 系统 SHALL 默认以 `PC` 模式展示当前工作区预览
- **AND** 系统 SHALL 在预览控制区中标识当前处于 `PC` 模式

#### Scenario: 用户切换到 Mobile 模式
- **WHEN** 用户点击左侧预览面板中的 `Mobile` 设备模式切换入口
- **THEN** 系统 SHALL 将当前预览切换为 `Mobile` 模式
- **AND** 系统 SHALL 继续展示同一个工作区的当前预览内容，而不是跳转到新的页面、路由或会话

#### Scenario: 用户从 Mobile 切回 PC 模式
- **WHEN** 用户当前处于 `Mobile` 模式，并点击左侧预览面板中的 `PC` 设备模式切换入口
- **THEN** 系统 SHALL 将当前预览切回 `PC` 模式
- **AND** 系统 SHALL 继续围绕当前工作区的同一份预览内容工作

### Requirement: Mobile 模式必须以真实移动端视口展示预览
系统 SHALL 在 `Mobile` 模式下使用真实移动端宽度的预览视口来承载 iframe，使页面按照移动端宽度重新布局，而不是仅对桌面预览做视觉缩放模拟。

#### Scenario: 预览空间充足时使用 390px 移动端视口
- **WHEN** 左侧预览面板的可用宽度大于或等于 `390px`
- **THEN** 系统 SHALL 在 `Mobile` 模式下使用一个居中的 `390px` 宽预览视口承载当前 iframe
- **AND** 该 iframe 中的页面 SHALL 按该移动端视口宽度重新排版

#### Scenario: 预览空间不足时向可用宽度收敛
- **WHEN** 左侧预览面板的可用宽度小于 `390px`
- **THEN** 系统 SHALL 使 `Mobile` 预览视口收敛到当前可用宽度
- **AND** 系统 SHALL 不因为仍强制保持 `390px` 宽度而引入额外的横向裁切或不可访问区域

### Requirement: 设备模式切换后必须保持预览区块交互可用
系统 SHALL 在 `PC` 与 `Mobile` 模式之间切换时，继续保持当前预览中的区块级交互和项目级预览操作可用。

#### Scenario: 切换设备模式后已选区块工具条继续锚定当前区块
- **WHEN** 用户已经在左侧预览中选中某个区块，并在该区块附近显示了区块工具条后切换设备模式
- **THEN** 系统 SHALL 根据切换后的预览视口位置更新该工具条的锚定位置
- **AND** 系统 SHALL 不继续保留与当前区块脱节的旧工具条位置

#### Scenario: 切换设备模式后现有项目级预览操作仍可使用
- **WHEN** 用户切换当前预览设备模式
- **THEN** 系统 SHALL 继续允许用户在同一预览面板中使用刷新、全屏、新窗口打开和导出静态包等项目级操作
- **AND** 系统 SHALL 不要求用户重新生成页面或离开 Builder 页面才能继续这些操作
