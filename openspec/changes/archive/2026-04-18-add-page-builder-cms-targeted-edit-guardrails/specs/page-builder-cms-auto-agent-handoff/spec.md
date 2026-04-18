## ADDED Requirements

### Requirement: CMS 自动 handoff payload 必须继承稳定 source identity 和 targeted edit guardrails
系统 SHALL 在为 `cms-island` 目标构建自动 handoff payload 时，继承与普通选区消息一致的稳定 source identity 和 source-first targeted edit guardrails，而不得只传轻量 selector 语义。

#### Scenario: 自动 handoff 为 CMS island 保留稳定 `sourceId`
- **WHEN** 系统为某个 `cms-island` 目标构建自动 handoff payload，且该目标存在稳定 `sourceId`
- **THEN** payload SHALL 保留该 `sourceId`
- **AND** payload SHALL 继续保留源 CMS 标签 selector、所属 `parentBlockSelector`、组件类型和 `editBoundary: source-atomic`

#### Scenario: 自动 handoff 明确声明不得越界改写
- **WHEN** 系统为某个 `cms-island` 目标发送自动 handoff
- **THEN** payload SHALL 明确要求后续写入只能围绕当前 source target 进行
- **AND** payload SHALL 明确禁止修改 sibling block 或在当前目标旁边追加新的 `cms-*` 组件
- **AND** payload SHALL 明确禁止把渲染态子节点当作独立源码目标写回

#### Scenario: 自动 handoff 明确禁止 CMS slot 危险标签
- **WHEN** 系统为某个 `cms-island` 目标发送自动 handoff
- **THEN** payload SHALL 明确禁止在 `cms-catalog` / `cms-content` 的 slot 中写入 `<script>` 或 `<style>`

### Requirement: 旧页面的 CMS island handoff 必须保持兼容 fallback 且不改变目标类型
系统 SHALL 对来自旧页面、暂时缺少稳定 `sourceId` 的 `cms-island` 目标保持兼容 handoff；该兼容模式 MUST 继续维持 `cms-island` 语义，而不得将其静默改造成普通 block handoff。

#### Scenario: 缺少 `sourceId` 的旧 CMS island 继续作为 `cms-island` handoff
- **WHEN** 系统为某个暂时缺少 `sourceId` 的旧 `cms-island` 目标构建自动 handoff
- **THEN** payload SHALL 继续保留 `kind: cms-island`
- **AND** payload SHALL 继续保留源 CMS 标签 selector、所属 `parentBlockSelector` 与 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 因 `sourceId` 缺失而把该 handoff 退化为普通 block handoff
