## ADDED Requirements

### Requirement: CMS 自动应用专用 skill 必须只 author CMS source tag 与 slot templates
系统 SHALL 让 `cms-binding-apply` 在 `ready` apply 路径中只 author 当前选中目标对应的 `cms-catalog` / `cms-content` source tag 及其 `templateBody`、`emptyTemplate`、`errorTemplate` 等 slot inner content；系统 MUST NOT 让该 skill 额外 author Vue runtime、bootstrap、page-wide mount 或 `cms-*` 外部的 Vue authoring。

#### Scenario: `ready` apply 路径只产出 `cms-*` source tag 与 slot inner content
- **WHEN** `cms-binding-apply` 针对某次已确认 CMS selection 进入 `ready` 路径并继续调用正式 apply tool
- **THEN** 系统 SHALL 将该次 authoring 限定为当前目标的 `cms-catalog` 或 `cms-content` source tag 及其 slot inner templates
- **AND** 系统 SHALL NOT 让该 skill 额外生成作者态 Vue importmap、Vue runtime `<script>`、Vue bootstrap 脚本或全页级 Vue root 容器

#### Scenario: 受控 apply 不把 surrounding shell 改造成 Vue authoring
- **WHEN** `cms-binding-apply` 为当前选中 block 或 `cms-island` 生成或重写 CMS authoring
- **THEN** 系统 MAY 保留与当前目标兼容的普通 HTML shell、类名与布局骨架
- **AND** 系统 SHALL 只在当前 CMS source tag 的 slot templates 中使用符合 contract 的 Vue template 语法
- **AND** 系统 SHALL NOT 在 `cms-*` 外部的 surrounding shell、sibling block 或 sibling CMS 区域新增 `v-*`、`@*`、`:` 绑定或 `{{ ... }}` 这类 Vue authoring

#### Scenario: 受控 apply 不依赖作者自管 Vue runtime 才能成立
- **WHEN** `cms-binding-apply` 评估某次确认后的 CMS apply 是否可以继续
- **THEN** 系统 SHALL 把“需要作者自行引入 Vue runtime、作者自行 `createApp` / `mount` 才能工作”的方案视为不符合当前受控 apply contract
- **AND** 系统 SHALL 返回 `incompatible` 或改走短澄清，而不是输出这类 page-wide Vue 方案
