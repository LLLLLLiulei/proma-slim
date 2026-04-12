## Why

当前仓库已经通过 `packages/cms-vue-islands-demo` 验证了 HTML-first 的 CMS 组件、浏览器端 islands 挂载和导出期 SSR 静态化链路可行，但这些能力仍停留在 demo 包内部，尚未沉淀为可被 page-builder 正式预览、静态导出和后续工具链复用的共享核心层。现在需要先提炼一个独立的 `page-builder-cms-rendering` 核心包，稳定运行时契约、ViewModel、内置组件和模板基础设施，避免后续 preview、export、manifest 和 apply tool 各自复制一套实现。

## What Changes

- 新增一个共享 workspace package：`packages/page-builder-cms-rendering`，作为 CMS 渲染能力的核心模块入口。
- 将 demo 中已验证的运行时契约、浏览器端 CMS client、`cms-catalog` / `cms-content` 内置组件、slot 渲染辅助和模板编译能力提炼为正式共享模块。
- 在核心包中引入显式的 ViewModel 映射层，使组件依赖归一化 CMS 数据契约，再映射为稳定 slot scope 字段，而不是直接复用 demo 的 mock 专用返回结构。
- 新增共享的 template 扫描基础设施，统一 `cms-*` 节点识别与模板编译入口，为后续 preview 注入、SSR 渲染和 manifest 扫描提供同一套基础能力。
- 更新根工作区配置，将新核心包纳入 workspace，并为其引入所需的 Vue 模板编译与 SSR 依赖。

## Capabilities

### New Capabilities
- `page-builder-cms-rendering-core`: 提供 page-builder CMS 渲染链路的共享核心能力，包括运行时契约、ViewModel、内置 CMS 组件和模板扫描/编译基础设施。

### Modified Capabilities
- None.

## Impact

- 新增 `packages/page-builder-cms-rendering/` 共享 package 及其源码结构。
- 修改根 `package.json` 与 `pnpm-workspace.yaml`，将新核心包加入 workspace。
- 为新核心包引入 `vue`、`@vue/compiler-dom`、`@vue/server-renderer` 等运行时与模板编译依赖。
- 后续 `page-builder` preview、offline static export、CMS apply tool 等能力将改为依赖该共享核心包，而不是继续直接引用 demo 实现。
