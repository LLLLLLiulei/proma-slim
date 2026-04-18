## Why

当前 `page-builder` 在“选中 CMS 渲染区块后继续让 Agent 修改”的链路上，仍然主要依赖渲染态 DOM 到作者态源码的 selector 映射与 prompt 约束，容易出现误命中其他区块、越过 source-atomic 边界写入，或在 `cms-*` slot 内引入危险标签的问题。随着 CMS 渲染能力已进入日常作者态迭代链路，现在需要把这条链路补齐为稳定、可阻断、可验证的 source-first guardrail。

## What Changes

- 为顶层 `cms-catalog` / `cms-content` 引入稳定的 source identity，并在 preview 选择、CMS 选择结果和自动 handoff 中统一保留该身份，而不再只依赖结构性 selector snapshot。
- 强化普通“选中区块后发送下一条消息”的 CMS 目标上下文，使其与受控 CMS apply 流程保持一致：必须整体更新源 CMS 标签、禁止写入渲染子节点、禁止跨 block 修改、禁止在旁边追加新的 CMS 组件。
- 新增面向 CMS 目标编辑的 targeted edit guardrail，要求作者态写入围绕单一 source target 执行，并在目标失效、映射不唯一或越界修改时 fail-closed，而不是猜测回退。
- 将 `cms-*` 内部的危险标签约束升级为正式写入边界的一部分，禁止在 `default` / `empty` / `error` slot 中写入 `<script>` 或 `<style>`，并要求相关 mutation pipeline 以阻断方式处理这类错误。

## Capabilities

### New Capabilities
- `page-builder-cms-targeted-edit-guardrails`: 定义 CMS 选中目标在普通 Agent 编辑链路中的 source-first 写入边界、失效处理和危险标签阻断规则。

### Modified Capabilities
- `page-builder-preview-block-selection`: 调整 CMS island 的隐藏选区上下文，要求其携带稳定 source identity，并明确 source-first、fail-closed 的下一条消息注入语义。
- `page-builder-cms-island-selection`: 调整 CMS island 的预览命中与映射规则，要求渲染结果稳定映射回唯一的源 CMS 标签身份，而不是只依赖 selector snapshot。
- `page-builder-cms-selection-contract`: 调整 CMS 选择结果中的 `targetSelection` 协议，使其能保留与 preview 选择一致的稳定 CMS 目标身份。
- `page-builder-cms-auto-agent-handoff`: 调整 CMS 自动 handoff payload，使其继承新的稳定 source identity 与 targeted edit guardrail 语义。
- `page-builder-cms-rendering-manifest-validation`: 调整 manifest 与 validation contract，使其能保留稳定 source identity，并将 CMS slot 内危险标签视为阻断性写入错误。

## Impact

- 影响 `page-builder` preview bridge、选区序列化、CMS island preview bootstrap、CMS 自动 handoff、作者态 HTML mutation pipeline、CMS apply tool 与相关 shared types。
- 影响 `workspace-files/.proma/cms-rendering-manifest.json` 的派生字段与相关测试断言。
- 影响默认 page-builder 工作区模板与 CMS apply skill 的约束说明，确保普通选区编辑和 CMS 受控 apply 流程使用一致的 guardrail。
