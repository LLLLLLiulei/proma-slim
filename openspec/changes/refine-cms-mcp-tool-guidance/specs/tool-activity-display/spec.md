## ADDED Requirements

### Requirement: CMS apply tool activity label must use neutral binding wording
系统 SHALL 在前端工具活动展示中为 `mcp__cms__apply_cms_binding` 使用同时覆盖栏目和内容的中性文案，而不得使用容易误导为仅支持内容绑定的名称。

#### Scenario: CMS apply label covers catalog and content bindings
- **WHEN** 消息列表或工具活动区域展示 `mcp__cms__apply_cms_binding`
- **THEN** 工具名称 SHALL 表达“应用 CMS 绑定”或等价中性语义
- **AND** 文案 SHALL NOT 仅表达“应用内容绑定”这一内容专属含义
