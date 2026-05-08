## ADDED Requirements

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
