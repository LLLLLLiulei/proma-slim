# `cms-binding-apply` Skill 设计分析

Date: 2026-04-02
Status: Review
Scope: 对 `apps/app/default-skills/cms-binding-apply/` 的完整设计评审，涵盖架构、运行时机制、数据契约对齐、问题识别与优化建议

---

## 1 Skill 总览

### 1.1 文件结构

```
apps/app/default-skills/cms-binding-apply/
├── SKILL.md                              # 主文档：使用场景、决策规则、护栏
├── agents/openai.yaml                    # Agent SDK 接口配置
└── references/
    ├── contract-examples.md              # 输入输出 JSON 示例（4 种场景）
    └── downstream-integration.md         # 与下游模块的集成约定
```

### 1.2 设计意图

该 skill 是一个**纯决策节点**——只负责"判断 CMS 选择结果能否安全应用到目标区块"，不负责实际 HTML 修改、CMS 浏览或预览刷新。

```
输入：CMS 结构化选择结果 + 目标区块信息 + 执行约束
  ↓ 决策
输出：ready | needs-clarification | incompatible
```

### 1.3 在整体方案中的位置

```
用户选区块 → 打开 CMS 弹框 → 确认选择
                                  ↓
                     ┌────────────────────────┐
                     │ cms-binding-apply skill │  ← 本文档分析对象
                     │ 判断能否安全应用        │
                     └────────────────────────┘
                          ↓          ↓          ↓
                       ready    clarify    incompatible
                         ↓          ↓          ↓
                     HTML修改   短澄清后重试   终止并提示
```

---

## 2 运行时机制分析

### 2.1 Skill 发现与加载链路

基于代码探索，当前 skill 在运行时的完整生命周期如下：

| 阶段 | 位置 | 说明 |
|------|------|------|
| 种子复制 | `config-paths.ts:449-473` | 默认 skills 从 `default-skills/` 复制到 workspace `skills/` 目录 |
| 目录扫描 | `workspace-service.ts:257-282` | `scanSkillsInDir()` 扫描含 `SKILL.md` 的子目录 |
| 元数据解析 | `workspace-service.ts:237-255` | 解析 SKILL.md 的 YAML frontmatter（name, description） |
| 插件注册 | `workspace-service.ts:142-173` | 生成 `.claude-plugin/plugin.json`，注册到 SDK |
| 上下文注入 | `agent-prompt-builder.ts:146-189` | 在 `<workspace_state>` 中列出可用 skills 及调用名 |
| 插件传递 | `agent-orchestrator.ts:1005` | 以 `plugins` 参数传递给 Claude Agent SDK |

调用名格式为 `{workspaceSlug}:{skillSlug}`，例如 `default:cms-binding-apply`。

### 2.2 Skill 触发方式

当前仓库支持的触发路径：

**路径 A：用户显式提及（已实现）**

```
用户输入 "/skill:cms-binding-apply ..."
  → AgentView.tsx:176 正则匹配提取 mentionedSkills
  → agent-orchestrator.ts:830-846 注入 <mentioned_tools> XML
  → SDK 加载 skill 并执行
```

关键代码（`agent-orchestrator.ts:830-846`）：

```typescript
if (mentionedSkills?.length) {
  const toolLines = ['用户在消息中明确引用了以下工具，请在本次回复中主动调用：']
  for (const slug of mentionedSkills) {
    const qualifiedName = getWorkspaceSkillInvocationName(workspaceSlug, slug)
    toolLines.push(`- Skill: ${qualifiedName}（请立即调用此 Skill）`)
  }
  enrichedMessage = `<mentioned_tools>\n${toolLines.join('\n')}\n</mentioned_tools>\n\n${runtimeUserMessage}`
}
```

**路径 B：程序化自动注入（未实现）**

CMS 确认后自动 handoff 时需要程序化传入 `mentionedSkills`，当前 `handleCmsSelectionConfirm` 是空函数，这条路径尚未打通。

### 2.3 与其他默认 Skills 的对比

```
default-skills/
├── brainstorming/        → 仅 SKILL.md，无 agents/ 无 references/
├── cms-binding-apply/    → 完整结构：SKILL.md + agents/ + references/
├── find-skills/          → 仅 SKILL.md
├── redesign-skill/       → 仅 SKILL.md
├── soft-skill/           → 仅 SKILL.md
└── taste-skill/          → 仅 SKILL.md
```

`cms-binding-apply` 是仓库中唯一具备完整 agents + references 配置的 skill。这意味着它在结构规范性上领先于其他 skill，但也意味着该结构在项目中尚无先例可参照。

---

## 3 SKILL.md 逐节评审

### 3.1 Overview

> "Use this skill after CMS browsing is already complete."

明确了 skill 的前置条件——CMS 浏览已完成，不承担浏览职责。边界清晰。

### 3.2 When to Use / Do not use

正向条件（3 条）和反向条件（3 条）互补，覆盖了常见误用场景：

| 正向 | 反向 |
|------|------|
| 用户已确认 CMS 数据 | 用户仍在浏览选择 |
| 已知目标区块 selector | 通用页面生成（无 CMS 绑定） |
| 下一步是决定 replace-current | 需要 append/merge/整页重写 |

评价：**5/5**。"When not to use" 的定义与 Phase 1A 范围严格对齐。

### 3.3 Required Input

列出了 5 个必需字段：`selection`、`targetBlock`、`entryPoint`、`applyIntent`、`workspacePolicy`。

问题在这里开始出现（详见第 4 节数据契约分析）。

### 3.4 Decision Rules

4 条规则构成完整的决策流水线：

```
Step 1: 验证 contract 合法性
  → 不合法 → incompatible
Step 2: 推断区块类型（只支持 nav / content-list）
  → 不支持 → incompatible
Step 3: 匹配 selection 与区块类型
  → catalogs → nav
  → contents-fixed → content-list
  → 不匹配 → incompatible
Step 4: 输出三态结果
  → ready / needs-clarification / incompatible
```

评价：**4/5**。逻辑清晰，但缺少 Step 2 的具体推断方法（如何从 selector 推断区块类型？）。

### 3.5 Clarification Guardrails

4 条限制：

1. 只用短澄清，不用复杂交互
2. 只在一个关键歧义阻塞安全决策时才问
3. 不通过 AskUserQuestion 重新浏览 CMS
4. CMS 选择已固定时不问创意性开放问题

评价：**5/5**。这些护栏直接回应了需求分析文档中"AskUserQuestion 不应承担主选择"的原则。

### 3.6 Apply Guardrails

4 条限制：

1. 只修改 `targetBlock.selector` 对应区块
2. 只支持 `replace-current`
3. 不提议整页重写
4. 不提议跨区块编辑

评价：**5/5**。Phase 1A 的安全边界定义明确。

---

## 4 数据契约对齐分析

### 4.1 Skill 期望的输入 vs 运行时实际数据

通过代码探索，发现 skill contract 与当前运行时数据之间存在显著差距：

| 字段 | Skill 期望 | 运行时实际 | 状态 |
|------|-----------|-----------|------|
| `version` | `1`（必需） | 未构建 | 缺失 |
| `entryPoint` | `'cms-browser-confirm'` | Selection 阶段使用 `'block-toolbar'` | 值不匹配 |
| `applyIntent` | `'replace-current'`（必需） | 无代码生成该字段 | 缺失 |
| `workspacePolicy` | 完整对象（必需） | 无代码生成该字段 | 缺失 |
| `workspacePolicy.outputTarget` | `'workspace-files/index.html'` | 无代码生成该字段 | 缺失 |
| `targetBlock.selector` | 必需 | `BuilderPage.tsx:520` 提供 | OK |
| `targetBlock.blockTypeHint` | 可选 `'nav' \| 'content-list'` | 无代码生成该字段 | 缺失（可选） |
| `targetBlock.blockLabel` | 可选 | 无代码生成该字段 | 缺失（可选） |
| `targetBlock.snapshotAvailable` | 可选 | 无代码生成该字段 | 缺失（可选） |
| `selection` | 完整选择结果（必需） | `CmsBrowserDialog.tsx:162-191` 提供 | OK |
| `uiContext` | 可选 | 无代码生成该字段 | 缺失（可选） |

### 4.2 核心差距

差距的根源是 `handleCmsSelectionConfirm`（`BuilderPage.tsx:524-526`）当前只有一行 log：

```typescript
const handleCmsSelectionConfirm = React.useCallback(
  (selection: PageBuilderCmsSelectionResult) => {
    console.info('[BuilderPage] CMS 选择结果:', selection)
  }, []
)
```

这个函数是 skill input 的**组装点**——CMS 弹框返回的 `PageBuilderCmsSelectionResult` 需要在这里被包装成 `PageBuilderCmsApplySkillInput`，附加上 `applyIntent`、`workspacePolicy` 等字段，然后通过自动 handoff 发送给 Agent。

### 4.3 `entryPoint` 值不一致

Selection 阶段定义了：
```typescript
type PageBuilderCmsSelectionEntryPoint = 'block-toolbar' | 'agent-flow'
```

Skill contract 定义了：
```typescript
entryPoint: 'cms-browser-confirm'
```

两者是不同的枚举空间。Selection 阶段的 `entryPoint` 表示"用户从哪里进入 CMS 选择"，skill 的 `entryPoint` 表示"这轮自动对话因何触发"。这是两个不同的语义，但当前命名容易混淆。

建议：将 skill contract 中的字段改名为 `triggerSource` 或类似名称，与 selection 阶段的 `entryPoint` 区分开。

### 4.4 `blockTypeHint` 的生成路径不存在

这是 skill 决策流程中最关键的缺失。Skill 的 Decision Rule 第 2 步要求"推断区块类型（只支持 nav / content-list）"，而 `blockTypeHint` 是唯一的输入信号。

当前没有任何代码生成这个字段。可能的解决方案：

| 方案 | 可行性 | 说明 |
|------|--------|------|
| A: 由 handoff 模块根据 selector 推断 | 低 | selector 如 `#section-3` 没有语义信息 |
| B: 由 block snapshot 工具提供 | 中 | 但该工具尚未实现（Module 5） |
| C: 由 skill/Agent 自行推断 | 高 | 结合 selection.selectionKind 和区块上下文 |
| D: 标记为可选，缺失时由 skill fallback | 高 | 最务实的方案 |

推荐方案 D：将 `blockTypeHint` 明确为可选字段。当缺失时，skill 根据 `selection.selectionKind` 做 fallback 推断（catalogs → 倾向 nav，contents → 倾向 content-list），置信度不足时走 `needs-clarification`。

---

## 5 `agents/openai.yaml` 评审

### 5.1 当前内容

```yaml
interface:
  display_name: "CMS Binding Apply"
  short_description: "Resolve CMS block apply intent"
  default_prompt: "Use $cms-binding-apply to decide how a confirmed CMS selection can be applied to the current page-builder block."
```

仅有 3 行 interface 配置。

### 5.2 缺失项

| 缺失内容 | 影响 | 严重度 |
|----------|------|--------|
| System prompt | 模型不知道必须输出结构化 JSON | 高 |
| 输出 schema 定义 | 模型可能在三态之外自由发挥 | 高 |
| 温度参数 | 决策类任务应低温度以保证一致性 | 中 |
| references 引用声明 | SDK 可能不自动加载 references/ 内容 | 中 |

### 5.3 建议补充

建议在 `openai.yaml` 中补充 system prompt 和输出约束，确保模型严格输出三态 JSON。具体内容应包含：

- 角色定义：你是 CMS 绑定应用决策器
- 输出格式要求：必须输出且仅输出 JSON
- 三态枚举约束：status 只能是 ready / needs-clarification / incompatible
- Phase 1A 边界重申：只支持 replace-current、只支持 nav 和 content-list
- references 中 contract-examples 的引用指令

---

## 6 `references/contract-examples.md` 评审

### 6.1 覆盖场景

| 场景 | 输入 | 输出 | 覆盖度 |
|------|------|------|--------|
| 栏目 → 导航 | catalogs + nav hint | ready | OK |
| 固定内容 → 图文列表 | contents-fixed + content-list hint | ready | OK |
| 栏目层级歧义 | — | needs-clarification | OK |
| 不支持的区块类型 | — | incompatible | OK |

4 个示例覆盖了 Phase 1A 的所有决策路径。

### 6.2 缺失场景

| 未覆盖场景 | 重要性 | 说明 |
|-----------|--------|------|
| `blockTypeHint` 缺失时的 fallback | 高 | 当前最可能的运行时场景 |
| 输入 payload 格式错误 | 中 | 缺少 selection 或 targetBlock 时的处理 |
| 内容类型为 video/audio/file 时 | 中 | 需要明确的 incompatible 提示文案 |
| 单栏目 vs 多栏目选择的决策差异 | 低 | 当前示例只展示了 multiple 模式 |

### 6.3 Ready 结果中的冗余字段

当前 ready 结果：

```json
{
  "status": "ready",
  "targetBlockKind": "nav",
  "supportedRenderModes": ["replace-current"],
  "renderMode": "replace-current",
  "applyStrategy": "replace-current",
  "mappingKind": "catalog-nav"
}
```

Phase 1A 阶段 `supportedRenderModes`、`renderMode`、`applyStrategy` 永远是 `replace-current`，三个字段传达同一个信息。建议简化为只保留 `applyStrategy`，或在 Phase 1A 阶段直接省略这些固定值。

---

## 7 `references/downstream-integration.md` 评审

### 7.1 内容结构

文档定义了 4 个下游前置条件和 Phase 1A 边界：

| 前置条件 | 说明 |
|----------|------|
| Auto handoff | 必须显式注入 skill，隐藏 prompt 不够 |
| Block snapshot | 当 selector + hint 不够时需要补充元数据 |
| HTML apply | 只消费 ready 决策，不解释 clarify/incompatible |
| Phase 1A 边界 | 5 条约束 |

### 7.2 关键警告

文档中最重要的一句话：

> "Hidden prompt decoration alone is not enough if runtime skill extraction only reads the visible userMessage."

这明确指出了一个运行时风险：如果 skill 标识只在隐藏上下文中注入，而运行时的 skill 解析逻辑只读 visible userMessage，那么 skill 不会被正确加载。

基于代码探索的验证结果：

- `AgentView.tsx:176` 的 skill 提取逻辑是 `userMessage.matchAll(/\/skill:(\S+)/g)`
- 这只匹配用户可见消息中的 `/skill:xxx` 模式
- 但 `agent-orchestrator.ts:830-846` 的 `<mentioned_tools>` 注入是在 enrichedMessage 层面，不依赖正则匹配

因此实际的注入链路是：

```
UI 层正则匹配 → 提取 mentionedSkills 数组 → 传递给后端 → 后端注入 <mentioned_tools>
```

对于自动 handoff 场景，需要绕过 UI 层正则匹配，直接在后端构造 `mentionedSkills` 数组。当前代码具备这个能力（`sendMessage` 接口接受 `mentionedSkills` 参数），但尚未有代码在自动 handoff 时调用它。

---

## 8 三态输出模型深度分析

### 8.1 模型设计

```
                    ┌─────────┐
                    │  输入    │
                    │ payload  │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │ 验证    │
                    │ contract│
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         ┌────▼────┐ ┌──▼───┐ ┌───▼────┐
         │  ready  │ │clarify│ │incomp. │
         └────┬────┘ └──┬───┘ └───┬────┘
              │         │         │
         下游 HTML   AskUser    终止
         修改模块    Question   并提示
```

### 8.2 各状态的定义完整度

| 状态 | 字段定义 | 消费方式 | 完整度 |
|------|---------|---------|--------|
| `ready` | targetBlockKind, renderMode, applyStrategy, mappingKind | 下游 HTML apply 直接消费 | 4/5 |
| `needs-clarification` | clarification.kind, .question, .options | 通过 AskUserQuestion 呈现 | 5/5 |
| `incompatible` | reasonCode, message | 向用户展示原因 | 4/5 |

### 8.3 存在的边界不清晰点

**ready → 下游如何消费 `mappingKind`？**

ready 结果中的 `mappingKind: "catalog-nav"` 或 `"fixed-contents-list"` 是给下游 HTML apply 模块的提示，但下游模块如何基于此决定具体的 HTML 修改策略，在当前文档体系中没有定义。这个衔接点是 skill 与 Module 6 之间的灰色地带。

**needs-clarification → 澄清完成后如何回流？**

当 skill 返回 `needs-clarification` 后，用户通过 AskUserQuestion 回答了澄清问题。这个回答如何回流到 skill 进行第二次决策？是：
- A: 重新调用 skill，附上用户选项作为额外输入？
- B: 由 Agent 直接根据用户回答继续执行？

当前文档未定义这个回流机制。

**incompatible → 是否有恢复路径？**

当 skill 返回 incompatible 后，用户是否可以：
- 重新选择 CMS 数据？
- 切换到另一个区块？
- 手动在对话中描述想要的效果？

当前文档将 incompatible 视为终态，但用户体验上可能需要提供恢复路径。

---

## 9 与需求分析文档（specs）的一致性

### 9.1 对齐点

| Specs 要求 | Skill 实现 | 一致性 |
|-----------|-----------|--------|
| Req D: 专用 skill 驱动应用决策 | 独立 skill 文件夹 + contract | 一致 |
| Req E: 自动对话 + 隐藏上下文 + 强制 skill | downstream-integration 有提及 | 一致 |
| Req H: 默认 replace-current | Apply Guardrails 明确限制 | 一致 |
| Req K: 专用 skill 收敛决策 | 三态输出模型 | 一致 |
| 只支持 nav + content-list | Decision Rules 明确限制 | 一致 |
| AskUserQuestion 只用于短澄清 | Clarification Guardrails | 一致 |

### 9.2 偏离点

| Specs 要求 | Skill 实际 | 偏离 |
|-----------|-----------|------|
| Req F: Agent 通过宿主工具获取 block snapshot | Skill 不要求 snapshot 作为必需输入 | Skill 更宽松 |
| Specs 建议 skill 输出包含 supportedRenderModes | Ready 结果固定为 `["replace-current"]` | Phase 1A 无意义 |
| Specs Open Q2: 是否允许 Agent 提出新增区块 | Skill 直接拒绝（incompatible） | Skill 更保守 |

Skill 整体比 specs 更保守，这在 Phase 1A 是合适的。

---

## 10 综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 职责清晰度 | 5/5 | 纯决策节点，不混杂执行 |
| 三态输出模型 | 5/5 | 简洁、确定、可消费 |
| 护栏设计 | 5/5 | Phase 1A 边界严格明确 |
| Contract 示例质量 | 4/5 | 主路径覆盖完整，边缘场景待补 |
| 运行时可行性 | 3/5 | skill 注入路径可行但未实现；输入构建不存在 |
| 数据契约对齐 | 2/5 | 多个必需字段在运行时无代码生成 |
| Agent 配置完整度 | 2/5 | openai.yaml 缺少 system prompt 和输出约束 |
| 下游衔接定义 | 3/5 | 有前置条件声明，但回流机制未定义 |

---

## 11 问题清单（按优先级）

### P0：阻塞项

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 1 | `handleCmsSelectionConfirm` 是空函数，无代码构建 skill input payload | 整条链路无法运行 | 实现该函数，组装 `PageBuilderCmsApplySkillInput` |
| 2 | 自动 handoff 时程序化传入 `mentionedSkills` 的链路未实现 | Skill 不会被加载 | 在自动 handoff 发送时附带 `mentionedSkills: ['cms-binding-apply']` |

### P1：高优先级

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 3 | `blockTypeHint` 无生成来源 | Skill 决策缺少关键输入 | 标记为可选，skill 根据 selectionKind fallback 推断 |
| 4 | `openai.yaml` 缺少 system prompt | 模型输出不可控 | 补充结构化 JSON 输出约束和角色定义 |
| 5 | `applyIntent` / `workspacePolicy` 无运行时构建代码 | 输入验证会失败 | 在 handoff 组装层硬编码 Phase 1A 默认值 |

### P2：中优先级

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 6 | `entryPoint` 在 selection 阶段和 skill 阶段使用不同的值空间 | 命名混淆 | Skill 侧改名为 `triggerSource` 或保持但在文档中明确区分 |
| 7 | `needs-clarification` 后的回流机制未定义 | 澄清后无法继续 | 补充澄清回流方案（重新调用 skill 或由 Agent 直接续接） |
| 8 | 输入 payload 格式错误时无定义输出 | 异常行为不可预测 | 在 incompatible 中增加 `reasonCode: "malformed-payload"` |
| 9 | Ready 结果中 `supportedRenderModes` / `renderMode` / `applyStrategy` 三字段冗余 | 信息重复 | Phase 1A 简化为只保留 `applyStrategy` |
| 10 | 缺少 `blockTypeHint` 缺失场景的 contract 示例 | 最可能的运行时场景无参考 | 在 contract-examples 中补充 |

### P3：低优先级

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 11 | `incompatible` 无恢复路径引导 | 用户体验断裂 | 在 message 中建议下一步操作 |
| 12 | 缺少音频/视频/文件类型的 incompatible 示例 | 原始需求涉及的类型无参考 | 补充示例，明确"后续版本支持" |
| 13 | 单栏目 vs 多栏目场景缺少独立示例 | selectionMode=single 的处理无参考 | 补充 |

---

## 12 优化建议

### 12.1 短期（实现 Phase 1A 闭环前）

1. **实现 `handleCmsSelectionConfirm`**：在该函数中组装 `PageBuilderCmsApplySkillInput`，对 Phase 1A 阶段的固定字段（`applyIntent`、`workspacePolicy`）使用硬编码默认值
2. **打通自动 handoff + skill 注入**：在自动发送消息时附带 `mentionedSkills` 参数，绕过 UI 层正则匹配
3. **补充 `openai.yaml` 的 system prompt**：确保模型严格输出三态 JSON
4. **补充 `blockTypeHint` 缺失的 contract 示例**：因为这是最可能的运行时场景

### 12.2 中期（闭环稳定后）

5. **定义 `needs-clarification` 的回流机制**：明确澄清完成后如何驱动第二次决策
6. **引入 block snapshot 充实 `blockTypeHint`**：提高区块类型推断的准确性
7. **简化 Ready 输出**：去除 Phase 1A 阶段的冗余固定值字段
8. **统一 `entryPoint` 命名**：消除 selection 阶段和 skill 阶段的枚举混淆

### 12.3 长期（进入 Phase 1B 时）

9. **扩展三态模型**：增加更多 `applyStrategy` 选项（append、merge 等）
10. **扩展 `targetBlockKind`**：增加 carousel、article-detail、media-list 等
11. **引入绑定持久化语义**：Ready 结果中包含绑定 ID 和刷新策略
