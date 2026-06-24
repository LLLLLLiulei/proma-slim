## ADDED Requirements

### Requirement: `cms-binding-apply` guidance 必须禁止未声明 helper 并提供可执行替代写法
系统 SHALL 更新 `cms-binding-apply` 默认 skill 及其 references，使其明确要求 Agent 只使用 canonical contract 中声明的 slot scope、item 字段、安全原生全局和受控 Vue 表达式；skill MUST NOT 推荐或暗示可以调用未声明项目 helper/function，或访问宿主危险全局。

#### Scenario: content 日期展示 guidance 不发明 helper
- **WHEN** `cms-binding-apply` 为 `cms-content` 生成或说明带日期的内容列表模板
- **THEN** guidance SHALL 推荐直接展示 `item.addedAt` 或使用带守卫的成员表达式，例如字符串截取
- **AND** guidance SHALL 明确禁止 `getDateDay(item.addedAt)`、`getDateMonthYear(item.addedAt)`、`formatDate(item.addedAt)` 等未声明 helper

#### Scenario: ready checklist 提醒 apply 前模板必须通过 contract validation
- **WHEN** Agent 按 `cms-binding-apply` ready checklist 准备调用 `mcp__cms__apply_cms_binding`
- **THEN** skill SHALL 提醒 `templateBody`、`emptyTemplate` 与 `errorTemplate` 不得包含未声明项目 helper、宿主危险全局、Vue 模板不可执行表达式、未支持字段、未声明 slot 变量或禁止结构
- **AND** skill SHALL 指导 Agent 在工具返回模板错误时修正模板后重试，而不是手写页面文件或伪造成功

#### Scenario: guidance 允许安全原生表达式但禁止宿主能力
- **WHEN** Agent 需要在 CMS slot 中处理日期、数量或简单 JSON/字符串展示
- **THEN** guidance SHALL 允许 Vue 模板可执行的安全原生表达式，例如 `new Date(item.addedAt)`、`Math.max(...)` 或 `JSON.stringify(...)`
- **AND** guidance SHALL 明确禁止 `window`、`document`、`globalThis`、`eval`、`Function`、`fetch`、storage、timer 或 DOM/网络相关宿主能力

### Requirement: `cms-binding-apply` references 必须明确以 skill root 解析
系统 SHALL 让 `cms-binding-apply` 主文案和 references 对 reference 文件位置给出不依赖 scratch cwd 的说明；当 Agent 需要通过 shell 读取引用材料时，路径 MUST 指向 workspace-local skill 目录或当前 skill 文件同级 `references/`，而不得指向当前会话 scratch 目录下的裸 `references/`。

#### Scenario: Agent 在 scratch cwd 中不会读取错误 reference 路径
- **WHEN** Agent 当前工作目录是会话 scratch 目录而不是 skill root
- **THEN** `cms-binding-apply` guidance SHALL 说明 `references/contract-examples.md` 需要相对当前 skill 文件或 workspace-local `skills/cms-binding-apply/` 目录解析
- **AND** guidance SHALL 避免让 Agent 尝试读取 `<session>/references/contract-examples.md` 这类不存在路径

#### Scenario: references routing 保持轻量分层
- **WHEN** Agent 需要读取 CMS apply references
- **THEN** skill SHALL 继续先路由到轻量 decision 入口，再按 `cms-catalog` 或 `cms-content` 读取组件专项说明，必要时读取共享规则
- **AND** 系统 SHALL NOT 因路径说明补充而要求 Agent 默认加载所有 reference 文档
