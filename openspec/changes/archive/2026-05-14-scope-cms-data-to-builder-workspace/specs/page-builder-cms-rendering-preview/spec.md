## MODIFIED Requirements

### Requirement: CMS rendering preview 必须通过宿主管理的本地资产和 CMS 代理接口运行
系统 SHALL 通过宿主 page-builder 路由交付 CMS rendering preview 所需的脚本资产，并使 workspace preview 中的浏览器端 island 取数通过 workspace-scoped `/api/workspaces/:workspaceId/page-builder/cms/*` 宿主管理读取路径完成，而不是直接依赖第三方 CDN、旧全局 CMS browser API 或绕过宿主管理的 CMS 访问路径；当 island 使用 fixed-ids 来源时，preview MUST 走精确取数路径，而不得退化为全量加载后本地过滤。

#### Scenario: preview 页面通过本地 page-builder 资产路由获取脚本
- **WHEN** 某个包含 CMS islands 的预览页面加载其注入的 CMS rendering preview 资产
- **THEN** 系统 SHALL 从宿主提供的本地 page-builder 资产路由返回脚本内容
- **AND** 系统 SHALL 不要求页面直接访问第三方 CDN 获取 Vue 运行时或 bootstrap 资源

#### Scenario: workspace preview island 运行时通过 workspace-scoped CMS 代理接口取数
- **WHEN** 某个 workspace preview 响应注入 CMS rendering preview runtime
- **THEN** 注入的 `cmsProxyBase` SHALL 指向 `/api/workspaces/:workspaceId/page-builder/cms` 或带 public base path 的等价路径
- **AND** 浏览器端 island SHALL 通过该 workspace-scoped 代理路径请求栏目和内容数据
- **AND** 系统 SHALL NOT 注入无 workspace 上下文的 `/api/page-builder/cms` 作为 workspace preview runtime 的 `cmsProxyBase`
- **AND** 系统 SHALL 不要求 island 直接持有外部 CMS 的鉴权信息

#### Scenario: island 运行时按显式 site-id 或默认站点取数
- **WHEN** 浏览器端某个 `cms-catalog` 或 `cms-content` island 首次取数
- **THEN** 系统 SHALL 优先使用该 island 作者态源码中的显式 `site-id`
- **AND** 当该标签缺少 `site-id` 时，系统 SHALL 按既有默认站点语义兼容执行
- **AND** CMS 集成模式下服务端 workspace-scoped CMS API SHALL 以 project binding `siteId` 作为最终上限
- **AND** 浏览器端缓存键 SHALL 包含 `siteId` 维度

#### Scenario: fixed-ids 来源通过受控读取路径预览而不是全量加载
- **WHEN** 浏览器端某个 `cms-catalog` 或 `cms-content` island 使用作者态 `ids` 来源
- **THEN** 系统 SHALL 对固定栏目 `ids` 只请求这些有序 `ids` 对应的栏目
- **AND** 对固定内容 `ids`，系统 SHALL 在作者态 `catalog-id` 对应的单一栏目范围内解析这些内容
- **AND** 系统 SHALL NOT 通过全量栏目树或整站内容列表加载来模拟 fixed-ids 行为
- **AND** 预览运行时 SHALL 保持输入顺序并默认丢弃失效项
