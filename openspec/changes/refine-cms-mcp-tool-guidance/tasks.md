## 1. CMS SDK Tool 契约与说明

- [x] 1.1 更新 `apps/app/src/main/lib/cms-sdk-tools.ts` 中 `list_catalogs`、`list_contents`、`decide_cms_binding`、`apply_cms_binding` 的 tool description 和字段 description，使说明与实际 schema 一致。
- [x] 1.2 补齐 `decide_cms_binding` 的 `catalog-list` ready 示例，确保其使用 `targetBlockKind: "catalog-list"`、`mappingKind: "catalog-nav"`、`toolKind: "catalog-nav"`。
- [x] 1.3 收紧或统一 `siteId`、`catalogId`、`parentId`、`ids`、`take` 等参数校验与错误文案，避免 schema 允许值、运行时语义和 guidance 不一致。
- [x] 1.4 更新 CMS tool 错误格式化逻辑，去除 revision 过期表述，并确保输入错误、decision 错误和 apply 错误包含失败字段、下一步和禁止动作。
- [x] 1.5 更新 page-builder 会话动态上下文，说明 CMS MCP 是宿主运行时注入能力、不写入 workspace `mcp.json`，并在 CMS runtime 不可用时禁止伪造 CMS 数据。

## 2. Decision 与 Apply 链路

- [x] 2.1 检查 `page-builder-cms-binding-decision-store` 的 decision 读取与 apply 流程，确保不因 workspace revision 变化自动拒绝有效 `decisionId`。
- [x] 2.2 更新 `page-builder-cms-rendering-tools` 的模板字段校验，使 `templateBody`、`emptyTemplate`、`errorTemplate` 的错误都能指向对应字段。
- [x] 2.3 调整 apply preflight 校验边界，确保只因本次生成 CMS region 的 contract 问题阻断 apply，不因 CMS island 外部历史 Vue-like 语法误判失败。
- [x] 2.4 更新 CMS authoring contract / validator / apply preflight，使 `cms-catalog level` 非 `root|children`、正式 `site-id < 1`、`take <= 0` 能被诊断或拒绝。
- [x] 2.5 确认 `apply_cms_binding` 的公开入参仍保持为 `decisionId`、`templateBody`、`emptyTemplate?`、`errorTemplate?`，不新增 raw binding identity 字段。

## 3. Skill 与 Guidance 文档

- [x] 3.1 更新 `apps/app/default-skills/cms-binding-apply/SKILL.md`，统一 decision 调用顺序、catalog-list 示例、slot inner payload 说明和非过期 decision 语义。
- [x] 3.2 更新 `apps/app/default-skills/cms-binding-apply/references/*.md`，明确区分 tool payload 示例与最终作者态源码示例。
- [x] 3.3 修正 `cms-catalog` guidance 中不支持的 `level="1"` 示例，统一为 `root` 或 `children`。
- [x] 3.3a 修正默认 skill 与 references 中 `news`、`root`、`news-root`、`n-101` 等伪造 source ID 示例，统一使用 confirmed CMS selection 中的正整数 ID 字符串。
- [x] 3.4 去除或改写要求模型在 `templateBody` 内重复声明 slot wrapper 的表述，改为说明 wrapper 由正式 apply 工具自动生成。
- [x] 3.5 检查 `apps/app/resources/templates/page-builder-workspace-claude.md` 与默认 workspace guidance，确保没有与本次 CMS 工具契约冲突的说明。
- [x] 3.6 更新工具活动展示文案，将 `mcp__cms__apply_cms_binding` 从“应用内容绑定”类文案调整为“应用 CMS 绑定”类中性文案。

## 4. 测试与验证

- [x] 4.1 更新 `apps/app/src/main/lib/cms-sdk-tools.test.ts`，覆盖 catalog-list ready 示例、参数校验、非过期错误文案和 tool error 恢复提示。
- [x] 4.2 更新 `apps/app/src/main/lib/page-builder-cms-rendering-tools.test.ts`，覆盖模板字段级错误、outer cms tag 拒绝、slot wrapper 兼容和 preserved-shell 冲突字段提示。
- [x] 4.3 更新 `apps/app/src/main/lib/cms-binding-apply-skill.test.ts` 或新增 guidance 扫描测试，确保默认 skill / references 不再包含错误枚举、错误 source ID 示例或完整源码作为 apply payload 的误导写法。
- [x] 4.4 更新 `packages/page-builder-cms-rendering/src/validation/cms-rendering-validator.test.ts` 或相关 apply 测试，覆盖 CMS island 外部 Vue-like 语法不阻断本次 apply 的场景。
- [x] 4.5 补充 contract / validator 测试，覆盖 `cms-catalog level="1"`、`site-id="0"`、`take="0"` 等无效值不会被静默接受。
- [x] 4.5a 补充 `cms-catalog parent-id` 与 `level` 组合校验，避免 runtime 静默忽略 `parent-id` 或空的 `children` 来源。
- [x] 4.6 补充动态上下文或工具标签测试，覆盖 CMS runtime MCP 边界说明和 `mcp__cms__apply_cms_binding` 的中性展示文案。
- [x] 4.7 运行与本变更相关的单元测试，并在必要时运行 `bun run typecheck` 验证类型边界。

## 5. OpenSpec 同步检查

- [x] 5.1 对照 `openspec/changes/refine-cms-mcp-tool-guidance/specs/` 检查实现是否满足每个新增或修改场景。
- [x] 5.2 运行 OpenSpec 校验或状态检查，确认 change artifacts 完整且 ready for apply。
