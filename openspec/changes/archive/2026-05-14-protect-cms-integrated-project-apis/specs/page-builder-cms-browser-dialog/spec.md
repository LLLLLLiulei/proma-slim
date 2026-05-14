## ADDED Requirements

### Requirement: CMS 集成模式 CMS 浏览弹框不得使用旧全局 CMS browser API
系统 SHALL 在 CMS 集成模式下阻止 CMS 浏览弹框继续使用旧全局 `/api/page-builder/cms/*` 数据读取和资产代理入口；在 workspace-scoped CMS 数据路由完成前，弹框可以显示不可用或错误状态，但不得通过旧全局接口匿名读取 CMS 数据。

#### Scenario: CMS 模式打开 CMS 浏览弹框时不调用旧全局接口
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且用户在 Builder 中打开 CMS 浏览弹框
- **THEN** 系统 SHALL NOT 使用 `/api/page-builder/cms/sites`、`/api/page-builder/cms/catalogs`、`/api/page-builder/cms/contents` 或 `/api/page-builder/cms/assets`
- **AND** 系统 SHALL NOT 通过无 workspace 上下文的旧全局接口读取 CMS 站点、栏目、内容或资产

#### Scenario: CMS 模式 workspace-scoped CMS 数据路由完成前弹框可展示不可用状态
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 workspace-scoped CMS 数据路由尚未提供
- **THEN** CMS 浏览弹框 SHALL 展示明确的暂不可用或读取失败提示
- **AND** 系统 SHALL 保持 Builder 其他已受保护项目 API 的访问控制不受影响

#### Scenario: standalone 模式 CMS 浏览弹框继续使用旧全局读取链路
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且用户打开 CMS 浏览弹框
- **THEN** 系统 SHALL 继续按现有 standalone CMS browser 读取链路加载站点、栏目、内容和资产
