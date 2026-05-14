## MODIFIED Requirements

### Requirement: CMS 集成模式 CMS 浏览弹框不得使用旧全局 CMS browser API
系统 SHALL 在 CMS 集成模式下阻止 CMS 浏览弹框继续使用旧全局 `/api/page-builder/cms/*` 数据读取和资产代理入口；弹框必须使用当前 Builder workspace 对应的 workspace-scoped CMS API 加载 CMS 站点、栏目、内容和资产。

#### Scenario: CMS 模式打开 CMS 浏览弹框时不调用旧全局接口
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且用户在 Builder 中打开 CMS 浏览弹框
- **THEN** 系统 SHALL NOT 使用 `/api/page-builder/cms/sites`、`/api/page-builder/cms/catalogs`、`/api/page-builder/cms/contents` 或 `/api/page-builder/cms/assets`
- **AND** 系统 SHALL NOT 通过无 workspace 上下文的旧全局接口读取 CMS 站点、栏目、内容或资产

#### Scenario: CMS 模式 CMS 浏览弹框使用 workspace-scoped CMS API
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且用户在 Builder 中打开 CMS 浏览弹框
- **THEN** 系统 SHALL 使用 `/api/workspaces/:workspaceId/page-builder/cms/sites`、`/catalogs`、`/contents` 和 `/assets` 读取 CMS 数据和图片
- **AND** 请求中的 `workspaceId` SHALL 来自当前 Builder 页面上下文
- **AND** 系统 SHALL 依赖同源 `ai_page_builder_access` Cookie 完成访问校验

#### Scenario: CMS 模式 CMS 浏览弹框只展示绑定站点范围内数据
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 CMS 浏览弹框加载站点、栏目或内容
- **THEN** 弹框 SHALL 只展示当前 project binding `siteId` 范围内的数据
- **AND** 弹框 SHALL NOT 提供切换到其他 CMS 站点并读取数据的能力

#### Scenario: standalone 模式 CMS 浏览弹框继续使用旧全局读取链路
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且用户打开 CMS 浏览弹框
- **THEN** 系统 SHALL 继续按现有 standalone CMS browser 读取链路加载站点、栏目、内容和资产
