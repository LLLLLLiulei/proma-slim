## ADDED Requirements

### Requirement: `apply_cms_binding` 工具必须通过统一 HTML mutation pipeline 执行 block 级 CMS 绑定写入
系统 SHALL 在 `apps/app` 层提供正式的 `apply_cms_binding` 工具，使 page-builder 会话能够基于 `targetBlock.selector` 将 CMS binding 写入当前 block，并且 MUST 通过统一的 page-builder HTML mutation pipeline 完成写回，而不得绕过该 pipeline 手动分别维护 manifest、validator 或 preview state。

#### Scenario: 将栏目导航绑定写入目标 block
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`，提供某个 `targetBlock.selector`、`catalog-nav` 绑定参数和模板片段
- **THEN** 系统 SHALL 仅替换该目标 block 的内部 HTML 为生成的 `cms-catalog` 标记
- **AND** 系统 SHALL 通过统一 HTML mutation pipeline 写回 `workspace-files/index.html`
- **AND** 成功结果 SHALL 基于最新 HTML 返回 manifest、validation 和 preview state 摘要

#### Scenario: 将内容列表绑定写入目标 block
- **WHEN** 模型调用 `mcp__cms__apply_cms_binding`，提供某个 `targetBlock.selector`、`content-list` 绑定参数和模板片段
- **THEN** 系统 SHALL 仅替换该目标 block 的内部 HTML 为生成的 `cms-content` 标记
- **AND** 系统 SHALL NOT 替换外层 block 容器节点本身

### Requirement: `apply_cms_binding` 工具必须维护稳定的 block-id 与选择器写入护栏
系统 SHALL 继续以 `targetBlock.selector` 作为目标 block 的事实定位入口，并在首次成功绑定时为目标容器建立稳定的 `data-proma-block-id`；当 selector 未命中或命中不唯一时，系统 MUST 拒绝写入并返回稳定错误。

#### Scenario: 已有 block-id 时保持稳定
- **WHEN** 目标 block 已经包含 `data-proma-block-id`
- **THEN** 系统 SHALL 在本次 apply 后保留原有 `data-proma-block-id`
- **AND** manifest 与返回结果 SHALL 继续使用该稳定 blockId

#### Scenario: 缺少 block-id 时自动补写
- **WHEN** 目标 block 被 `targetBlock.selector` 唯一命中，但尚未包含 `data-proma-block-id`
- **THEN** 系统 SHALL 为该容器生成新的 `pb_blk_` 前缀稳定标识并写入外层容器
- **AND** 该 blockId SHALL 出现在 manifest 与工具返回结果中

#### Scenario: selector 未命中或不唯一时拒绝写入
- **WHEN** `targetBlock.selector` 在当前作者 HTML 中未命中任何 block，或命中多个 block
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 写回任何部分修改

### Requirement: `apply_cms_binding` 工具必须只生成当前 runtime 已支持的组件与 props
系统 SHALL 只为当前正式 runtime 已支持的 `cms-catalog` 与 `cms-content` 组件生成标记，并 MUST 将 binding source 收敛到当前已实现的 props 集合，而不得在本 change 中提前承诺尚未闭环的查询模型或属性。

#### Scenario: `catalog-nav` 仅映射到受支持的 `cms-catalog` props
- **WHEN** 调用方请求生成 `catalog-nav` 绑定
- **THEN** 系统 SHALL 只生成 `level`、`parent-id`、`content-type`、`search-keyword` 与 `take` 这些当前受支持的 `cms-catalog` 属性
- **AND** 生成的 slot 模板 SHALL 使用完整 `v-slot:default` 写法，而不是 `#default` 等简写

#### Scenario: `content-list` 仅映射到受支持的 `cms-content` props
- **WHEN** 调用方请求生成 `content-list` 绑定
- **THEN** 系统 SHALL 只生成 `catalog-id`、`keyword`、`page-index` 与 `page-size` 这些当前受支持的 `cms-content` 属性
- **AND** 系统 SHALL 要求 `catalog-id` 作为该绑定的最小必要字段

#### Scenario: 未支持的 source 字段被拒绝
- **WHEN** 调用输入包含 `catalogIds`、固定 `contentIds`、`contentSelectType`、alias 查询或其他当前 runtime 未支持的字段
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 写入任何新的 CMS 组件标记

### Requirement: `apply_cms_binding` 工具必须返回结构化 apply 摘要
系统 SHALL 为 `apply_cms_binding` 返回可供 skill、宿主和测试直接消费的结构化结果，而不是只返回自然语言说明。

#### Scenario: 成功 apply 返回结构化摘要
- **WHEN** `apply_cms_binding` 成功完成 block 级写入
- **THEN** 返回结果 SHALL 至少包含 `applied`、`targetBlock.selector`、`blockId`、`component` 与 `generatedHtml`
- **AND** 返回结果 SHALL 包含最新的 manifest entry 摘要、validation 摘要和 preview state

#### Scenario: apply 失败返回稳定错误
- **WHEN** `apply_cms_binding` 在参数校验、目标定位或 mutation pipeline 阶段失败
- **THEN** 系统 SHALL 返回稳定的工具错误
- **AND** 系统 SHALL NOT 以自然语言成功提示替代结构化失败结果
