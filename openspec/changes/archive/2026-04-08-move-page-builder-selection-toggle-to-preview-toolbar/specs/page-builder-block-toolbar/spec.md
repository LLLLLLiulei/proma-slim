## MODIFIED Requirements

### Requirement: 手动 CMS 主入口必须绑定到已选区块而不是 composer
系统 SHALL 将 `page-builder` Builder 页中的手动 CMS 主入口迁移为区块级入口，而不是继续在右侧对话输入区动作区域提供独立的 `浏览 CMS` 主入口。

#### Scenario: 未选中区块时不展示手动 CMS 主入口
- **WHEN** 用户进入 Builder 页且当前没有已选中的预览区块
- **THEN** 系统 SHALL 不在预览区显示区块级 CMS 工具条
- **AND** 系统 SHALL 不在对话输入区动作区域显示独立的 `浏览 CMS` 主入口

#### Scenario: 预览工具栏中的区块选择入口继续作为进入主流程的前置步骤
- **WHEN** 用户尚未选中任何预览区块
- **THEN** 系统 SHALL 在预览工具栏中继续提供区块选择入口
- **AND** 系统 SHALL 要求用户先通过该入口选中目标区块，之后才可使用手动 CMS 主入口
- **AND** 系统 SHALL 不要求用户回到对话输入区查找该入口
