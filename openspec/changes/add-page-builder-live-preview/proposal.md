## Why

`page-builder` 目前只有预览容器外壳，用户在对话中生成或修改网页后，无法在构建页内看到真实结果，也无法形成“描述需求 -> 看到页面 -> 继续迭代”的闭环。现在需要把工作区级 `workspace-files` 真正接入为可访问的静态预览，并在文件变化后自动刷新，以让 `page-builder` 具备可用的实时构建体验。

## What Changes

- 为 `page-builder` 新增工作区级实时预览能力，将 `workspace-files` 作为静态网页产物目录接入 builder 左侧预览区。
- 为工作区新增预览访问与预览状态查询能力，使前端能够获取当前预览入口并检测 `workspace-files` 是否发生变化。
- 更新 builder 页，使其不再停留在占位 iframe，而是加载真实预览地址，并在预览版本变化时自动刷新页面。
- 为 page-builder 创建的工作区根目录初始化 `CLAUDE.md`，以工作区级持久指令约束可预览网页产物写入 `workspace-files/index.html` 及其相关静态资源目录，而不是散落在 session 工作目录中。

## Capabilities

### New Capabilities
- `page-builder-live-preview`: 为 `page-builder` 提供基于 `workspace-files` 的工作区级静态网页预览、预览状态感知和自动刷新体验。

### Modified Capabilities
- None.

## Impact

- 影响 `apps/app` 的工作区 HTTP 路由与静态文件服务，需要新增面向工作区预览的访问与状态查询接口。
- 影响 `apps/page-builder` 的 builder 页面和预览面板，需要接入真实 `previewUrl` 并在预览状态变化时自动刷新 iframe。
- 影响 page-builder 项目创建流程与工作区初始化逻辑，需要为 page-builder 创建的工作区写入根目录 `CLAUDE.md`，统一产物落点到 `workspace-files`。
- 不引入新的独立预览运行时，继续复用现有工作区、会话、Bun HTTP 服务和前端 builder 壳。
