## Why

PageBuilder 已具备从当前项目另存为用户模板的后端能力，但 Builder 页面还没有入口让用户触发该能力。为了让模板库一期形成“当前项目另存模板 → 首页模板库消费”的闭环，需要在 Builder 页面补齐另存模板 UI。

## What Changes

- 在 Builder 页面顶部项目标题区域或相近操作区增加“另存模板”入口。
- 新增另存模板表单，仅支持填写模板名称，名称必填。
- 扩展 renderer API client，调用 `POST /api/workspaces/:workspaceId/page-builder/templates`。
- 另存请求必须携带当前 PageBuilder 编辑锁凭证；无编辑权限、编辑锁失效或 Agent 正在写入时不得继续提交。
- CMS 集成 Builder 中打开另存表单时提示：当前 CMS 数据会被固化为静态模板，模板不保留 CMS 动态绑定或鉴权信息。
- 保存成功后通过 toast 提示“可在首页模板库查看”；保存失败时展示后端返回的可读错误。
- 不改变后端模板生成、模板目录结构、首页模板库、使用模板创建项目或删除模板行为。

## Capabilities

### New Capabilities

- `page-builder-save-template-ui`: 定义 Builder 页面“另存模板”入口、表单、编辑锁、CMS 固化提示、提交状态和错误展示要求。

### Modified Capabilities

- 无。

## Impact

- 前端 API：扩展 `apps/app/src/renderer/lib/api.ts`，新增另存模板 API wrapper。
- Builder 页面：调整 `apps/page-builder/src/renderer/pages/BuilderPage.tsx` 的状态与提交流程。
- Builder 组件：扩展 `ProjectTitleBar` 操作区，并新增或复用另存模板对话框组件。
- 测试：补充 API client、BuilderPage、ProjectTitleBar 和另存模板表单相关测试。
- 后端 API：仅消费已存在的 `POST /api/workspaces/:workspaceId/page-builder/templates`，本 change 不修改其语义。
