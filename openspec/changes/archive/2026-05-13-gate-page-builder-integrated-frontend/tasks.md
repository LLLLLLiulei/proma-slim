## 1. API Client 与类型

- [x] 1.1 在共享 renderer API client 中新增 CMS integration status 类型和 `getCmsIntegrationStatus()` 方法。
- [x] 1.2 在共享 renderer API client 中新增 CMS builder context 类型和 `getCmsBuilderContext(workspaceId, sessionId)` 方法。
- [x] 1.3 确认新增 CMS integration API 方法继续使用逻辑 `/api/...` 路径，并通过现有 public base path 解析生效。
- [x] 1.4 补充 API client 单元测试，覆盖 status、builder context 和 base path 下 URL 解析。

## 2. HomePage CMS 集成门控

- [x] 2.1 为 HomePage 增加 integration status 初始加载状态，status 完成前不挂载 standalone 首页创建区和历史区。
- [x] 2.2 CMS 集成模式下 HomePage 展示“请从 CMS 系统进入 PageBuilder”的受限入口提示。
- [x] 2.3 CMS 集成模式下 HomePage 不展示 prompt 输入框、创建按钮、recoverable retry 或 `PageBuilderHistorySection`。
- [x] 2.4 status 请求失败时 HomePage 按 fail-closed 展示服务暂不可用和重试入口，不回退 standalone。
- [x] 2.5 保持 standalone 模式首页创建 workspace/session、写入 bootstrap cache、跳转 builder 和历史区展示行为不变。
- [x] 2.6 补充 HomePage 单元测试，验证 CMS 模式不请求历史列表、不创建本地项目，并验证 standalone 回归。

## 3. BuilderPage CMS 集成门控

- [x] 3.1 重构 BuilderPage runtime loader，先读取 integration status，再分支执行 standalone load path 或 CMS load path。
- [x] 3.2 standalone load path 保持现有 `listSessions + listWorkspaces + resolveBuilderContext + bootstrap cache` 行为。
- [x] 3.3 CMS load path 使用 builder context 作为首个项目上下文请求，不先请求 `/api/sessions` 或 `/api/workspaces`。
- [x] 3.4 builder context 成功后，用返回的 workspace/session 初始化 Jotai workspace/session 状态，并将 CMS 模式初始消息固定为 `null`。
- [x] 3.5 builder context 成功后再获取或续约 edit lock，并再允许挂载 AgentView、PreviewPane、CMS browser、preview polling 和项目编辑操作。
- [x] 3.6 builder context 失败时显示“访问已失效，请从 CMS 系统重新进入 PageBuilder”，并阻止 messages、preview-state、workspace context、edit-lock 或项目编辑 API 请求。
- [x] 3.7 status 请求失败时 BuilderPage 按 fail-closed 展示服务暂不可用和重试入口，不回退 standalone。
- [x] 3.8 调整 BuilderPage 错误页动作，使 CMS 集成访问失效场景以“从 CMS 重新进入”和重试为主，不把返回首页作为主要恢复路径。

## 4. 验证

- [x] 4.1 补充 BuilderPage 单元测试，覆盖 CMS 模式 builder context-first、成功后初始化状态、失败后不挂载项目 UI、不获取 edit lock。
- [x] 4.2 补充 BuilderPage 单元测试，覆盖 status fail-closed 和 standalone 行为回归。
- [x] 4.3 运行相关 renderer 单元测试：API client、HomePage、BuilderPage、builder-context helper。
- [x] 4.4 运行相关 typecheck，确认新增前端类型和 Jotai 初始化逻辑无类型错误。
- [x] 4.5 运行 `openspec validate gate-page-builder-integrated-frontend --strict`。
