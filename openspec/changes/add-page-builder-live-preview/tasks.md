## 1. Workspace Preview Backend

- [x] 1.1 为工作区路由新增 `preview-state` 接口，返回 `hasPreview`、`revision` 和 `entryUrl`
- [x] 1.2 为工作区路由新增 `preview/*` 静态预览入口，并将 `workspace-files` 作为站点根目录解析 `index.html` 和相对资源
- [x] 1.3 为工作区预览补充路径安全、入口缺失、资源访问和 revision 变化的后端测试

## 2. Builder Preview Integration

- [x] 2.1 在 `apps/page-builder` 中新增预览状态读取能力，并为 builder 页面接入当前工作区的 `preview-state`
- [x] 2.2 在 builder 页面实现预览状态轮询、revision 对比和自动刷新逻辑，将真实 `previewUrl` 传给 `PreviewPane`
- [x] 2.3 更新 `PreviewPane` 的空状态、刷新行为和 iframe 配置，使其支持真实预览地址、revision cache-busting 和受限 `sandbox`
- [x] 2.4 为 builder 预览状态切换、自动刷新和空状态回退补充前端测试

## 3. Page-Builder Workspace Instructions

- [x] 3.1 为 page-builder 创建的工作区根目录新增 `CLAUDE.md` 初始化能力，固化网页预览产物约束
- [x] 3.2 在 page-builder 创建项目时初始化 `CLAUDE.md`，明确要求页面入口写入 `workspace-files/index.html` 且静态资源落到 `workspace-files` 相对目录
- [x] 3.3 为通用工作区与 page-builder 创建工作区的差异补充测试，确保 `CLAUDE.md` 只写入 page-builder 创建工作区，且 builder 不改写可见用户消息

## 4. Verification

- [x] 4.1 端到端验证工作区首次生成预览、后续修改预览和删除入口后的 builder 表现
- [x] 4.2 运行相关测试与类型检查，确认 `apps/app` 和 `apps/page-builder` 现有行为未被破坏
