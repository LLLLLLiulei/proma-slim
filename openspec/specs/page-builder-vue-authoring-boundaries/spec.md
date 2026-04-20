## Purpose

定义 `page-builder` 作者态 HTML 的 Vue authoring 边界，明确普通页面区域保持 HTML-first，Vue template 语法只允许出现在受控 `cms-*` slot authoring 中，并要求相关写入与 guardrail 流程对越界 authoring fail closed。

## Requirements

### Requirement: page-builder 作者态 HTML 必须将 Vue authoring 限定在 CMS source tags 内部
系统 SHALL 将 page-builder 作者态 HTML 视为 HTML-first 文档：Vue template authoring MAY 只存在于 `cms-catalog` / `cms-content` 的 slot templates 中；在这些 CMS source tags 之外，普通页面 DOM MUST 保持普通 HTML/CSS/JS，而 MUST NOT 依赖 Vue 指令、Vue 事件绑定、Vue 绑定属性或 Mustache 插值参与渲染。

#### Scenario: 非 CMS 页面区域出现 Vue template syntax 时阻断作者态
- **WHEN** 某个 page-builder 作者态 HTML 在 `cms-catalog` / `cms-content` 外部的普通 DOM 中出现 `v-*`、`@*`、`:` 绑定或 `{{ ... }}` 等 Vue template syntax
- **THEN** 系统 SHALL 将其视为阻断性的 page-builder 作者态错误
- **AND** 系统 SHALL NOT 将该 HTML 视为合法的 CMS authoring 页面

#### Scenario: CMS slot templates 继续允许受控 Vue authoring
- **WHEN** 某个 page-builder 作者态 HTML 在 `cms-catalog` / `cms-content` 的 `default`、`empty` 或 `error` slot templates 中使用符合 canonical contract 的 Vue template syntax
- **THEN** 系统 SHALL 允许这类 authoring 继续进入 CMS rendering validator
- **AND** 系统 SHALL 继续按 canonical CMS contract 校验其 slot scope、字段访问与禁止结构

### Requirement: page-builder 作者态 HTML 必须禁止作者自管 Vue runtime 与 page-wide mount
系统 SHALL 保持 page-builder 的 CMS rendering runtime 由宿主预览 / 导出链路管理，而不是由作者态 HTML 自行管理；作者态 HTML MUST NOT 为 CMS 渲染自行引入 Vue runtime 资产、Vue importmap、Vue CDN、inline bootstrap、`createApp` 流程或 page-wide `mount`。

#### Scenario: 作者态自行引入 Vue runtime 或 bootstrap 时阻断作者态
- **WHEN** 某个 page-builder 作者态 HTML 为了驱动 CMS 渲染而新增 Vue runtime `<script>`、指向 `vue` 的 importmap / module import、inline Vue bootstrap，或 page-wide `createApp` / `mount`
- **THEN** 系统 SHALL 将其视为阻断性的 page-builder 作者态错误
- **AND** 系统 SHALL NOT 继续把该 HTML 当作合法的 page-builder CMS rendering authoring

#### Scenario: 合法 CMS 页面不需要作者自行注入 Vue 资产
- **WHEN** 某个 page-builder 作者态 HTML 已经合法包含顶层 `cms-catalog` 或 `cms-content` source tags
- **THEN** 系统 SHALL 仍然通过宿主管理的预览 / 导出链路注入所需 Vue runtime 与 CMS bootstrap 能力
- **AND** 系统 SHALL NOT 要求作者态 HTML 额外自行添加 Vue runtime、Vue CDN 或 bootstrap 资产

### Requirement: Vue authoring boundary 违规必须在 page-builder 写入与 guardrail 链路中 fail closed
系统 SHALL 将 page-builder 作者态中的 Vue boundary 违规视为阻断性错误，并在正式 HTML mutation、直接 Agent 编辑后的 turn-end guardrail 与相关 preview 协调链路中 fail closed；系统 MUST NOT 把命中此类错误的 HTML 当作新的合法作者态基线。

#### Scenario: 正式 HTML mutation 命中 Vue boundary error 时阻断写入
- **WHEN** 某次 page-builder 正式 HTML mutation 结果包含 Vue boundary 违规错误
- **THEN** 系统 SHALL 阻断该次 mutation
- **AND** 系统 SHALL NOT 将该次结果写入为新的合法 page-builder 作者态
- **AND** 系统 SHALL NOT 将其视为 manifest 与 preview state 已成功刷新

#### Scenario: 直接 Agent 编辑在回合结束后命中 Vue boundary error 时保留失败状态
- **WHEN** Agent 直接改写 page-builder 作者态文件后，turn-end guardrail 检测到 Vue boundary 违规错误
- **THEN** 系统 SHALL 将该次结果标记为无效作者态
- **AND** 系统 SHALL 继续依赖现有安全预览 / 回滚协同策略避免无效中间状态成为新的安全基线
