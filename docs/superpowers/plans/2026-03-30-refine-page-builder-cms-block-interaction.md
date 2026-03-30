# Page Builder CMS Block Interaction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 page-builder 的手动 CMS 入口迁移到预览区已选区块下方，并在确认 CMS 数据后自动发起区块修改，同时仅在明显不匹配时触发最小必要确认。

**Architecture:** 继续复用现有 `PageBuilderCmsPickerModal`、隐藏上下文注入、Agent 发送链路与 `RequestCmsSelection`。新增轻量的区块级浮动操作条，并在 `BuilderPage` 中集中编排区块状态、CMS 选择器、自动发送与追问分支，避免把业务状态塞进 `PreviewPane` 纯展示组件。

**Tech Stack:** React, TypeScript, Jotai, Bun test, react-test-renderer, OpenSpec workflow

---

## Chunk 1: Block-scoped entry

### Task 1: 迁移手动 CMS 主入口到区块操作条

**Files:**
- Create: `apps/page-builder/src/renderer/components/builder/PageBuilderBlockActionBar.tsx`
- Test: `apps/page-builder/src/renderer/components/builder/PageBuilderBlockActionBar.test.tsx`
- Modify: `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`
- Modify: `apps/page-builder/src/renderer/components/builder/PreviewPane.test.tsx`
- Modify: `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
- Modify: `apps/page-builder/src/renderer/pages/BuilderPage.test.tsx`

- [ ] **Step 1: 写失败测试，证明聊天区不再暴露手动 `从 CMS 选择` 按钮**

Run: `bun test apps/page-builder/src/renderer/pages/BuilderPage.test.tsx -t "does not expose a manual CMS picker action in the composer once block actions are enabled"`
Expected: FAIL because composer still renders the old CMS action.

- [ ] **Step 2: 写失败测试，证明选中区块后会出现唯一的区块浮动操作条**

Run: `bun test apps/page-builder/src/renderer/components/builder/PreviewPane.test.tsx -t "renders a single block action bar for the selected block"`
Expected: FAIL because `PreviewPane` has no block action bar yet.

- [ ] **Step 3: 最小实现区块操作条组件与 `PreviewPane` 渲染**

实现要点：
- `PageBuilderBlockActionBar` 只负责渲染样式、按钮、忙碌态和回调。
- `PreviewPane` 接收当前已选 selector、标签、浮动条状态和点击回调。
- 保持预览工具栏、iframe 与选择桥接逻辑不回退。

- [ ] **Step 4: 在 `BuilderPage` 移除聊天区手动 CMS 入口，并把手动入口迁移到选区操作条**

实现要点：
- `composerLeadingActions` 只保留现有选区按钮。
- `selectedSelector` 存在时，向 `PreviewPane` 传递区块操作条状态与打开选择器回调。
- 选区清空、刷新、重载时同步隐藏操作条。

- [ ] **Step 5: 运行入口迁移相关测试**

Run: `bun test apps/page-builder/src/renderer/pages/BuilderPage.test.tsx apps/page-builder/src/renderer/components/builder/PreviewPane.test.tsx`
Expected: PASS

## Chunk 2: Shared picker orchestration

### Task 2: 复用共享 CMS 选择器并补齐 block-bound framing

**Files:**
- Modify: `apps/page-builder/src/renderer/components/builder/PageBuilderCmsPickerModal.tsx`
- Modify: `apps/page-builder/src/renderer/components/builder/PageBuilderCmsPickerModal.test.tsx`
- Modify: `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
- Modify: `apps/page-builder/src/renderer/pages/BuilderPage.test.tsx`

- [ ] **Step 1: 写失败测试，证明区块操作条打开的是 block-bound 手动模式**

Run: `bun test apps/page-builder/src/renderer/pages/BuilderPage.test.tsx -t "opens the shared CMS picker from the selected block action bar"`
Expected: FAIL because manual mode still hangs off the composer and lacks block framing.

- [ ] **Step 2: 写失败测试，证明 Agent 自然语言触发仍然默认沿用当前已选区块**

Run: `bun test apps/page-builder/src/renderer/pages/BuilderPage.test.tsx -t "keeps agent-requested CMS picker aligned to the current selected block"`
Expected: FAIL if request framing does not reflect the selected block fallback.

- [ ] **Step 3: 最小实现 block-bound 手动模式的标题、说明与默认目标语义**

实现要点：
- 为 `PageBuilderCmsPickerModal` 增加手动区块模式所需的 title/description framing。
- 优先复用现有 `request.selector` / `presentationHint` 协议；手动模式通过显式 props 补充上下文，不复制 modal 内部逻辑。

- [ ] **Step 4: 在 `BuilderPage` 打通“区块操作条 -> 共享选择器”的打开、取消和选区保持**

实现要点：
- 手动取消时保留当前选区。
- Agent 请求仍优先走现有 `activeCmsRequest`。
- 若当前存在 `selectedSelector`，自然语言触发的 request 使用该 selector 作为默认目标。

- [ ] **Step 5: 运行共享选择器相关测试**

Run: `bun test apps/page-builder/src/renderer/components/builder/PageBuilderCmsPickerModal.test.tsx apps/page-builder/src/renderer/pages/BuilderPage.test.tsx`
Expected: PASS

## Chunk 3: Auto-apply and clarification

### Task 3: 为区块级 CMS 选择增加自动应用与最小确认

**Files:**
- Create: `apps/page-builder/src/renderer/lib/page-builder-cms-auto-apply.ts`
- Test: `apps/page-builder/src/renderer/lib/page-builder-cms-auto-apply.test.ts`
- Modify: `apps/page-builder/src/renderer/lib/preview-selection.ts`
- Modify: `apps/page-builder/src/renderer/lib/preview-selection.test.ts`
- Modify: `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
- Modify: `apps/page-builder/src/renderer/pages/BuilderPage.test.tsx`
- Modify: `apps/app/src/renderer/components/agent/AgentView.tsx`
- Modify: `apps/app/src/renderer/components/agent/AgentView.render.test.tsx`

- [ ] **Step 1: 写失败测试，证明区块级 CMS 确认后会自动发送而不是等待用户补充输入**

Run: `bun test apps/page-builder/src/renderer/pages/BuilderPage.test.tsx -t "auto-sends a visible system message after confirming CMS data for a selected block"`
Expected: FAIL because current implementation only stores `pendingCmsSelection`.

- [ ] **Step 2: 写失败测试，证明系统代发消息对用户可见，但隐藏上下文仍只进入发送 payload**

Run: `bun test apps/app/src/renderer/components/agent/AgentView.render.test.tsx -t "can send a programmatic visible user message with hidden decorated payload"`
Expected: FAIL because `AgentView` currently lacks a programmatic send hook.

- [ ] **Step 3: 写失败测试，证明明显不匹配时不会直接自动执行**

Run: `bun test apps/page-builder/src/renderer/lib/page-builder-cms-auto-apply.test.ts -t "marks a selected block and CMS source as needing clarification when the match is unsafe"`
Expected: FAIL because helper does not exist yet.

- [ ] **Step 4: 最小实现自动应用 helper、系统代发消息和程序化发送入口**

实现要点：
- 抽离 `shouldAskForCmsClarification` / `buildAutoApplyMessage` 一类纯函数，便于测试。
- `BuilderPage` 通过 `useGlobalAgentListeners().sendMessage` 复用现有 SSE 链路自动发送。
- 用户可见消息使用产品文案；隐藏上下文继续由 `decoratePageBuilderMessage` 生成。
- 自动发送成功后清空选区与瞬时 CMS 状态；失败时保留当前选区便于重试。

- [ ] **Step 5: 最小实现不匹配分支与确认后继续执行**

实现要点：
- 第一版只覆盖明显冲突：例如导航/栏目列表 vs 单内容、单内容展示区 vs 列表型数据。
- 仅在命中冲突时通过现有 `AskUserQuestion` 链路追问。
- 用户确认后继续复用同一自动应用发送函数。

- [ ] **Step 6: 运行自动应用与追问测试**

Run: `bun test apps/page-builder/src/renderer/lib/page-builder-cms-auto-apply.test.ts apps/page-builder/src/renderer/lib/preview-selection.test.ts apps/page-builder/src/renderer/pages/BuilderPage.test.tsx apps/app/src/renderer/components/agent/AgentView.render.test.tsx`
Expected: PASS

## Chunk 4: OpenSpec completion

### Task 4: 回填 OpenSpec 任务并做回归

**Files:**
- Modify: `openspec/changes/refine-page-builder-cms-block-interaction/tasks.md`

- [ ] **Step 1: 对照实现逐项勾选已完成任务**

要求：
- 每完成一组行为后立即回填对应 checkbox。
- 不跳过验证组任务。

- [ ] **Step 2: 运行最终回归测试**

Run: `bun test apps/page-builder/src/renderer/components/builder/PageBuilderCmsPickerModal.test.tsx apps/page-builder/src/renderer/components/builder/PreviewPane.test.tsx apps/page-builder/src/renderer/lib/page-builder-cms-auto-apply.test.ts apps/page-builder/src/renderer/lib/preview-selection.test.ts apps/page-builder/src/renderer/pages/BuilderPage.test.tsx apps/app/src/renderer/components/agent/AgentView.render.test.tsx`
Expected: PASS

- [ ] **Step 3: 自查残留状态与文案**

检查：
- 聊天区不再出现手动 `从 CMS 选择`
- 取消后保持选区
- 自动发送失败不误清空选区
- 无 selector / 无匹配时走最小确认而不是静默失败
