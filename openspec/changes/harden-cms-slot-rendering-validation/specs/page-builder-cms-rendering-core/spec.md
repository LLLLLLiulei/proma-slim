## ADDED Requirements

### Requirement: CMS validation 必须阻断未声明 slot helper
系统 SHALL 在 CMS island template validation 阶段检查 slot 表达式中的裸 helper/function call；当模板调用未由 canonical contract 声明的项目 helper 时，validation MUST 返回阻断性错误，并且系统 MUST NOT 将该模板视为可 preview 或可 export 的合法 CMS island 模板。系统层 MUST NOT 为该目标实现复杂 JavaScript/Vue 表达式 tokenizer；宿主能力和不可用对象/方法由默认 skill guidance 约束，确定性 Vue 模板语法错误继续由 Vue compiler 诊断。

#### Scenario: 插值中的未声明 helper 被拒绝
- **WHEN** 某个 `cms-content` 或 `cms-catalog` slot 模板包含 `{{ getDateDay(item.addedAt) }}`、`{{ formatDate(item.addedAt) }}` 或等价未声明裸函数调用
- **THEN** CMS validation SHALL 返回阻断性诊断
- **AND** 诊断 SHALL 使用稳定错误码，例如 `UNKNOWN_SLOT_HELPER`
- **AND** 诊断 SHALL 包含 helper 名称和所在模板上下文的简短信息

#### Scenario: 指令表达式中的未声明 helper 被拒绝
- **WHEN** 某个 CMS slot 模板在 `v-if`、`:href`、`:class`、`:key` 或其他 Vue 指令表达式中调用未声明裸 helper
- **THEN** CMS validation SHALL 返回阻断性诊断
- **AND** 系统 SHALL NOT 仅因为 Vue compiler 能生成 render function 就放行该模板

#### Scenario: 合法字段访问和成员方法不被误判为 helper
- **WHEN** 某个 CMS slot 模板使用 `item.addedAt`、`item.addedAt?.slice(0, 10)`、`items.slice(0, 3)` 或其他基于已声明 slot scope/字段的成员访问
- **THEN** CMS validation SHALL NOT 仅因这些成员访问或成员方法调用返回 `UNKNOWN_SLOT_HELPER`
- **AND** 模板仍 SHALL 继续接受既有字段白名单、slot 变量和 Vue 语法校验

#### Scenario: 安全原生全局不被误判为项目 helper
- **WHEN** 某个 CMS slot 模板使用 `new Date(item.addedAt).getDate()`、`Math.max(1, items.length)`、`JSON.stringify({ id: item.id })` 或等价 Vue 模板可执行的安全原生表达式
- **THEN** CMS validation SHALL NOT 仅因 `Date`、`Math` 或 `JSON` 返回 `UNKNOWN_SLOT_HELPER`
- **AND** 模板仍 SHALL 继续接受既有字段白名单、slot 变量和 Vue 语法校验

#### Scenario: helper 诊断阻止模板进入编译结果
- **WHEN** 某个 CMS island 模板存在 `UNKNOWN_SLOT_HELPER` 或等价阻断性 helper 诊断
- **THEN** 系统 SHALL NOT 将该模板编译为后续 preview 或 static export 可继续使用的 render 表示
- **AND** 调用方 SHALL 能从 validation 结果中识别该错误需要修正模板后重试

### Requirement: CMS validation 必须支持列表壳层目标的 slot 边界校验
系统 SHALL 提供可被正式 apply 链路复用的 CMS slot 结构校验能力，用于在已知目标壳层和 apply plan 结构策略时拒绝会产生重复列表外壳的模板；该能力 MUST 区分 preserved-shell 与 source-atomic / whole-component replacement 场景。

#### Scenario: 保留外层 `ul` 壳层时拒绝 slot 再生成 `ul`
- **WHEN** apply plan 表示当前目标保留外层壳层，且目标壳层根节点为 `ul`
- **AND** `templateBody` 的单一有效根节点也是 `ul`
- **THEN** CMS slot 结构校验 SHALL 返回阻断性结构诊断
- **AND** 诊断 SHALL 使用稳定错误码，例如 `DUPLICATE_LIST_SHELL`
- **AND** 诊断 SHALL 指出应避免重复列表外壳或改为与 preserved-shell 兼容的 slot 结构

#### Scenario: 保留外层 `ol` 壳层时拒绝 slot 再生成 `ol`
- **WHEN** apply plan 表示当前目标保留外层壳层，且目标壳层根节点为 `ol`
- **AND** `templateBody` 的单一有效根节点也是 `ol`
- **THEN** CMS slot 结构校验 SHALL 返回阻断性结构诊断
- **AND** 系统 SHALL 避免生成 `ol > ol` 这类重复列表边界

#### Scenario: source-atomic 替换允许完整列表容器
- **WHEN** apply plan 表示目标是 `cms-island` source-atomic 或 whole-component replacement
- **AND** `templateBody` 使用 `ul`、`ol`、`section` 或其他完整动态区域容器作为 slot 根结构
- **THEN** CMS slot 结构校验 SHALL NOT 仅因完整列表容器而拒绝模板
- **AND** 模板仍 SHALL 通过 canonical contract、字段、slot 变量、helper 和 Vue 语法校验

#### Scenario: 实际选中目标是列表壳层时兜底拒绝重复列表根
- **WHEN** 正式 apply 时实际选中的 block 根节点是 `ul` 或 `ol`
- **AND** 传入的 `templateBody`、`emptyTemplate` 或 `errorTemplate` 生成同类完整列表根
- **THEN** 系统 SHALL 即使缺少显式 structure guardrails 也拒绝写入
- **AND** 系统 SHALL NOT 生成 `ul > cms-content > template > ul` 或 `ol > cms-content > template > ol` 这类重复列表边界
