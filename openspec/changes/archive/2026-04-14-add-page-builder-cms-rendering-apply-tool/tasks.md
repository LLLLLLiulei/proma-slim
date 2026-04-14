## 1. Shared Contract Alignment

- [x] 1.1 收敛 `packages/shared/src/types/page-builder-cms-apply.ts`，让 `ready` 语义对齐正式 `apply_cms_binding` 调用与当前 runtime 已支持的映射
- [x] 1.2 清理 `fixed-contents-list` 等旧示例与 typecheck fixture，改为明确表达固定内容 ID 在当前阶段属于不可执行输入

## 2. Apply Tool Implementation

- [x] 2.1 新增 `apps/app/src/main/lib/page-builder-cms-rendering-tools.ts`，定义 `apply_cms_binding` 的输入校验与规范化 HTML 生成功能
- [x] 2.2 实现基于 `targetBlock.selector` 的 block 定位、`data-proma-block-id` 保留或补写，以及仅替换 block 内部 HTML 的写入逻辑
- [x] 2.3 通过 `pageBuilderWorkspaceHtmlService.mutate(...)` 接入统一 HTML mutation pipeline，并返回 manifest、validation 与 preview state 摘要

## 3. CMS Runtime Tool Surface

- [x] 3.1 修改 `apps/app/src/main/lib/cms-sdk-tools.ts`，在 page-builder 会话中注册 `mcp__cms__apply_cms_binding` 并与查询工具一起受控暴露
- [x] 3.2 为 apply tool 保持宿主管理边界，避免向模型暴露鉴权材料、绝对路径或其他宿主内部上下文，并提供稳定脱敏错误

## 4. Skill And Verification

- [x] 4.1 更新 `apps/app/default-skills/cms-binding-apply/SKILL.md` 及其 references，使 `ready` 路径改为调用正式工具而不是直接编辑工作区文件
- [x] 4.2 补充回归测试，覆盖 CMS tool 注册、selector/block-id 护栏、结构化 apply 结果，以及固定内容 ID 输入返回 `incompatible`
