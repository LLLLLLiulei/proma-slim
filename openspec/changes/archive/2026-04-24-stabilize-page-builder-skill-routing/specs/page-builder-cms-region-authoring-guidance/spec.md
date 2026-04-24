## MODIFIED Requirements

### Requirement: Existing CMS region edits MUST use dedicated consult-only authoring guidance
系统 SHALL 将 `page-builder-cms-region-authoring-guidance` 作为 explicit existing `cms-catalog`、`cms-content` 或 `cms-island` target edit 的专用 consult-only capability；只有当宿主已经识别当前 ordinary request 明确命中已有 CMS target 时，系统才 SHALL 为该次请求显式 surface 该 capability，并把它提供给当前 owner `page-builder-guided-generation` 参考。该 capability SHALL 由宿主通过 prompt surfacing 明确激活，而不得仅依赖 workspace 中存在对应 skill 文件；当当前页面只是包含 CMS 区域但本轮未命中具体 target 时，系统 SHALL NOT 激活该 capability；confirmed CMS apply 仍 SHALL 继续由 `cms-binding-apply` 负责。

#### Scenario: 显式命中已有 CMS 区域时加载 consult-only guidance
- **WHEN** 当前 ordinary page-builder 请求明确命中一个已存在的 `cms-catalog`、`cms-content` 或 `cms-island`
- **THEN** 系统 SHALL 为该次请求显式 surface `page-builder-cms-region-authoring-guidance`
- **AND** 系统 SHALL 让 `page-builder-guided-generation` 保持该次请求的唯一 owner
- **AND** 系统 SHALL NOT 将 `page-builder-cms-region-authoring-guidance` 升级为并列 owner 或替代 owner

#### Scenario: 页面仅含 CMS 但未命中 target 时不激活专用 guidance capability
- **WHEN** 当前页面已经包含已有 CMS 区域，但本轮请求没有明确命中某个具体已有 CMS target
- **THEN** 系统 SHALL NOT 仅因页面存在 CMS 区域就激活 `page-builder-cms-region-authoring-guidance`
- **AND** 系统 SHALL 将该次请求留在 ordinary owner 的 advisory 边界下处理

#### Scenario: 宿主显式激活专用 guidance 而不是被动等待模型发现
- **WHEN** 系统为一次 explicit existing CMS target edit 准备该 capability
- **THEN** 系统 SHALL 通过宿主控制的 prompt surfacing 机制显式激活该 capability
- **AND** 系统 SHALL NOT 将“skill 已复制到 workspace”视为本轮 guidance 已稳定可见的充分条件

#### Scenario: confirmed CMS apply 不由普通 CMS region guidance 接管
- **WHEN** 当前 workflow 已经拥有确认完成的 CMS selection 并进入正式 apply 路径
- **THEN** 系统 SHALL 继续由 `cms-binding-apply` 承担该次 confirmed apply controller
- **AND** 系统 SHALL NOT 让已有 CMS 区域 guidance capability 替代 `cms-binding-apply` 的正式 apply 职责
