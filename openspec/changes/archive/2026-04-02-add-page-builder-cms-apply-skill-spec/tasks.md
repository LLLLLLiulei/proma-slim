## 1. Contract surfaces

- [x] 1.1 为 `cms-binding-apply` 定义稳定的输入输出 contract，明确 `selection`、`targetBlock`、`entryPoint`、`applyIntent`、`workspacePolicy` 以及 `ready / needs-clarification / incompatible` 的结构字段
- [x] 1.2 补充第一阶段受支持路径的结构化示例，覆盖栏目选择映射 `nav`、固定内容条目映射 `content-list`，以及对应的 `replace-current` block-scoped 护栏
- [x] 1.3 补充澄清与拒绝用例样例，明确 `AskUserQuestion` 触发边界、`clarificationKinds` 和 `incompatibleCases`

## 2. Skill scaffold and instructions

- [x] 2.1 使用 `skill-creator` 创建 `cms-binding-apply` skill 脚手架，并补齐最小可用的 `SKILL.md` 与所需元数据
- [x] 2.2 在 skill 指令中固化第一阶段决策规则，要求 skill 仅在 `nav` 与 `content-list` 两类区块语义上形成 `ready` 结论
- [x] 2.3 在 skill 指令中固化输出约束，要求决策结果只能收敛为 `ready`、`needs-clarification` 或 `incompatible`
- [x] 2.4 为 skill 增加按需加载的参考材料或示例，覆盖结构化 payload、短澄清写法和不兼容场景说明

## 3. Validation and downstream handoff notes

- [x] 3.1 为 skill contract 添加可复用的校验样例或测试夹具，验证三类结果的字段完整性与可判定性
- [x] 3.2 校验 skill 文本与 contract 一致性，确认其不会把 CMS 主选择重新退回到 `AskUserQuestion`
- [x] 3.3 明确并记录后续模块的对接前提，包括自动 handoff 需要的强制 skill 注入、区块快照输入补充和本地 HTML apply 所消费的决策结果
