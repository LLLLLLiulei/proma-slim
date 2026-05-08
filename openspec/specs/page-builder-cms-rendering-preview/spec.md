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

### Requirement: 浏览器 preview bootstrap 必须为 CMS 渲染根节点注入 runtime locator 元数据
系统 SHALL 在浏览器端为每个顶层 `cms-catalog` / `cms-content` island 从当前作者态源标签推导 runtime locator，并 SHALL 只在该 island 渲染结果的顶层根节点上注入该 locator 元数据，而不得把这些内部定位字段写回作者态源码。

#### Scenario: 单个 CMS island 的多个渲染根节点共享同一 locator 元数据
- **WHEN** 某个顶层 `cms-catalog` 或 `cms-content` 在 preview 中渲染出多个顶层根节点
- **THEN** 系统 SHALL 为这些根节点注入同一组 `sourceSelector`、`parentBlockSelector`、`component` 与 `htmlPath`
- **AND** 系统 SHALL 允许前端 runtime 为该组根节点派生共享的 `islandKey`

#### Scenario: runtime locator 从源标签推导而不是镜像作者态 sourceId
- **WHEN** 某个顶层 `cms-catalog` 或 `cms-content` 完成 preview 挂载
- **THEN** 系统 SHALL 基于当前源 CMS 标签和其 parent block 推导 runtime locator
- **AND** 系统 SHALL NOT 以作者态 `data-proma-cms-source-id` 作为 preview root 的正式 identity 来源

#### Scenario: preview 注解不得改写作者态源码
- **WHEN** 某个页面包含顶层 `cms-*` islands 并完成 preview 注解
- **THEN** 系统 SHALL 仅在 preview 响应注入的运行时 DOM 中暴露 locator 元数据
- **AND** 系统 SHALL NOT 将这些 runtime locator attrs 写回 `workspace-files/index.html`

### Requirement: CMS rendering preview 必须通过宿主管理的本地资产和 CMS 代理接口运行
系统 SHALL 通过宿主 page-builder 路由交付 CMS rendering preview 所需的脚本资产，并使浏览器端 island 取数通过现有 `/api/page-builder/cms/*` 代理接口或其等价宿主管理读取路径完成，而不是直接依赖第三方 CDN 或绕过宿主管理的 CMS 访问路径；当 island 使用 fixed-ids 来源时，preview MUST 走精确取数路径，而不得退化为全量加载后本地过滤。

#### Scenario: preview 页面通过本地 page-builder 资产路由获取脚本
- **WHEN** 某个包含 CMS islands 的预览页面加载其注入的 CMS rendering preview 资产
- **THEN** 系统 SHALL 从宿主提供的本地 page-builder 资产路由返回脚本内容
- **AND** 系统 SHALL 不要求页面直接访问第三方 CDN 获取 Vue 运行时或 bootstrap 资源

#### Scenario: island 运行时通过宿主管理的 CMS 代理接口取数
- **WHEN** 浏览器端某个 `cms-catalog` 或 `cms-content` island 首次取数
- **THEN** 系统 SHALL 通过宿主暴露的 `/api/page-builder/cms/*` 路由完成 CMS 数据请求
- **AND** 系统 SHALL 不要求 island 直接持有外部 CMS 的鉴权信息

#### Scenario: island 运行时按显式 site-id 或默认站点 1 取数
- **WHEN** 浏览器端某个 `cms-catalog` 或 `cms-content` island 首次取数
- **THEN** 系统 SHALL 优先使用该 island 作者态源码中的显式 `site-id`
- **AND** 当该标签缺少 `site-id` 时，系统 SHALL 按 `siteId = 1` 兼容执行
- **AND** 浏览器端缓存键 SHALL 包含 `siteId` 维度

#### Scenario: fixed-ids 来源通过受控读取路径预览而不是全量加载
- **WHEN** 浏览器端某个 `cms-catalog` 或 `cms-content` island 使用作者态 `ids` 来源
- **THEN** 系统 SHALL 对固定栏目 `ids` 只请求这些有序 `ids` 对应的栏目
- **AND** 对固定内容 `ids`，系统 SHALL 在作者态 `catalog-id` 对应的单一栏目范围内解析这些内容
- **AND** 系统 SHALL NOT 通过全量栏目树或整站内容列表加载来模拟 fixed-ids 行为
- **AND** 预览运行时 SHALL 保持输入顺序并默认丢弃失效项

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

### Requirement: CMS rendering preview 资产 URL 必须支持 public base path
系统 SHALL 让 CMS rendering preview 注入的本地 Vue runtime 和 preview bootstrap 资产 URL 使用当前 public base path，使包含 CMS islands 的预览页面在 `/pagebuilder` 挂载下仍从宿主管理路由加载运行时。

#### Scenario: base path 下注入 CMS rendering preview 资产
- **WHEN** 某个包含 CMS islands 的预览响应需要注入 CMS rendering preview 资产，且 public base path 为 `/pagebuilder`
- **THEN** 注入的 preview bootstrap URL SHALL 位于 `/pagebuilder/api/page-builder/cms-rendering-preview.js`
- **AND** 注入的 Vue runtime URL SHALL 位于 `/pagebuilder/api/page-builder/cms-rendering-vue.js`

#### Scenario: 无 base path 时 CMS rendering preview 资产 URL 保持兼容
- **WHEN** 未配置 public base path 且预览响应需要注入 CMS rendering preview 资产
- **THEN** 注入的 preview bootstrap URL SHALL 继续位于 `/api/page-builder/cms-rendering-preview.js`
- **AND** 注入的 Vue runtime URL SHALL 继续位于 `/api/page-builder/cms-rendering-vue.js`
