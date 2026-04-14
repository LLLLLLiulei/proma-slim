## MODIFIED Requirements

### Requirement: 已选区块内必须只暴露可安全回写的简单文本热点
系统 SHALL 仅在当前已选目标可稳定映射回 `workspace-files/index.html` 中静态 HTML 文本节点时暴露可内联编辑的简单文本热点；当当前已选目标是 `cms-island` 时，系统 MUST 不暴露任何内联文字编辑热点。

#### Scenario: 已选静态区块内暴露多个简单文本热点
- **WHEN** 用户已在 Builder 预览中选中某个普通静态区块，且该区块内包含多个可稳定回写的简单文本宿主元素
- **THEN** 系统 SHALL 允许这些简单文本热点分别进入内联编辑
- **AND** 系统 SHALL 不要求用户只编辑单一“主文案”热点

#### Scenario: 未选中目标时不提供内联文字编辑
- **WHEN** 当前 Builder 预览中不存在已选中的目标
- **THEN** 系统 SHALL 不允许用户直接进入预览文字内联编辑
- **AND** 系统 SHALL 要求用户先建立当前目标

#### Scenario: 选中 CMS island 时不暴露渲染文字热点
- **WHEN** 用户当前已选目标是某个 CMS island，且其渲染结果中存在标题、摘要、按钮文案或其他可见文本
- **THEN** 系统 SHALL 不将这些渲染文本视为受支持的内联编辑热点
- **AND** 系统 SHALL 不允许用户直接对这些渲染文本进入内联编辑态

#### Scenario: 无法稳定回写的文本不进入编辑态
- **WHEN** 用户点击当前已选目标内某段文本，但该文本无法稳定映射回 `workspace-files/index.html` 的简单文本目标
- **THEN** 系统 SHALL 不进入该文本的内联编辑态
- **AND** 系统 SHALL 不把该文本视为受支持的编辑热点

