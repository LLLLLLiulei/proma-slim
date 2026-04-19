## ADDED Requirements

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
