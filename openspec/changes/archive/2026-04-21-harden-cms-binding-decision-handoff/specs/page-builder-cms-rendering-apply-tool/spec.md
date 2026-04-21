## MODIFIED Requirements

### Requirement: `apply_cms_binding` 工具必须通过统一 HTML mutation pipeline 执行 selection 级 CMS 绑定写入
系统 SHALL 在 `apps/app` 层提供正式的 `apply_cms_binding` 工具，使 page-builder 会话能够基于有效 `decisionId` 与模板片段将 CMS binding 写入当前目标，并且 MUST 通过统一的 page-builder HTML mutation pipeline 完成写回，而不得绕过该 pipeline 手动分别维护 manifest、validator 或 preview state。该工具 SHALL 从宿主持久化的 apply plan 中解析正式 `targetSelection`、组件类型与归一化 source props，而 MUST NOT 把 caller 直接传入的裸 `targetSelection`、`kind` 或 raw source 字段视为正式写入 authority。

#### Scenario: 将栏目导航绑定写入普通 block 目标
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`，提供某个指向 block-target `catalog-nav` 绑定的有效 `decisionId` 和模板片段
- **THEN** 系统 SHALL 从该 `decisionId` 对应的宿主 apply plan 中解析正式 `targetSelection` 与 source props
- **AND** 系统 SHALL 仅替换该目标 block 的内部 HTML 为生成的 `cms-catalog` 标记
- **AND** 系统 SHALL 通过统一 HTML mutation pipeline 写回 `workspace-files/index.html`
- **AND** 成功结果 SHALL 基于最新 HTML 返回 manifest、validation 和 preview state 摘要

#### Scenario: 将内容列表重绑到选中的 CMS island
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`，提供某个指向 `cms-island` `content-list` 绑定的有效 `decisionId` 和模板片段
- **THEN** 系统 SHALL 从该 `decisionId` 对应的宿主 apply plan 中解析 `sourceSelector`、`parentBlockSelector`、`component` 与 `htmlPath`
- **AND** 系统 SHALL 仅替换该 locator 唯一命中的源 CMS 标签为新的 `cms-content` 标记
- **AND** 系统 SHALL NOT 替换该 CMS 标签所在的整个 parent block
- **AND** 系统 SHALL NOT 删除或覆盖同一 parent block 中的静态兄弟节点

#### Scenario: 将栏目导航重绑到选中的 CMS island
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`，提供某个指向 `cms-island` `catalog-nav` 绑定的有效 `decisionId` 和模板片段
- **THEN** 系统 SHALL 从该 `decisionId` 对应的宿主 apply plan 中解析 `sourceSelector`、`parentBlockSelector`、`component` 与 `htmlPath`
- **AND** 系统 SHALL 仅替换该 locator 唯一命中的源 CMS 标签为新的 `cms-catalog` 标记
- **AND** 系统 SHALL 保留该 CMS 标签周围的静态结构不变

### Requirement: `apply_cms_binding` 工具必须维护稳定的目标选择器与写入护栏
系统 SHALL 通过 `decisionId` 绑定的宿主 apply plan 维护正式 apply 的目标 identity 与写入护栏。对于 block 目标，系统 SHALL 继续使用 apply plan 中的 `targetSelection.selector` 作为事实定位入口，并在 block 目标首次成功绑定时继续为目标容器建立稳定的 `data-proma-block-id`；当目标是 `cms-island` 时，系统 MUST 以 apply plan 中 runtime locator 的 `sourceSelector` 进行唯一定位，并 SHALL 使用 `parentBlockSelector`、`component` 与 `htmlPath` 做一致性校验；当 `decisionId` 缺失、已失效、与当前作者态上下文冲突，或 caller 试图提供与 apply plan 不一致的 raw binding identity 字段时，系统 MUST 拒绝写入并返回稳定错误。

#### Scenario: block 目标已有 block-id 时保持稳定
- **WHEN** 某个有效 `decisionId` 解析出的 `targetSelection.kind` 为 `block`，且目标 block 已经包含 `data-proma-block-id`
- **THEN** 系统 SHALL 在本次 apply 后保留原有 `data-proma-block-id`
- **AND** manifest 与返回结果 SHALL 继续使用该稳定 blockId

#### Scenario: block 目标缺少 block-id 时自动补写
- **WHEN** 某个有效 `decisionId` 解析出的 `targetSelection.kind` 为 `block`，且目标 block 被 apply plan 中的 `targetSelection.selector` 唯一命中，但尚未包含 `data-proma-block-id`
- **THEN** 系统 SHALL 为该容器生成新的 `pb_blk_` 前缀稳定标识并写入外层容器
- **AND** 该 blockId SHALL 出现在 manifest 与工具返回结果中

#### Scenario: cms-island 目标按 runtime locator 解析唯一源标签
- **WHEN** 某个有效 `decisionId` 解析出的 `targetSelection.kind` 为 `cms-island`，且其 runtime locator 在当前作者态 HTML 中唯一命中某个源 CMS 标签
- **THEN** 系统 SHALL 仅围绕该源 CMS 标签执行本次 apply
- **AND** 系统 SHALL 使用 `parentBlockSelector` 校验该源标签仍属于当前所选 parent block
- **AND** 系统 SHALL NOT 继续要求该目标在作者态源码中持有 `sourceId`

#### Scenario: 缺少、失效、冲突或越权的 decision 输入会被拒绝
- **WHEN** 调用方缺少 `decisionId`、使用失效或冲突的 `decisionId`，或在 `decisionId` 之外提供与宿主 apply plan 不一致的 `targetSelection`、`kind`、source props 或等价 binding identity 字段
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 写回任何部分修改
- **AND** 系统 SHALL NOT 回退到旧 `sourceId`、parent block、裸 caller 输入或结构相似的其他目标

### Requirement: `apply_cms_binding` 工具必须按 decision-backed structure guardrails 校验模板形状
系统 SHALL 在正式 apply 前读取 `decisionId` 关联 apply plan 中的结构 guardrails，并据此校验 `templateBody` / `emptyTemplate` / `errorTemplate` 是否与当前壳层策略兼容。对于“保留外层壳层”的计划，正式 apply MUST 拒绝在 slot 中再次生成竞争性的 major grid/list/nav 容器；对于 source-atomic whole-component replacement 的计划，系统 SHALL 允许 slot 承载完整动态区域。

#### Scenario: Preserved block shell rejects a duplicate major container inside the slot
- **WHEN** 某个有效 `decisionId` 对应的 apply plan 表示当前 block target 应保留外层壳层，且 major container owner 仍在 shell
- **AND** 调用方提供的 `templateBody` 又在 slot 中生成一个竞争性的主 grid/list/nav 容器
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL 返回稳定、可恢复的结构错误
- **AND** 错误信息 SHALL 指出应改为复用现有壳层，或重新生成与 preserved-shell 兼容的模板

#### Scenario: Source-atomic CMS island apply may keep the complete major region inside the slot
- **WHEN** 某个有效 `decisionId` 对应的 apply plan 表示目标是 `cms-island` source-atomic whole-component replacement
- **THEN** 系统 SHALL 允许 `templateBody` 在 slot 内承载完整动态区域
- **AND** 前提 SHALL 是模板仍满足统一 CMS contract、slot scope 与其他 preflight 规则

### Requirement: `apply_cms_binding` 工具返回的结构错误必须可指导模型重试
系统 SHALL 为由 structure guardrails 触发的正式 apply 拒绝结果返回稳定、可恢复、可重试的错误，而不得只返回“模板不合法”这类模糊结论。错误至少应指出冲突发生在哪个模板字段、与哪类壳层策略冲突，以及下一次重试应如何收缩或重构模板。

#### Scenario: Structure conflict error identifies the template field and retry direction
- **WHEN** 正式 apply 因 `templateBody` 与 apply plan guardrail 冲突而失败
- **THEN** 错误结果 SHALL 指出冲突字段是 `templateBody`
- **AND** 错误结果 SHALL 指出当前计划要求保留外层壳层、避免重复 major container，或等价的重试方向

### Requirement: `apply_cms_binding` 工具必须从持久化 apply plan 解析正式 source props 与 `site-id`
系统 SHALL 只根据 `decisionId` 对应的宿主持久化 apply plan 解析正式 `toolKind`、source mode 与 source props，并据此生成新的 `cms-catalog` / `cms-content` 作者态标签。生成后的 `site-id`、`parent-id`、`catalog-id`、`ids`、分页字段和等价业务 props MUST 来自该 apply plan，而 MUST NOT 来自 caller 在 `decisionId` 之外补传的 raw binding 字段；若 apply plan 缺少正式 `siteId` 或必需 source props，系统 MUST 拒绝写入。

#### Scenario: 栏目型正式 apply 从 apply plan 解析 source props
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding` 并提供某个指向 `catalog-nav` 或 `catalog-list` 绑定的有效 `decisionId`
- **THEN** 系统 SHALL 从该 `decisionId` 对应的 apply plan 中解析正式 `siteId` 与栏目来源 props
- **AND** 当来源模式为父栏目来源时，系统 SHALL 写出 `site-id`、`level="children"` 与 `parent-id`
- **AND** 当来源模式为固定栏目集合时，系统 SHALL 写出 `site-id` 与按顺序稳定序列化的 `ids`

#### Scenario: 内容型正式 apply 从 apply plan 解析 source props
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding` 并提供某个指向 `content-list` 绑定的有效 `decisionId`
- **THEN** 系统 SHALL 从该 `decisionId` 对应的 apply plan 中解析正式 `siteId`、`catalogId` 与内容来源 props
- **AND** 当来源模式为按栏目取内容时，系统 SHALL 写出 `site-id`、`catalog-id`、`keyword`、`page-index` 与 `page-size`
- **AND** 当来源模式为固定内容集合时，系统 SHALL 写出 `site-id`、`catalog-id` 与按顺序稳定序列化的 `ids`

#### Scenario: apply plan 缺少正式 siteId 或必需 source props 时立即失败
- **WHEN** 某个 `decisionId` 对应的 apply plan 缺少正式 `siteId`、缺少必需 source props，或其 source mode 与 `toolKind` 组合不合法
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 擅自写出 `site-id="1"` 或任何其他猜测值
- **AND** 系统 SHALL NOT 产生新的 CMS 组件标记

### Requirement: 正式改写 legacy CMS 标签时必须升级为来自 apply plan 的显式 `site-id`
系统 SHALL 在通过 `apply_cms_binding` 正式改写旧页面中的 legacy `cms-catalog` / `cms-content` 时，将该标签升级为显式 `site-id` 的作者态写法；该 `site-id` MUST 来自 `decisionId` 关联的宿主持久化 apply plan，而不得继续依赖缺省站点、caller 猜测值或宿主静态 `siteID` 配置。

#### Scenario: 重绑旧 `cms-island` 时按 apply plan 显式补出 `site-id`
- **WHEN** `apply_cms_binding` 以某个来自旧页面、缺少显式 `site-id` 的 `cms-island` 为目标执行重绑，且调用方提供有效 `decisionId`
- **THEN** 生成后的作者态 `cms-*` 标签 SHALL 显式写出来自该 `decisionId` 对应 apply plan 的 `site-id`
- **AND** 系统 SHALL NOT 改用 caller 补传的 raw 站点字段
- **AND** 系统 SHALL NOT 再输出缺少显式 `site-id` 的新标签

## ADDED Requirements

### Requirement: Successful formal apply must consume the ready decision while failed writes may retry only under unchanged context
系统 SHALL 允许同一个 `ready` decision 在其绑定上下文仍然有效且尚未成功 apply 的前提下被重复用于模板修正重试；但一旦某个 `decisionId` 对应的正式 apply 成功完成，系统 MUST 将其消费或失效，并拒绝后续重复成功重放。

#### Scenario: Template validation failure keeps the decision reusable while context is unchanged
- **WHEN** 某个带 `decisionId` 的正式 apply 因模板 contract 校验失败或其他未落盘错误而终止
- **THEN** 系统 MAY 保持该 `decisionId` 继续有效
- **AND** 前提 SHALL 是其绑定的 authoring target identity 与 workspace revision 仍未变化

#### Scenario: Successful formal apply consumes the decision
- **WHEN** 某个 `decisionId` 对应的正式 apply 成功写回作者态 HTML
- **THEN** 系统 SHALL 消费或失效该 `decisionId`
- **AND** 系统 SHALL 拒绝随后对同一个 `decisionId` 的重复成功 replay
