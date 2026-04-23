## Purpose
定义 ordinary `page-builder` 流程中对已有 `cms-catalog` / `cms-content` 区域进行安全理解与修改时的专用 guidance capability、阅读顺序、分层边界与停止猜测规则。

## Requirements

### Requirement: Existing CMS region edits MUST use a dedicated authoring guidance capability
系统 SHALL 为 page-builder 中“已有 `cms-catalog` / `cms-content` 区域的普通修改”提供一个独立于 `page-builder-guided-generation` 与 `cms-binding-apply` 的 guidance capability，使模型在修改已有 CMS source tag 前先进入正确的 ordinary CMS authoring 语境，而不是继续依赖普通页面 skill 或 confirmed apply skill 自行兼任全部 CMS 理解职责。

#### Scenario: 命中已有 CMS 区域时加载专用 guidance capability
- **WHEN** 当前 ordinary page-builder 请求明确命中一个已存在的 `cms-catalog`、`cms-content` 或 `cms-island`
- **THEN** 系统 SHALL 为该次请求加载专用的已有 CMS 区域 guidance capability
- **AND** 系统 SHALL NOT 仅依赖 `page-builder-guided-generation` 的默认文案承担组件级 CMS authoring 细则

#### Scenario: 宿主显式激活专用 guidance 而不是被动等待模型发现
- **WHEN** 系统为一次 ordinary 既有 CMS 区域修改准备该 guidance capability
- **THEN** 系统 SHALL 通过宿主控制的 prompt surfacing 机制显式激活该 capability
- **AND** 系统 SHALL NOT 将“skill 已复制到 workspace”视为本轮 guidance 已稳定可见的充分条件

#### Scenario: confirmed CMS apply 不由普通 CMS region guidance 接管
- **WHEN** 当前 workflow 已经拥有确认完成的 CMS selection 并进入正式 apply 路径
- **THEN** 系统 SHALL 继续由 `cms-binding-apply` 承担该次 confirmed apply controller
- **AND** 系统 SHALL NOT 让已有 CMS 区域 guidance capability 替代 `cms-binding-apply` 的正式 apply 职责

### Requirement: Existing CMS region guidance MUST define a canonical reading order before editing
系统 SHALL 要求模型在修改已有 CMS 区域前按统一顺序理解当前 authoring contract：先读取全局稳定边界，再读取当前目标对应的最小 digest，再按需读取已有 CMS 区域 guidance；只有在场景升级为 confirmed apply 时，系统才 SHALL 让模型继续进入 `cms-binding-apply` 与 MCP tool protocol。

#### Scenario: 普通已有 CMS 区域修改先读最小 digest 再读 guidance
- **WHEN** 模型准备修改一个 ordinary flow 下命中的已有 CMS 区域
- **THEN** 系统 SHALL 先向该次请求提供当前目标的最小 component-aware digest
- **AND** 系统 SHALL 要求模型优先依据该 digest 理解当前组件、边界和可用 authoring surface
- **AND** 当 digest 仍不足以支持安全修改时，系统 SHALL 再让模型读取已有 CMS 区域 guidance capability

#### Scenario: confirmed apply 场景的工具协议不作为 ordinary CMS 编辑的默认第一入口
- **WHEN** 当前请求仍属于已有 CMS 区域的 ordinary 修改，而不是 confirmed CMS selection 之后的 apply
- **THEN** 系统 SHALL NOT 要求模型先从 `mcp__cms__decide_cms_binding` / `mcp__cms__apply_cms_binding` 的工具协议开始理解当前 CMS 区域
- **AND** 系统 SHALL 将 MCP tool guidance 保留给正式 confirmed apply 场景

### Requirement: Existing CMS region guidance MUST stay lightweight and layered
系统 SHALL 保持新的已有 CMS 区域 guidance capability 为轻量入口，只承载普通修改场景中必须稳定生效的阅读顺序、不要猜测规则和 ordinary/confirmed 边界；组件细则、共享规则和长示例 MUST 继续分层到 contract-derived digest、component/shared guidance 或 references，而不得把新的 guidance capability 再次扩展成大而全的 CMS 知识库。

#### Scenario: 主 guidance 只保留轻量普通编辑规则
- **WHEN** 系统维护已有 CMS 区域 guidance capability 的主文案
- **THEN** 该主文案 SHALL 只保留普通修改场景的最小规则，例如阅读顺序、不要猜测、source-first 边界和何时升级到 confirmed flow
- **AND** 该主文案 SHALL NOT 默认内嵌完整的 component-specific 字段表、confirmed apply checklist 或长篇示例库

#### Scenario: 组件细则与共享规则继续分层
- **WHEN** 系统需要为已有 CMS 区域 guidance 提供 `cms-catalog`、`cms-content` 或共享 authoring 规则的补充说明
- **THEN** 系统 SHALL 让这些说明由 contract-derived digest、component-specific guidance 或 shared guidance 承接
- **AND** 系统 SHALL NOT 把这些补充内容全部重新堆进单个主 guidance skill

### Requirement: Existing CMS region guidance MUST forbid guessing when contract understanding is insufficient
系统 SHALL 要求模型在缺少稳定 contract 依据时停止猜测 `cms-*` 写法，而不是凭经验发明 props、字段、slot scope 或 runtime-only attrs；当理解仍不足以安全修改时，系统 MUST 要求模型继续读取对应 guidance、发起最小必要澄清，或停止当前 CMS 改写路径。

#### Scenario: digest 与 guidance 仍不足时不猜测 props 或字段
- **WHEN** 模型在读取最小 digest 与已有 CMS 区域 guidance 后，仍缺少安全修改当前 `cms-*` 标签所需的关键 authoring 信息
- **THEN** 系统 SHALL NOT 允许模型继续猜测新的 props 组合、字段别名或模板结构
- **AND** 系统 SHALL 要求模型改为继续读取对应 guidance、请求最小必要澄清，或停止该 CMS 改写路径

#### Scenario: 不手写 runtime-only locator attrs
- **WHEN** 模型修改已有 CMS 区域并依据 guidance 生成新的作者态结构
- **THEN** 系统 SHALL 要求模型忽略 runtime-only locator attrs，例如 `data-proma-cms-source-id` 与 `data-proma-cms-island-*`
- **AND** 系统 SHALL NOT 允许模型把这些 attrs 当作普通作者态 surface 猜测写入或保留
