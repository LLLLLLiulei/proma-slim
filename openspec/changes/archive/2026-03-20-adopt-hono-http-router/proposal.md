## Why

当前 Electron main 进程的 HTTP 层已经承载会话 CRUD、工作区 API、SSE 推流和静态文件回退，但 [apps/electron/src/main/http-router.ts](/Users/liu/Documents/work/learning/Proma/apps/electron/src/main/http-router.ts) 仍然采用单文件 `if`/正则分发。随着工作区和会话接口扩展，这种实现已经把路由匹配、资源预加载、业务编排、SSE 响应和静态文件处理耦合在一起，后续继续演进会明显放大维护成本和回归风险。

现在需要在不改变现有 API 能力边界的前提下，把 HTTP 层迁移到 Hono 驱动的模块化路由结构，让服务启动、路由分组、中间件和错误处理有稳定边界，并为后续继续扩展 REST API 留出空间。

## What Changes

- 将 Electron main 进程的 HTTP router 从手写 `if`/正则分发迁移为 Hono 应用，继续由 `Bun.serve()` 承载运行时入口。
- 按资源域拆分会话、工作区、状态和用户资料等路由模块，去掉单文件集中分发。
- 引入 Hono 中间件来承接统一错误映射、会话/工作区资源预加载和 API/静态资源边界处理。
- 保持现有 REST 路径、SSE 交互模型和静态资源回退行为不变，避免影响 renderer 侧调用方式。
- 新增 `hono` 运行时依赖，并调整主进程测试，使其直接验证 Hono app 的请求处理行为。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `web-server`: 后端 HTTP 服务的路由组织方式和错误处理边界将升级为 Hono 驱动的模块化结构，同时保持既有 API 和 SSE 行为不变。

## Impact

- Affected code: `apps/electron/src/main/http-server.ts`, `apps/electron/src/main/http-router.ts`, `apps/electron/src/main/http-router.test.ts`, new `apps/electron/src/main/http/**` modules, `apps/electron/package.json`
- Affected systems: Bun HTTP service bootstrap, REST route dispatch, SSE send flow, production static file fallback, main-process route tests
- Dependencies: add `hono`
- Verification: targeted Bun tests for HTTP routes, full `bun test`, `bun run --filter='@proma/electron' typecheck`
