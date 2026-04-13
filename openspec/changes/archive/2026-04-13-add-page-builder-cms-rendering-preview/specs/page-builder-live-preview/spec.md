## MODIFIED Requirements

### Requirement: 工作区必须提供可轮询的预览状态接口
系统 SHALL 为每个工作区提供轻量预览状态查询能力，使 builder 可以在不直接重载 iframe 的情况下判断当前是否存在预览、预览内容是否发生变化，以及当前页面是否包含 CMS rendering 及其 iframe 权限需求。

#### Scenario: 存在普通预览时返回入口地址、版本和非 CMS 元数据
- **WHEN** 当前工作区存在可访问的 `workspace-files/index.html`，且该页面不包含顶层 `cms-*`
- **THEN** 系统 SHALL 返回 `hasPreview` 为真、可供 iframe 加载的 `entryUrl`，以及表示当前预览快照版本的 `revision`
- **AND** 系统 SHALL 返回 `hasCmsRendering = false`
- **AND** 系统 SHALL 返回 `requiresSameOrigin = false`

#### Scenario: 存在 CMS rendering 预览时返回显式 CMS 元数据
- **WHEN** 当前工作区存在可访问的 `workspace-files/index.html`，且该页面包含顶层 `cms-*`
- **THEN** 系统 SHALL 返回 `hasPreview` 为真、可供 iframe 加载的 `entryUrl`，以及表示当前预览快照版本的 `revision`
- **AND** 系统 SHALL 返回 `hasCmsRendering = true`
- **AND** 系统 SHALL 返回 `requiresSameOrigin = true`

#### Scenario: 不存在预览时返回空状态
- **WHEN** 当前工作区尚未生成任何可访问的预览入口
- **THEN** 系统 SHALL 返回 `hasPreview` 为假，并且不返回可继续加载旧预览的有效入口地址
- **AND** 系统 SHALL 返回 `hasCmsRendering = false`
- **AND** 系统 SHALL 返回 `requiresSameOrigin = false`

#### Scenario: 预览文件变化时状态版本变化
- **WHEN** 当前工作区 `workspace-files` 中参与预览的文件被创建、修改、删除或替换
- **THEN** 系统 SHALL 使后续预览状态查询返回不同于先前值的 `revision`

### Requirement: Builder 页面必须基于预览状态驱动左侧 iframe
系统 SHALL 在 builder 页面中基于当前工作区的预览状态决定左侧显示真实页面还是空状态，并让预览加载指向当前工作区的真实入口；当预览状态要求更宽的同源权限时，builder SHALL 基于该显式元数据调整 iframe sandbox，而不是自行猜测页面内容。

#### Scenario: 存在普通预览时以受限 sandbox 加载真实页面
- **WHEN** builder 页面获取到当前工作区 `hasPreview` 为真，且 `requiresSameOrigin = false`
- **THEN** 系统 SHALL 在左侧预览面板中加载该工作区的真实 `entryUrl`
- **AND** 系统 SHALL 为 iframe 使用不含 `allow-same-origin` 的受限 sandbox

#### Scenario: 存在 CMS rendering 预览时追加 `allow-same-origin`
- **WHEN** builder 页面获取到当前工作区 `hasPreview` 为真，且 `requiresSameOrigin = true`
- **THEN** 系统 SHALL 在左侧预览面板中加载该工作区的真实 `entryUrl`
- **AND** 系统 SHALL 为 iframe sandbox 追加 `allow-same-origin`

#### Scenario: 不存在预览时显示空状态
- **WHEN** builder 页面获取到当前工作区 `hasPreview` 为假的预览状态
- **THEN** 系统 SHALL 在左侧预览面板中显示“预览尚未生成”的空状态
- **AND** 系统 SHALL 不继续显示过期页面

#### Scenario: 新窗口打开使用当前工作区预览入口
- **WHEN** 用户在 builder 左侧点击“新窗口打开”
- **THEN** 系统 SHALL 打开当前工作区最新的预览入口地址
- **AND** 系统 SHALL 不打开固定占位地址或旧 revision 地址
