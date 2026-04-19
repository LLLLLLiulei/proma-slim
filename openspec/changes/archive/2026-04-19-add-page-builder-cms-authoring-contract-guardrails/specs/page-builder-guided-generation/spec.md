## ADDED Requirements

### Requirement: 引导式专题页生成在处理已有 CMS 标签时必须遵守 canonical CMS authoring contract
系统 SHALL 在 `page-builder-guided-generation` 处理已有 `cms-catalog` / `cms-content` 时，遵守 canonical CMS authoring contract，而不得继续依赖过时示例、自由猜测 props 或使用当前未实现字段。

#### Scenario: 调整已有 CMS 区块时只使用 contract 中存在的 props 与字段
- **WHEN** 引导式专题页生成链路需要调整页面中已有的 `cms-catalog` 或 `cms-content` 区块
- **THEN** 系统 SHALL 仅使用 canonical contract 中存在的 props、slot scope 与字段
- **AND** 系统 SHALL 使用符合 Vue template 语法的 slot 模板结构
- **AND** 系统 SHALL NOT 引入 `item.link`、`item.url` 或其他未实现字段

#### Scenario: 缺少稳定 authoring 依据时不猜测 CMS 写法
- **WHEN** 引导式专题页生成链路缺少编写或改写某个已有 CMS 区块所需的关键 authoring 信息
- **THEN** 系统 SHALL 发起短澄清或停止该 CMS 改写路径
- **AND** 系统 SHALL NOT 仅凭猜测写出新的 `cms-*` props 组合或非法模板结构

### Requirement: 引导式专题页生成使用的默认 CMS guidance 必须只引用当前 contract
系统 SHALL 让 `page-builder-guided-generation` 依赖的默认 CMS guidance、示例与引用材料只引用当前 canonical contract，而不得继续把已过时的 CMS 文档当作默认参考。

#### Scenario: 默认 guidance 不再引用 superseded 的 CMS 示例
- **WHEN** 引导式专题页生成链路为模型加载默认 CMS guidance
- **THEN** 这些 guidance SHALL 只引用当前 canonical contract 对应的写法
- **AND** 系统 SHALL NOT 继续把已归档或标记为 superseded 的 CMS 文档作为默认引用内容
