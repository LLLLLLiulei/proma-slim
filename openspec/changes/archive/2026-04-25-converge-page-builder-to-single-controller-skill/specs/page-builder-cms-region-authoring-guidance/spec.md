## MODIFIED Requirements

### Requirement: Existing CMS region edits MUST use a dedicated authoring guidance capability
系统 SHALL 为 page-builder 中“已有 `cms-catalog` / `cms-content` 区域的普通修改”提供一个 consult-only 的专用 guidance capability，使模型在修改已有 CMS source tag 前先进入正确的 ordinary CMS authoring 语境；该 capability SHALL 被 `page-builder-guided-generation` consult，而不是替代 ordinary controller 接管普通用户交互或 confirmed CMS apply。

#### Scenario: 命中已有 CMS 区域时以 consult-only specialist 形式加载 guidance capability
- **WHEN** 当前 ordinary page-builder 请求明确命中一个已存在的 `cms-catalog`、`cms-content` 或 `cms-island`
- **THEN** 系统 SHALL 为该次请求 surfacing `page-builder-cms-region-authoring-guidance` 作为 consult-only specialist
- **AND** 系统 SHALL 保留 `page-builder-guided-generation` 作为该 ordinary turn 的主控 owner
- **AND** 系统 SHALL NOT 仅依赖 `page-builder-guided-generation` 的默认文案承担组件级 CMS authoring 细则

#### Scenario: 宿主显式 surfacing guidance 而不是被动等待模型发现
- **WHEN** 系统为一次 ordinary 既有 CMS 区域修改准备该 guidance capability
- **THEN** 系统 SHALL 通过宿主控制的 prompt surfacing 机制显式提供该 capability
- **AND** 系统 SHALL NOT 将“skill 已复制到 workspace”视为本轮 guidance 已稳定生效的充分条件

#### Scenario: confirmed CMS apply 不由普通 CMS region guidance 接管
- **WHEN** 当前 workflow 已经拥有确认完成的 CMS selection 并进入正式 apply 路径
- **THEN** 系统 SHALL 继续由 `cms-binding-apply` 承担该次 confirmed apply controller
- **AND** 系统 SHALL NOT 让已有 CMS 区域 guidance capability 替代 `cms-binding-apply` 的正式 apply 职责

### Requirement: Existing CMS region guidance MUST define a canonical reading order before editing
系统 SHALL 要求模型在修改已有 CMS 区域前按统一顺序理解当前 authoring contract：先读取全局稳定边界，再读取当前目标对应的最小 digest，再按需读取已有 CMS 区域 guidance；只有在场景升级为 confirmed apply 时，系统才 SHALL 让模型继续进入 `cms-binding-apply` 与 MCP tool protocol。该阅读顺序 MUST 适配当前“主控 skill + consult guidance”的分层，而不得假设一定存在可靠的嵌套 skill 调用栈。

#### Scenario: 普通已有 CMS 区域修改先读最小 digest 再读 guidance
- **WHEN** 模型准备修改一个 ordinary flow 下命中的已有 CMS 区域
- **THEN** 系统 SHALL 先向该次请求提供当前目标的最小 component-aware digest
- **AND** 系统 SHALL 要求模型优先依据该 digest 理解当前组件、边界和可用 authoring surface
- **AND** 当 digest 仍不足以支持安全修改时，系统 SHALL 再让模型读取已有 CMS 区域 guidance capability

#### Scenario: 当前分层不依赖可靠嵌套 skill 调用栈
- **WHEN** 宿主为 ordinary existing CMS region edit 准备 guidance
- **THEN** 系统 SHALL 让该 guidance 可以通过显式 surfacing 或 bootstrap 被直接消费
- **AND** 系统 SHALL NOT 要求当前实现必须依赖一个可靠的“skill A 稳定再调 skill B”的嵌套调用栈才能生效

#### Scenario: confirmed apply 场景的工具协议不作为 ordinary CMS 编辑的默认第一入口
- **WHEN** 当前请求仍属于已有 CMS 区域的 ordinary 修改，而不是 confirmed CMS selection 之后的 apply
- **THEN** 系统 SHALL NOT 要求模型先从 `mcp__cms__decide_cms_binding` / `mcp__cms__apply_cms_binding` 的工具协议开始理解当前 CMS 区域
- **AND** 系统 SHALL 将 MCP tool guidance 保留给正式 confirmed apply 场景
