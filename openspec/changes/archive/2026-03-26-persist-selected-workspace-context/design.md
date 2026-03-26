## Context

当前 renderer 侧对“当前工作区”的恢复依赖两个来源：

- `currentAgentWorkspaceIdAtom` 里的浏览器本地 `localStorage`
- 当前恢复出来的 `currentSessionId` / `activeTabId` 对应会话的 `workspaceId`

这导致系统在运行时和冷启动时分别出现两类状态污染：

- 运行时切换页签会把活动会话的 `workspaceId` 回写成“当前工作区”
- 冷启动时若 `proma-current-agent-workspace-id` 缺失或失效，又会退回到当前会话的 `workspaceId`

这两条路径都违背了已有产品语义：侧边栏当前工作区应服务于侧边栏过滤、后续新会话默认归属和工作区能力读取，而不是当前活动会话的派生值。

本地后端已经有可复用的 `AppSettings.agentWorkspaceId` 字段，但当前 renderer 并未使用；这意味着“浏览器无关的当前工作区持久化”所需的数据模型已经存在，只是尚未接入。

## Goals / Non-Goals

**Goals:**
- 让 `selectedWorkspaceId` 成为唯一权威的当前工作区上下文
- 将当前工作区选择持久化到后端 settings，使刷新页面和切换浏览器都能恢复同一工作区
- 保留会话页签为浏览器本地视图状态，但禁止其反向覆盖当前工作区
- 为旧版仅依赖浏览器 `localStorage` 的状态增加一次性迁移路径
- 统一“工作区缺失 / 无效”时的 fallback 规则

**Non-Goals:**
- 不让 open tabs 或 active session 成为跨浏览器共享状态
- 不改变会话自身 `workspaceId` 的持久化与迁移规则
- 不修改主题、本地通知等其他 settings 项的持久化方式
- 不重构整个 settings API，只在现有 `/api/settings` 上扩展当前工作区读写

## Decisions

### 1. 使用 `AppSettings.agentWorkspaceId` 作为权威的当前工作区持久化字段

renderer 在初始化时改为从 `/api/settings` 读取 `agentWorkspaceId`，并将其视为当前工作区的唯一长期来源。用户切换工作区后，renderer 立即 PATCH `/api/settings` 更新该字段。

选择这个方案而不是继续依赖 `localStorage` 的原因：

- `localStorage` 天然以浏览器为边界，无法提供浏览器无关的工作区恢复
- 后端 settings 已经存在同名字段，无需引入新的存储文件或新接口
- 工作区上下文本质上是“本地运行时偏好”，比 tab 布局更适合作为后端持久化状态

备选方案：

- 继续使用 `localStorage`，只修复回写 bug
  - 被否决：无法解决切换浏览器后的语义漂移
- 新建独立的 UI preference 文件
  - 被否决：与现有 settings 能力重复，增加不必要的存储面

### 2. 将当前工作区恢复分为“权威恢复、一次性迁移、确定性 fallback”三层

初始化顺序调整为：

1. 加载 sessions、workspaces、settings
2. 恢复浏览器本地的 session tabs / active tab / current session
3. 解析当前工作区：
   - 若 `settings.agentWorkspaceId` 有效，直接使用
   - 若 `settings.agentWorkspaceId` 存在但无效，使用统一 fallback，并写回 settings
   - 若 `settings.agentWorkspaceId` 缺失：
     - 先尝试读取旧版 `proma-current-agent-workspace-id`
     - 若旧 key 不存在，再尝试用恢复出的 `currentSessionId -> workspaceId` 做一次性迁移
     - 若仍不可用，则使用统一 fallback
   - 所有迁移 / fallback 得到的有效 workspace id 都立即写回 settings

这样做的原因：

- “缺失”和“失效”代表不同语义
- 只允许在明确迁移场景下从当前会话借用 `workspaceId`
- 一旦完成迁移，后续恢复不再受旧浏览器本地状态干扰

备选方案：

- 完全删除迁移逻辑，缺失时一律 fallback
  - 被否决：对旧用户升级不够平滑
- 保留长期的 `currentSessionId -> workspaceId` 回退
  - 被否决：会把残余耦合永久保留下来

### 3. 会话页签保留浏览器本地状态，但不再承载工作区语义

`sessionTabsAtom`、`activeSessionTabIdAtom`、`currentAgentSessionIdAtom` 继续作为 renderer 本地视图状态存在；`currentAgentWorkspaceIdAtom` 则改为普通 atom，由初始化请求和设置更新驱动。

同时调整与 tab 相关的 helper 契约：

- `resolveSessionSelection()` 不再返回 `workspaceId`
- `MainContentPanel` 与 `LeftSidebar` 的 tab 同步只更新 session 相关状态
- 所有“当前工作区”的恢复和变化都只通过 settings + sidebar selection flow 完成

这样做的原因：

- tab 是视图层状态，浏览器本地持久化合理
- 当前工作区是业务上下文，必须和 tab 解耦
- helper 层若继续暴露 `{ sessionId, workspaceId }`，后续代码仍会被误导成“活动 tab 决定当前工作区”

### 4. 统一 fallback 规则为“默认工作区优先，否则首个可用工作区”

当前删除工作区后的 fallback 已经采用“默认工作区优先”的逻辑，初始化恢复也改为复用同一规则。这样可以消除“删除场景”和“启动场景”行为不一致的问题。

备选方案：

- 启动时优先当前会话工作区，删除时优先默认工作区
  - 被否决：同一概念存在两套恢复规则，用户和代码都难以预测

### 5. 工作区切换采用乐观更新 + 持久化失败回滚

用户在侧边栏切换工作区时，renderer 先更新当前工作区 atom 以保持界面即时响应，再发起 settings PATCH。若写入失败，则回滚到上一个已保存的工作区并提示错误。

这样做的原因：

- 切换工作区是高频 UI 操作，不能阻塞等待持久化
- settings 写入失败时若不回滚，会使当前浏览器状态与权威存储分叉

## Risks / Trade-offs

- [初始化期间需要额外读取 settings] → 通过与 sessions / workspaces 并行请求，并继续使用“恢复完成前禁用新会话按钮”的现有保护来控制体验
- [乐观更新后写入失败会带来一次 UI 回跳] → 仅在本地文件写入失败等异常情况下发生，并通过 toast 明确提示
- [一次性迁移规则处理不当会把旧错误状态永久写回 settings] → 仅在 `settings.agentWorkspaceId` 缺失时才允许迁移，并对迁移结果做 workspaces 有效性校验
- [旧测试仍默认 tab 选择会携带 workspace 语义] → 同步收紧 helper 契约与测试，避免残留误导

## Migration Plan

1. 扩展 renderer 对 `/api/settings` 的读取和更新调用，接入 `agentWorkspaceId`
2. 将 `currentAgentWorkspaceIdAtom` 从 `atomWithStorage` 改为普通 atom，并重写初始化恢复流程
3. 加入旧 `localStorage` key 与旧 current-session-based restore 的一次性迁移逻辑
4. 清理 tab helper 中与 workspace selection 耦合的返回值和同步逻辑
5. 增加单元测试和 Playwright 回归测试覆盖刷新、跨浏览器、无效 persisted workspace 等场景

回滚策略：

- 若本次改动需要回退，后端 `settings.json` 中新增 / 使用的 `agentWorkspaceId` 字段可被旧版本安全忽略
- 浏览器本地旧 key 保持只读迁移来源，即使回滚也不会破坏现有数据

## Open Questions

- None
