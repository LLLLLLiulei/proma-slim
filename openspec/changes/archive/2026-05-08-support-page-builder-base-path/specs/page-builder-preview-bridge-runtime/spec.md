## ADDED Requirements

### Requirement: Preview bridge 资产 URL 必须支持 public base path
系统 SHALL 让宿主注入到预览 HTML 的 preview bridge 单资产 URL 使用当前 public base path，同时保持 bridge 仍由宿主管理的单个资产路由交付。

#### Scenario: base path 下注入 bridge 资产
- **WHEN** 某个 PageBuilder 预览响应启用了 preview bridge 注入，且 public base path 为 `/pagebuilder`
- **THEN** 注入的 bridge `<script>` URL SHALL 位于 `/pagebuilder/api/page-builder/preview-bridge.js`
- **AND** 浏览器 SHALL NOT 请求 CMS 根路径 `/api/page-builder/preview-bridge.js`

#### Scenario: 无 base path 时 bridge 资产 URL 保持兼容
- **WHEN** 未配置 public base path 且预览响应启用了 preview bridge 注入
- **THEN** 注入的 bridge `<script>` URL SHALL 继续位于 `/api/page-builder/preview-bridge.js`
