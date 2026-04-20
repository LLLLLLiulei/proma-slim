## ADDED Requirements

### Requirement: 引导式专题页生成必须保持普通页面作者态为 HTML-first
系统 SHALL 让 `page-builder-guided-generation` 在普通页面生成与普通页面迭代场景中保持作者态页面为 HTML-first：除当前已存在的 `cms-catalog` / `cms-content` source tag 内部 slot authoring 外，普通页面区域 MUST 使用普通 HTML/CSS/JS，而 MUST NOT 被升级成整页 Vue authoring。

#### Scenario: 普通页面创建或迭代时不自行引入 Vue runtime
- **WHEN** `page-builder-guided-generation` 在普通专题页创建、普通局部修改或普通风格迭代场景中生成或改写页面
- **THEN** 系统 SHALL NOT 让其为 CMS 渲染自行引入 Vue runtime、Vue CDN、Vue importmap 或作者态 bootstrap 脚本
- **AND** 系统 SHALL NOT 让其通过 `createApp`、`Vue.createApp` 或 page-wide `mount` 把整页改造成单一 Vue app

#### Scenario: 调整已有 CMS 区域时只在当前 source tag 内使用 Vue authoring
- **WHEN** `page-builder-guided-generation` 需要调整页面中某个已有的 `cms-catalog` 或 `cms-content` 区域
- **THEN** 系统 MAY 在该当前 CMS source tag 的 slot templates 中继续使用符合 contract 的 Vue template 语法
- **AND** 系统 SHALL NOT 在该 CMS source tag 外部的普通页面区域新增 `v-*`、`@*`、`:` 绑定或 `{{ ... }}` 这类 Vue authoring
- **AND** 系统 SHALL NOT 把 surrounding shell 或 sibling block 改造成新的 Vue root

#### Scenario: 普通页面动态表达诉求不通过非 CMS Vue authoring 实现
- **WHEN** 用户在普通页面 flow 中希望某个非 CMS 区块“看起来更动态”或“像列表一样变化”
- **THEN** 系统 SHALL 优先通过普通 HTML/CSS/JS 结构、草稿内容或受控 CMS flow 满足该诉求
- **AND** 系统 SHALL NOT 在非 CMS 区块上写入 `v-for`、`v-if`、`@click` 或 `{{ ... }}` 来模拟整页 Vue 行为
