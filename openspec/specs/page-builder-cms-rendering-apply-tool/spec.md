## Purpose

定义 `apply_cms_binding` 正式工具在 page-builder 中的 selection-scoped 写入约束、受支持 binding 映射和结构化返回契约，使 CMS 自动应用路径通过统一 HTML mutation pipeline 安全落地。

## Requirements

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
- **AND** manifest 与返回结果 SHALL 继续使用该稳定 blockId

#### Scenario: block 目标缺少 block-id 时自动补写
- **WHEN** `targetSelection.kind` 为 `block`，且目标 block 被 `targetSelection.selector` 唯一命中，但尚未包含 `data-proma-block-id`
- **THEN** 系统 SHALL 为该容器生成新的 `pb_blk_` 前缀稳定标识并写入外层容器
- **AND** 该 blockId SHALL 出现在 manifest 与工具返回结果中

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

### Requirement: `apply_cms_binding` 工具必须只生成当前 runtime 已支持的组件与 props
系统 SHALL 只为当前正式 runtime 已支持的 `cms-catalog` 与 `cms-content` 组件生成标记，并 MUST 将 binding source 收敛到当前已实现的 props 集合；该集合 MUST 同时支持“查询式来源”和“fixed-ids 来源”，而不得要求上层通过手工拼装或全量加载绕过正式来源模型；对于固定集合来源，作者态标签 MUST 使用稳定的 `ids` 属性按顺序序列化。

#### Scenario: `catalog-nav` 绑定可生成父栏目来源或固定栏目集合来源
- **WHEN** 调用方请求生成 `catalog-nav` 绑定
- **THEN** 系统 SHALL 生成 `cms-catalog` 标记
- **AND** 当来源模式为父栏目来源时，系统 SHALL 只生成 `site-id`、`level="children"` 与 `parent-id`
- **AND** 当来源模式为固定栏目集合时，系统 SHALL 只生成 `site-id` 与 `ids`
- **AND** 生成的 slot 模板 SHALL 使用完整 `v-slot:default` 写法，而不是 `#default` 等简写

#### Scenario: `content-list` 绑定可生成按栏目取内容来源或固定内容集合来源
- **WHEN** 调用方请求生成 `content-list` 绑定
- **THEN** 系统 SHALL 生成 `cms-content` 标记
- **AND** 当来源模式为按栏目取内容时，系统 SHALL 只生成 `site-id`、`catalog-id`、`keyword`、`page-index` 与 `page-size`
- **AND** 当来源模式为固定内容集合时，系统 SHALL 生成 `site-id`、`catalog-id` 与 `ids`

#### Scenario: fixed-ids 来源按输入顺序写出稳定 `ids` 属性
- **WHEN** `apply_cms_binding` 成功生成 fixed-ids 模式的 `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 将 `ids` 作为作者态显式属性写出
- **AND** `ids` SHALL 按输入顺序稳定序列化
- **AND** 系统 SHALL 不改写该顺序

#### Scenario: 新生成的 CMS 标签始终显式写出 site-id
- **WHEN** `apply_cms_binding` 成功生成新的 `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 在生成后的作者态标签上显式写出 `site-id`
- **AND** 该值 SHALL 来自当前正式输入中的显式 `siteId`

#### Scenario: 新建或重绑 CMS 标签时缺少 siteId 立即失败
- **WHEN** `apply_cms_binding` 试图生成新的 `cms-catalog` 或 `cms-content`，但调用输入缺少显式 `siteId`
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 擅自写出 `site-id="1"` 或任何其他猜测值
- **AND** 系统 SHALL NOT 产生新的 CMS 组件标记

#### Scenario: 混合来源字段或未支持字段被拒绝
- **WHEN** 调用输入同时混用 `ids` 与 `parent-id`、`catalog-id`、分页查询字段，或包含 alias 查询、`contentSelectType` 等当前 runtime 未支持的字段
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 写入任何新的 CMS 组件标记
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

### Requirement: `apply_cms_binding` 的模板字段必须被定义为完整动态区域结构的承载位置
系统 SHALL 将 `mcp__cms__apply_cms_binding` 的 `templateBody`、`emptyTemplate` 与 `errorTemplate` 定义为完整动态区域结构的承载位置，而不是仅承载零散条目级节点；其文案、示例与调用约束 SHALL 默认鼓励 `cms-catalog` / `cms-content` 成为该动态区域的源码根节点。

#### Scenario: `catalog-nav` 示例将主要集合容器写入 `templateBody`
- **WHEN** 系统为 `catalog-nav` 绑定提供 `apply_cms_binding` 的推荐示例或调用指导
- **THEN** 示例 SHALL 将 `ul`、`nav` 或同类主要集合容器写入 `templateBody`
- **AND** 示例 SHALL NOT 只把 `li` 或其他条目级节点作为 `templateBody` 的主要结构

#### Scenario: `content-list` 示例将主要列表容器写入 `templateBody`
- **WHEN** 系统为 `content-list` 绑定提供 `apply_cms_binding` 的推荐示例或调用指导
- **THEN** 示例 SHALL 将 `section`、`article`、`div.grid` 或同类主要列表容器写入 `templateBody`
- **AND** 示例 SHALL NOT 将主要列表容器长期留在生成后的 `cms-content` 外部

#### Scenario: fallback 模板按完整 fallback 区域而非碎片条目组织
- **WHEN** 调用方向 `apply_cms_binding` 传入 `emptyTemplate` 或 `errorTemplate`
- **THEN** 系统 SHALL 将这些模板字段视为完整 fallback 区域结构的承载位置
- **AND** 推荐示例 SHALL 优先展示完整的 fallback 容器，而不是仅展示孤立条目级碎片

### Requirement: `apply_cms_binding` 工具必须在写回前按 canonical contract 执行 CMS authoring 预检
系统 SHALL 在 `apply_cms_binding` 生成并写回新的 `cms-catalog` / `cms-content` 前，先依据 canonical CMS authoring contract 对候选 authoring 执行预检；预检 MUST 覆盖 props/source mode 组合、必填字段、slot 结构、可用字段白名单与模板语法合法性，而不得等到落盘后再发现这些错误。

#### Scenario: 预检拦截未支持字段与模板语法错误
- **WHEN** `apply_cms_binding` 收到的 `templateBody`、`emptyTemplate` 或 `errorTemplate` 中包含不在当前 contract 中的字段访问，或存在 Vue template 语法错误
- **THEN** 工具 SHALL 在写回前直接拒绝该输入
- **AND** 系统 SHALL NOT 继续执行 HTML mutation

#### Scenario: 预检拦截禁止结构
- **WHEN** `apply_cms_binding` 收到的模板包含 `<script>`、`<style>`、嵌套 `cms-*`、外层 `template v-slot:*` 包装，或其他当前 contract 明确禁止的结构
- **THEN** 工具 SHALL 在写回前直接拒绝该输入
- **AND** 系统 SHALL NOT 生成新的作者态 `cms-*` 标记

### Requirement: `apply_cms_binding` 与统一 mutation pipeline 必须对所有阻断性 CMS authoring 错误 fail closed
系统 SHALL 让 `apply_cms_binding` 与统一 HTML mutation pipeline 对所有阻断性 CMS authoring 错误 fail closed，而不得继续只阻断少数错误类型；只要最新 HTML 的 CMS validation 结果中存在阻断性错误，系统 MUST 视本次 apply 失败，并 SHALL NOT 写回或刷新为成功状态。

#### Scenario: 任一阻断性 CMS validation error 都会使 apply 失败
- **WHEN** 本次 `apply_cms_binding` 生成的最新 HTML 在 CMS validation 中出现任一阻断性 error
- **THEN** 系统 SHALL 让本次 apply 失败
- **AND** 系统 SHALL NOT 将该 HTML 写回作者态文件
- **AND** 系统 SHALL NOT 将 manifest 或 preview state 视为成功刷新

#### Scenario: fail-closed 失败返回结构化错误而不是伪成功
- **WHEN** `apply_cms_binding` 因 CMS authoring 校验失败而终止
- **THEN** 工具 SHALL 返回稳定的结构化错误
- **AND** 系统 SHALL NOT 以自然语言“已应用”提示替代该失败结果

### Requirement: 正式改写 legacy CMS 标签时必须升级为显式 `site-id`
系统 SHALL 在通过 `apply_cms_binding` 正式改写旧页面中的 legacy `cms-catalog` / `cms-content` 时，将该标签升级为显式 `site-id` 的作者态写法，而不得继续保留缺省站点依赖。

#### Scenario: 重绑旧 `cms-island` 时显式补出 `site-id`
- **WHEN** `apply_cms_binding` 以某个来自旧页面、缺少显式 `site-id` 的 `cms-island` 为目标执行重绑
- **THEN** 生成后的作者态 `cms-*` 标签 SHALL 显式写出来自当前正式输入的 `site-id`
- **AND** 系统 SHALL NOT 再输出缺少 `site-id` 的新标签
