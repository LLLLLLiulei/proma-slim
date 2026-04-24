## 1. Builder Scene Routing

- [x] 1.1 在 Builder 发送准备阶段基于宿主结构化上下文实现 `ordinary-page-flow`、`existing-cms-region-ordinary-edit`、`confirmed-cms-apply` 三类 scene 分类，并避免回退到消息正则/关键词主导分流
- [x] 1.2 建立 host-owned owner 映射：`ordinary-page-flow` 与 `existing-cms-region-ordinary-edit` 都映射到 `page-builder-guided-generation`，`confirmed-cms-apply` 映射到 `cms-binding-apply`
- [x] 1.3 按 scene 只注入一个 owner-controller，并通过 bootstrapped prompt 与 turn routing metadata 锁定当前 owner；owner 切换必须改为宿主 handoff / 新 turn
- [x] 1.4 增加运行时 guardrail，只拦截同一 turn 内 `owner-controller -> owner-controller` 的越权切换，不拦截 discussion / consult / execute 型二级 skill 调用

## 2. Prompt And Skill Alignment

- [x] 2.1 更新 page-builder 根级 `CLAUDE.md` 模板，明确工作区硬边界、scene routing、owner / consult / discussion / execute 角色分层，以及 owner 变化必须由宿主 handoff
- [x] 2.2 更新 `page-builder-guided-generation`，使其承接 ordinary create / iterate / repair / redo / selected-block follow-up / existing CMS region ordinary edit，并按需 consult `page-builder-cms-region-authoring-guidance`
- [x] 2.3 更新 `page-builder-guided-generation` 的 visual worker 调度规则：`taste-skill` 负责首轮整页生成与首轮 block 级明显视觉重设计，`redesign-skill` 只负责第二阶段提质 / 升级 / 精修
- [x] 2.4 更新 `page-builder-cms-region-authoring-guidance` 与 `brainstorming` 的 description / contract，使其分别对齐 consult-only 与 discussion-only 角色，不再作为 page-builder 普通 turn 的 owner 候选
- [x] 2.5 更新 `taste-skill`、`redesign-skill`、`soft-skill` 的 page-builder 暴露语义：前两者对齐 execute-only canonical workers，`soft-skill` 退出 page-builder 默认竞争面

## 3. CMS Layering And Selection Continuity

- [x] 3.1 调整 prompt layering，把 page-level CMS notice 与 explicit target 命中的 target-scoped digest / consult guidance 分层；当前页面仅含 CMS 但未命中 target 时只注入 advisory notice
- [x] 3.2 保持 explicit existing CMS region ordinary edit 仍由 ordinary owner 主控，但要求 binding identity 变更一律升级回 confirmed CMS browser / handoff / decision / apply 流程
- [x] 3.3 移除 selection-based 局部任务的隐藏 follow-up target continuity；发送阶段只依据当前显式选区与 workflow 状态决定是否附着 `targetSelection`
- [x] 3.4 校准普通页面、含 CMS 但未命中 target 页面、explicit existing CMS target 页面与 confirmed CMS apply 页面四类场景的提示词注入噪音与 secondary surfacing

## 4. Regression Coverage

- [x] 4.1 增加或更新测试，覆盖 host-owned scene 分类、owner 映射与单 turn owner lock
- [x] 4.2 增加或更新测试，覆盖 explicit existing CMS target ordinary edit 的 consult-only guidance 链路，以及 confirmed CMS apply 继续独占 owner-controller
- [x] 4.3 增加或更新测试，覆盖 `brainstorming` 不再抢 ordinary owner、`taste-skill` 作为首轮整页 / block redesign worker、`redesign-skill` 作为第二阶段提质 worker
- [x] 4.4 增加或更新测试，覆盖发送后不再隐式保留旧 target、后续 turn 仅依赖当前显式选区、以及宿主不再根据自由文本猜测 target continuity
