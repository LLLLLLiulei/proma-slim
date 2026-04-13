## Purpose
定义 `page-builder` 预览链路在页面包含 `cms-catalog` 与 `cms-content` islands 时，如何注入本地 CMS rendering 资产、协调浏览器端 island 挂载，以及通过宿主管理的 CMS 代理接口完成运行时取数。

## Requirements

### Requirement: 包含 CMS islands 的预览响应必须注入本地托管的 CMS rendering 资产
系统 SHALL 在 page-builder 工作区预览响应中通过 DOM 解析检测顶层 `cms-catalog` 与 `cms-content` 节点；当检测到 CMS islands 时，系统 SHALL 在不改写工作区源 HTML 的前提下注入 CMS rendering 运行时配置、本地托管的 Vue full build 资产和 CMS rendering preview bootstrap 资产。

#### Scenario: 页面包含顶层 `cms-*` 节点时注入 preview 资产
- **WHEN** 某个 page-builder 工作区的 `workspace-files/index.html` 包含顶层 `cms-catalog` 或 `cms-content`
- **THEN** 预览响应 SHALL 注入 CMS rendering 运行时配置与本地 preview 资产
- **AND** 系统 SHALL 不直接改写 `workspace-files/index.html` 源文件内容

#### Scenario: 注释或普通文本中的 `cms-*` 示例不触发注入
- **WHEN** 某个预览页面仅在注释、代码片段或普通文本中出现 `<cms-content>` 字样，但 DOM 中不存在真实 `cms-*` 元素
- **THEN** 系统 SHALL 将该页面视为不包含 CMS islands
- **AND** 系统 SHALL NOT 为其注入 CMS rendering preview 资产

### Requirement: CMS rendering 预览 HTML 变换必须遵守稳定顺序
系统 SHALL 在 page-builder 预览响应中，以稳定顺序编排 CMS 相关 HTML 变换：先重写 CMS 资源 URL，再注入 CMS rendering preview 资产，最后再注入 page-builder preview bridge。

#### Scenario: 页面同时包含 CMS 资源引用和 CMS islands 时按顺序变换
- **WHEN** 某个 page-builder 预览 HTML 同时包含需要代理化的 CMS 资源 URL 与顶层 `cms-*` 节点，且请求启用了 page-builder bridge
- **THEN** 系统 SHALL 先完成 CMS 资源 URL 重写
- **AND** 系统 SHALL 再注入 CMS rendering preview 资产
- **AND** 系统 SHALL 最后注入 preview bridge 资产

### Requirement: 浏览器 preview bootstrap 必须为每个顶层 CMS island 独立挂载并协调总体 ready
系统 SHALL 在浏览器端仅扫描顶层 `cms-catalog` 与 `cms-content` 节点，并为每个 island 独立创建 Vue app 进行挂载；所有 island 的首次挂载完成或失败后，系统 SHALL 统一派发 `proma:cms-rendering-ready` 事件。

#### Scenario: 多个顶层 islands 完成首次挂载后发出 ready
- **WHEN** 某个预览页面包含多个顶层 `cms-*` islands，且浏览器端 bootstrap 已启动
- **THEN** 系统 SHALL 为每个顶层 island 独立挂载共享 CMS 组件
- **AND** 系统 SHALL 在所有 islands 首次挂载完成后派发一次 `proma:cms-rendering-ready`

#### Scenario: 单个 island 挂载失败时不阻塞整页 ready
- **WHEN** 某个预览页面包含多个顶层 `cms-*` islands，且其中一个 island 在首次挂载过程中抛出运行时错误
- **THEN** 系统 SHALL 记录该 island 的失败
- **AND** 系统 SHALL 继续推进其余 islands 的 ready 协调
- **AND** 系统 SHALL 在全部 islands 完成或失败后仍然派发 `proma:cms-rendering-ready`

#### Scenario: 嵌套 `cms-*` 节点只由最外层 island 负责挂载
- **WHEN** 作者模板在某个 `cms-*` 节点内部又出现另一个 `cms-*` 节点
- **THEN** 浏览器端 bootstrap SHALL 仅将最外层 `cms-*` 识别为独立 island
- **AND** 系统 SHALL NOT 为内层嵌套 `cms-*` 再单独创建第二个独立 app

### Requirement: CMS rendering preview 必须通过宿主管理的本地资产和 CMS 代理接口运行
系统 SHALL 通过宿主 page-builder 路由交付 CMS rendering preview 所需的脚本资产，并使浏览器端 island 取数通过现有 `/api/page-builder/cms/*` 代理接口完成，而不是直接依赖第三方 CDN 或绕过宿主管理的 CMS 访问路径。

#### Scenario: preview 页面通过本地 page-builder 资产路由获取脚本
- **WHEN** 某个包含 CMS islands 的预览页面加载其注入的 CMS rendering preview 资产
- **THEN** 系统 SHALL 从宿主提供的本地 page-builder 资产路由返回脚本内容
- **AND** 系统 SHALL 不要求页面直接访问第三方 CDN 获取 Vue 运行时或 bootstrap 资源

#### Scenario: island 运行时通过宿主管理的 CMS 代理接口取数
- **WHEN** 浏览器端某个 `cms-catalog` 或 `cms-content` island 首次取数
- **THEN** 系统 SHALL 通过宿主暴露的 `/api/page-builder/cms/*` 路由完成 CMS 数据请求
- **AND** 系统 SHALL 不要求 island 直接持有外部 CMS 的鉴权信息
