## MODIFIED Requirements

### Requirement: `apply_cms_binding` 工具必须通过统一 HTML mutation pipeline 执行 selection 级 CMS 绑定写入
系统 SHALL 在 `apps/app` 层提供正式的 `apply_cms_binding` 工具，使 page-builder 会话能够基于 `targetSelection` 将 CMS binding 写入当前目标，并且 MUST 通过统一的 page-builder HTML mutation pipeline 完成写回，而不得绕过该 pipeline 手动分别维护 manifest、validator 或 preview state。

#### Scenario: 将栏目导航绑定写入普通 block 目标
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`，提供某个 `targetSelection.kind: block`、`catalog-nav` 绑定参数和模板片段
- **THEN** 系统 SHALL 仅替换该目标 block 的内部 HTML 为生成的 `cms-catalog` 标记
- **AND** 系统 SHALL 通过统一 HTML mutation pipeline 写回 `workspace-files/index.html`
- **AND** 成功结果 SHALL 基于最新 HTML 返回 manifest、validation 和 preview state 摘要

#### Scenario: 将内容列表重绑到选中的 CMS island
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`，提供某个 `targetSelection.kind: cms-island`、包含 `sourceSelector`、`parentBlockSelector`、`component` 与 `htmlPath` 的 runtime locator、`content-list` 绑定参数和模板片段
- **THEN** 系统 SHALL 仅替换该 locator 唯一命中的源 CMS 标签为新的 `cms-content` 标记
- **AND** 系统 SHALL NOT 替换该 CMS 标签所在的整个 parent block
- **AND** 系统 SHALL NOT 删除或覆盖同一 parent block 中的静态兄弟节点

#### Scenario: 将栏目导航重绑到选中的 CMS island
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`，提供某个 `targetSelection.kind: cms-island`、包含 `sourceSelector`、`parentBlockSelector`、`component` 与 `htmlPath` 的 runtime locator、`catalog-nav` 绑定参数和模板片段
- **THEN** 系统 SHALL 仅替换该 locator 唯一命中的源 CMS 标签为新的 `cms-catalog` 标记
- **AND** 系统 SHALL 保留该 CMS 标签周围的静态结构不变

### Requirement: `apply_cms_binding` 工具必须维护稳定的目标选择器与写入护栏
系统 SHALL 对 block 目标继续使用 `targetSelection.selector` 作为事实定位入口，并在 block 目标首次成功绑定时继续为目标容器建立稳定的 `data-proma-block-id`；当目标是 `cms-island` 时，系统 MUST 以 runtime locator 中的 `sourceSelector` 进行唯一定位，并 SHALL 使用 `parentBlockSelector`、`component` 与 `htmlPath` 做一致性校验；当 locator 未命中、命中不唯一、组件不匹配或 parent block 校验失败时，系统 MUST 拒绝写入并返回稳定错误。

#### Scenario: block 目标已有 block-id 时保持稳定
- **WHEN** `targetSelection.kind` 为 `block`，且目标 block 已经包含 `data-proma-block-id`
- **THEN** 系统 SHALL 在本次 apply 后保留原有 `data-proma-block-id`
- **AND** manifest 与返回结果 SHALL 继续使用该稳定 blockId 作为普通 block 兼容摘要

#### Scenario: block 目标缺少 block-id 时自动补写
- **WHEN** `targetSelection.kind` 为 `block`，且目标 block 被 `targetSelection.selector` 唯一命中，但尚未包含 `data-proma-block-id`
- **THEN** 系统 SHALL 为该容器生成新的 `pb_blk_` 前缀稳定标识并写入外层容器
- **AND** 该 blockId SHALL 出现在普通 block 相关的 manifest 与工具返回结果中

#### Scenario: cms-island 目标按 runtime locator 解析唯一源标签
- **WHEN** `targetSelection.kind` 为 `cms-island`，且其 runtime locator 在当前作者态 HTML 中唯一命中某个源 CMS 标签
- **THEN** 系统 SHALL 仅围绕该源 CMS 标签执行本次 apply
- **AND** 系统 SHALL 使用 `parentBlockSelector` 校验该源标签仍属于当前所选 parent block
- **AND** 系统 SHALL NOT 继续要求该目标在作者态源码中持有 `sourceId`

#### Scenario: locator 未命中、失配或不唯一时拒绝写入
- **WHEN** `targetSelection.kind` 为 `cms-island`，但其 runtime locator 在当前作者态 HTML 中未命中任何源 CMS 标签、命中多个源 CMS 标签、组件不匹配或 parent block 校验失败
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 写回任何部分修改
- **AND** 系统 SHALL NOT 回退到旧 `sourceId`、parent block 或结构相似的其他目标

### Requirement: `apply_cms_binding` 工具必须返回结构化 apply 摘要
系统 SHALL 为 `apply_cms_binding` 返回可供 skill、宿主和测试直接消费的结构化结果，而不是只返回自然语言说明；该摘要 MUST 明确反映本次写入围绕哪个 `targetSelection` 执行。

#### Scenario: 成功 apply 返回结构化摘要
- **WHEN** `apply_cms_binding` 成功完成 selection 级写入
- **THEN** 返回结果 SHALL 至少包含 `applied`、`targetSelection`、`component` 与 `generatedHtml`
- **AND** 当目标为 `cms-island` 时，返回结果中的 `targetSelection` SHALL 保留 `htmlPath`、`sourceSelector`、`parentBlockSelector` 与 `component`
- **AND** 返回结果 SHALL 包含最新的 manifest entry 摘要、validation 摘要和 preview state

#### Scenario: apply 失败返回稳定错误
- **WHEN** `apply_cms_binding` 在参数校验、目标定位或 mutation pipeline 阶段失败
- **THEN** 系统 SHALL 返回稳定的工具错误
- **AND** 系统 SHALL NOT 以自然语言成功提示替代结构化失败结果

## ADDED Requirements

### Requirement: `apply_cms_binding` 工具不得在作者态源码中生成内部 CMS 定位属性
系统 SHALL 将 `data-proma-cms-source-id` 和 `data-proma-cms-island-*` 视为 runtime-only 的内部定位元数据；`apply_cms_binding` 生成或重写作者态 `cms-catalog` / `cms-content` 时 MUST NOT 生成这些属性。

#### Scenario: 新生成的 CMS 标签不写出内部定位属性
- **WHEN** `apply_cms_binding` 成功生成新的 `cms-catalog` 或 `cms-content`
- **THEN** 生成后的作者态标签 SHALL 只包含业务 props、slot 模板及其合法结构
- **AND** 系统 SHALL NOT 写出 `data-proma-cms-source-id` 或任何 `data-proma-cms-island-*`

#### Scenario: 支持的 CMS 重绑流程剥离旧的内部定位属性
- **WHEN** `apply_cms_binding` 重写一个仍残留旧 `data-proma-cms-source-id` 或其他 runtime-only attrs 的源 CMS 标签
- **THEN** 系统 SHALL 在生成后的作者态标签中剥离这些内部定位属性
- **AND** 系统 SHALL NOT 将它们继续传播到新的作者态 HTML
