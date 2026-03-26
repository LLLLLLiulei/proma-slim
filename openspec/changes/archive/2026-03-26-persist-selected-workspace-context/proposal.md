## Why

当前前端把“侧边栏选中的工作区”和“当前激活会话 / 页签所属工作区”部分混用，并且只依赖浏览器本地 `localStorage` 恢复工作区上下文。这会导致刷新页面、浏览器本地状态缺失 / 失效或切换浏览器后，当前工作区上下文发生漂移，进而让侧边栏过滤范围和新会话默认归属落到错误工作区。

## What Changes

- 将“当前选中的工作区”定义为独立的权威 UI 上下文，用于侧边栏过滤、后续新会话默认归属和工作区能力读取
- 将当前工作区选择从浏览器本地临时状态提升为后端持久化的 UI 偏好，使刷新页面和切换浏览器后仍可恢复同一工作区上下文
- 移除活动会话 / 页签对当前工作区的隐式回写，保持“当前查看的会话”和“当前选中的工作区”彻底解耦
- 为旧版仅依赖 `localStorage` 的状态增加一次性迁移路径，并统一缺失 / 失效工作区时的 fallback 规则
- 保留会话页签恢复为浏览器本地视图状态，不将其提升为跨浏览器共享的权威上下文

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `ui-layout`: 当前工作区上下文的恢复、持久化和页签解耦规则需要改为稳定且浏览器无关的行为
- `session-management`: 新会话继承当前工作区的语义需要基于权威的已选工作区上下文，而不是浏览器本地残留的会话 / 页签状态

## Impact

- Affected code:
  - `apps/app/src/renderer/atoms/agent-atoms.ts`
  - `apps/app/src/renderer/atoms/session-tabs.ts`
  - `apps/app/src/renderer/components/app-shell/LeftSidebar.tsx`
  - `apps/app/src/renderer/components/app-shell/MainContentPanel.tsx`
  - renderer tests covering workspace selection, session tabs, and session creation defaults
  - `apps/app/src/main/http/routes/settings.ts`
  - `apps/app/src/main/lib/settings-service.ts`
- Affected systems:
  - renderer workspace selection restore and persistence flow
  - backend settings / UI preference persistence
  - browser refresh and cross-browser workspace context recovery
- Out of scope:
  - making open tabs or active session browser-independent
  - changing session `workspaceId` storage semantics
  - changing theme persistence behavior
