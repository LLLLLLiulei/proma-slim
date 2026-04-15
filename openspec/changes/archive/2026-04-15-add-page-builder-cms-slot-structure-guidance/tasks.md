## 1. Skill And Prompt Guidance

- [x] 1.1 更新 `apps/app/default-skills/cms-binding-apply/SKILL.md` 与其 references，加入“`cms-*` 作为动态区域根节点、主要 HTML 容器进入 slot”的正反示例与执行约束
- [x] 1.2 更新 `apps/app/default-skills/page-builder-guided-generation/SKILL.md`，补充 CMS 区块生成时的源码组织规则，明确页面级静态外壳与动态区域主容器的边界
- [x] 1.3 更新 page-builder workspace 模板提示（如 `apps/app/resources/templates/page-builder-workspace-claude*.md`），把该结构约束同步到普通生成链路的默认提示词中
- [x] 1.4 为 skill / workspace template 文案补充或更新对应文档测试，覆盖推荐结构、反模式示例与软约束表述

## 2. Apply Tool Guidance

- [x] 2.1 更新 `apply_cms_binding` 相关文案与辅助示例，明确 `templateBody`、`emptyTemplate`、`errorTemplate` 承载完整动态区域结构，而不是只承载条目级碎片
- [x] 2.2 调整 `page-builder-cms-rendering-tools` / `cms-sdk-tools` 的测试断言，使 `catalog-nav` 与 `content-list` 的推荐示例都体现“主要容器在 slot 内”的约束

## 3. Validator Warning Diagnostics

- [x] 3.1 在 `packages/page-builder-cms-rendering/src/validation/cms-rendering-validator.ts` 中为明显的“主要动态容器外置”反模式新增保守的 warning 级 diagnostic 与稳定问题代码
- [x] 3.2 为 validator 新增单元测试，覆盖 `ul > cms-catalog > li`、`section > cms-content > article` 等 warning 场景，以及“主要容器已在 slot 内”时不告警的场景
- [x] 3.3 复核该 warning 与现有 manifest / preview / static export 链路的兼容性，确保其保持非阻断，不影响现有作者态写回与导出流程
