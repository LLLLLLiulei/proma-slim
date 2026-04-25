## 1. Workspace setup

- [x] 1.1 新增 `packages/cms-vue-islands-demo` 目录、`package.json`、`tsconfig.json` 和基础 README
- [x] 1.2 更新根 `package.json` 与 `pnpm-workspace.yaml`，将 demo package 显式纳入 workspace
- [x] 1.3 为 demo package 配置 `dev` 与 `export` 脚本，并加入所需的本地 Vue / SSR / HTML 解析依赖

## 2. Shared runtime and CMS components

- [x] 2.1 实现共享 `CmsRuntimeClient` 接口、browser/server 两种 client 和 mock CMS 数据模型
- [x] 2.2 实现 `cms-catalog` 与 `cms-content` 两个内置数据组件，统一输出 slot scope
- [x] 2.3 实现 catalog/content 的 ViewModel 映射与通用工具，确保 preview 和 export 共用同一语义层

## 3. Preview CSR islands demo

- [x] 3.1 实现本地 mock CMS HTTP 接口和最小 preview server，用于返回示例页面与 mock 数据
- [x] 3.2 实现 preview HTML 注入逻辑，向作者页面注入 Vue full build、bootstrap 脚本和运行时配置
- [x] 3.3 实现 islands bootstrap，扫描 `cms-catalog` / `cms-content`，逐岛挂载并在浏览器中渲染 mock CMS 数据

## 4. Export SSR staticization demo

- [x] 4.1 实现 island 模板编译和逐岛 SSR 渲染逻辑，支持从作者 HTML 中提取并替换 `cms-*` 节点
- [x] 4.2 实现 export 命令，将 `demo-pages/*.html` 渲染为不依赖 Vue runtime 的静态 HTML 输出到 `dist-demo/export`
- [x] 4.3 确保 export 与 preview 共享同一作者模板来源和运行时抽象，并验证导出结果不再依赖浏览器端 CMS 请求

## 5. Demo pages and verification

- [x] 5.1 新增至少三个示例页面：`cms-catalog`、`cms-content`、普通 HTML 与 islands 混排页面
- [x] 5.2 准备覆盖基础导航、内容列表、无图或空结果等分支的 mock CMS 数据集
- [x] 5.3 完善 README 与验证说明，明确如何运行 preview、执行 export，并对比作者源码、preview 结果和 export 产物
