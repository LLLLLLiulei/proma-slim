## ADDED Requirements

### Requirement: `cms-binding-apply` MUST remain isolated to confirmed CMS apply control
系统 SHALL 将 `cms-binding-apply` 继续限定为 confirmed CMS selection 之后的 apply controller，而不得把该 skill 重新扩展成 ordinary 既有 CMS 区域修改的默认认知入口；其主文案和 references MUST 继续服务于 Phase 1A decision/apply，而不是承担普通 CMS region literacy。

#### Scenario: ordinary 既有 CMS 区域修改不默认加载 `cms-binding-apply`
- **WHEN** 当前请求只是 ordinary flow 中对已有 `cms-catalog` / `cms-content` 区域的普通修改，且尚未拥有确认完成的 CMS selection handoff
- **THEN** 系统 SHALL NOT 把 `cms-binding-apply` 作为该次请求的默认 guidance controller
- **AND** 系统 SHALL 让 confirmed apply skill 继续只在确认后的 CMS apply 场景中出现

#### Scenario: `cms-binding-apply` 的文案继续只聚焦 confirmed apply 协议
- **WHEN** 系统维护 `cms-binding-apply` 的主文案和 references
- **THEN** 这些内容 SHALL 继续围绕输入前提、三态决策、same-turn `decide -> apply` 和 confirmed apply contract 组织
- **AND** 这些内容 SHALL NOT 吸收 ordinary 已有 CMS 区域修改所需的通用组件级 guidance
