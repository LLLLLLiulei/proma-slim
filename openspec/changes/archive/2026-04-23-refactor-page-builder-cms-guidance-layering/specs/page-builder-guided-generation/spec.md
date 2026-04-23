## ADDED Requirements

### Requirement: `page-builder-guided-generation` MUST delegate existing CMS region literacy to dedicated guidance
系统 SHALL 让 `page-builder-guided-generation` 在 ordinary page-builder flow 中继续承担用户侧控制权和高层 CMS 边界，但在命中已有 `cms-catalog` / `cms-content` 区域时，系统 MUST 让它把组件级 CMS literacy 委托给专用的已有 CMS 区域 guidance，而不是继续由该主控 skill 内部重复持有完整的 props、字段和 contract 细则。

#### Scenario: ordinary controller 保持用户侧控制但不独占组件级 CMS guidance
- **WHEN** 用户在 ordinary page-builder flow 中要求修改一个已存在的 CMS 区域
- **THEN** 系统 SHALL 继续由 `page-builder-guided-generation` 保持用户侧交互、普通迭代和高层边界控制
- **AND** 系统 SHALL 让组件级 CMS authoring 细节由专用的已有 CMS 区域 guidance 与当前目标 digest 负责

#### Scenario: 主控 skill 在已有 CMS 区域场景中先要求 consult guidance 再修改
- **WHEN** `page-builder-guided-generation` 处理的 ordinary 请求明确命中已有 CMS 区域，或宿主已经表明当前页面包含已有 CMS 区域并注入了 page-level CMS guidance notice
- **THEN** 该主控 skill SHALL 明确要求模型先 consult 当前目标的 canonical guidance
- **AND** 该主控 skill SHALL NOT 把已有 CMS 区域当作普通 HTML/Vue 片段直接凭经验改写

### Requirement: `page-builder-guided-generation` MUST keep its ordinary CMS section boundary-level and lightweight
系统 SHALL 让 `page-builder-guided-generation` 中与 CMS 相关的主文案只保留 ordinary flow 需要长期稳定生效的高层边界，而不得继续在该 skill 内堆叠完整的组件级字段表、confirmed apply checklist 或大段 component-specific 示例。

#### Scenario: 主控 skill 的 CMS 规则只保留 ordinary flow 高层边界
- **WHEN** 系统维护 `page-builder-guided-generation` 的主文案
- **THEN** 其中与 CMS 相关的内容 SHALL 只保留“不要 invent 新 `cms-*`”“不要整页引 Vue”“命中已有 CMS 区域先 consult guidance”“ordinary flow 不绕过 confirmed apply”这类高层边界
- **AND** 该主文案 SHALL NOT 继续内嵌完整的 component-specific props/field tables 或 confirmed apply 执行清单

#### Scenario: ordinary CMS 改写信息不足时不由主控 skill 猜测细节
- **WHEN** `page-builder-guided-generation` 在 ordinary flow 中缺少安全修改已有 CMS 区域所需的稳定 authoring 依据
- **THEN** 系统 SHALL 让其改为依赖专用 guidance、最小必要澄清或停止 CMS 改写路径
- **AND** 该主控 skill SHALL NOT 单独凭经验猜测字段、props 或模板结构
