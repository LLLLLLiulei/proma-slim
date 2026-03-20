## Context

当前 HTTP 服务由 [apps/electron/src/main/http-server.ts](/Users/liu/Documents/work/learning/Proma/apps/electron/src/main/http-server.ts) 启动 `Bun.serve()`，但几乎所有协议层职责都集中在 [apps/electron/src/main/http-router.ts](/Users/liu/Documents/work/learning/Proma/apps/electron/src/main/http-router.ts) 中。这个文件同时处理 REST 路由匹配、JSON 请求体解析、会话和工作区资源查找、SSE 响应构造、静态文件回退和错误映射，已经形成“一个文件承接整个 HTTP 边界”的结构。

当前主链还有几个必须保留的约束：
- renderer 侧已经稳定依赖 `/api/status`、`/api/settings`、`/api/user-profile`、`/api/sessions/*`、`/api/workspaces/*` 等既有路径；
- `POST /api/sessions/:id/send` 不是普通 JSON 接口，而是返回由 `sseManager` 驱动的流式 `Response`；
- 生产模式下需要继续支持“命中静态资源文件则返回文件，否则回退到 `index.html`”的 SPA 语义；
- 现有测试主要通过“构造 `Request` 并断言 `Response`”验证 HTTP 行为，这个能力需要被保留下来。

因此，这次设计的重点不是改变产品能力，而是把 HTTP 层从手写分发器重构为稳定的应用层结构，同时避免把这次 change 扩大为协议重写或前后端契约重做。

```text
当前:
  Bun.serve
    -> router.handle()
       -> if /api/status
       -> if /api/settings
       -> regex /api/workspaces/:id/:action?
       -> regex /api/sessions/:id/:action?
       -> else static fallback

目标:
  Bun.serve
    -> app.fetch
       -> global error handling
       -> /api/status
       -> /api/settings
       -> /api/user-profile
       -> /api/workspaces/*
       -> /api/sessions/*
       -> static fallback
```

## Goals / Non-Goals

**Goals:**
- 用 Hono 建立一个共享的 HTTP 应用层，替代单文件 `if`/正则分发。
- 保持当前 REST 路径、SSE 事件格式和静态资源回退语义不变。
- 将路由按资源域拆分，让会话、工作区、状态和用户资料处理逻辑拥有独立模块边界。
- 通过共享中间件承接错误映射、资源预加载和 API/静态资源边界。
- 让 HTTP 测试对准共享应用入口，而不是继续依赖单文件路由实现细节。

**Non-Goals:**
- 不修改 renderer 的 API 调用方式或现有路径命名。
- 不把 SSE 改成 WebSocket，也不重写 `sseManager`。
- 不在这一轮引入 `zod` 或生成式的前后端共享路由契约。
- 不扩展新的业务端点，只重构现有 HTTP 主链。
- 不改变 `Bun.serve()` 作为服务启动入口的运行方式。

## Decisions

### Decision: 保留 `Bun.serve()`，用 Hono 作为共享 HTTP 应用层

**Decision**
- `createHttpServer()` 继续负责端口解析、`idleTimeout` 和服务级兜底错误。
- 新增 `createHttpApp()` 或等价的 app 装配入口，由 Hono 负责路由分发和中间件链。
- `Bun.serve({ fetch })` 直接委托到 `app.fetch`。

**Rationale**
- 当前服务已经运行在 Bun 的 `Request`/`Response` 语义上，Hono 与现有心智兼容，迁移阻力小。
- 保留 `Bun.serve()` 可以避免引入新的运行时生命周期抽象，也能维持当前启动脚本和 shutdown 处理方式。

**Alternatives considered**
- 继续自建声明式 router：依赖更少，但本质上仍要维护一套自研微框架。
- 改用 Elysia：Bun 绑定更深，但对当前规模来说框架存在感偏强，也提高未来迁移成本。
- 改用 Express/Fastify：会把当前 Web `Request`/`Response` 模型切回 Node 风格，适配摩擦更大。

### Decision: 按资源域拆分 Hono 路由模块，并移除单文件集中分发

**Decision**
- 新建 `apps/electron/src/main/http/` 目录承载 HTTP 应用层。
- 路由按资源域拆分，例如 `routes/status.ts`、`routes/settings.ts`、`routes/user-profile.ts`、`routes/workspaces.ts`、`routes/sessions.ts`。
- 应用装配层统一 `app.route('/api/...', router)`，不再保留大而全的集中分发文件。

**Planned structure**
```text
apps/electron/src/main/http/
  app.ts
  errors.ts
  responses.ts
  static-handler.ts
  middleware/
    workspace.ts
    session.ts
  routes/
    status.ts
    settings.ts
    user-profile.ts
    workspaces.ts
    sessions.ts
```

**Rationale**
- 这能把“路由匹配”从“业务处理”中剥离出来，让新增端点不再继续向一个中心文件堆积。
- 资源域拆分与现有 API 结构天然一致，便于维护和阅读。

**Alternatives considered**
- 继续保留 `http-router.ts`，只在内部重构成 route table：能少改文件名，但仍会保留一个过大的中心模块。
- 进一步引入 controller/service 分层：当前 main 侧已有业务服务模块，额外再套一层 controller 价值不高。

### Decision: 用共享中间件承接资源预加载和 HTTP 错误映射

**Decision**
- 将 `HttpError`、JSON/204 响应帮助函数抽到共享模块。
- 用 Hono 中间件处理会话和工作区资源预加载，把已解析资源挂到请求上下文。
- 用统一错误处理中间件或 `app.onError` 把已知 HTTP 错误映射为 JSON 响应，把未知错误记录日志并返回 500。

**Rationale**
- 当前很多端点都在重复做“先查资源，不存在就 404”的前置分支，这类重复逻辑更适合作为中间件。
- 统一错误映射能保证未知 `/api/*` 路径、资源缺失和请求体验证失败保持一致的响应风格。

**Alternatives considered**
- 保持每个 handler 自己处理判空和异常：实现最直接，但会继续复制分支并放大回归点。
- 用更复杂的依赖注入或 decorator：超出当前项目需要。

### Decision: 保留现有 SSE 管理器和静态资源 fallback，只调整挂载方式

**Decision**
- `POST /api/sessions/:id/send` 继续复用现有 `sseManager.createResponse()` 和 `runAgent()` 流程，路由层只负责在 Hono handler 中返回该 `Response`。
- 静态资源命中与 `index.html` 回退逻辑保留现有语义，但拆到独立 static handler；不把整个 SPA fallback 逻辑完全交给框架黑盒处理。
- API 未命中和静态文件未命中保持分离：前者返回 JSON 错误，后者返回前端回退文档或显式的静态资源错误。

**Rationale**
- SSE 是当前最特殊、也最容易被重构误伤的路径，继续复用现有流式管理器比“顺手重写”更稳。
- 当前静态资源逻辑已经正确处理了路径归一化与 `index.html` 回退，迁移时应优先保留语义而不是追求更短代码。

**Alternatives considered**
- 改用 Hono 提供的全套 SSE/静态中间件替换现有实现：看起来更“纯”，但会同时改变两条已稳定的关键路径。
- 把 API 和静态服务拆成两个独立 server：边界更硬，但会增加启动和代理复杂度。

### Decision: 第一阶段不引入 `zod`，先完成结构性迁移

**Decision**
- 当前 body/query 校验先沿用现有显式校验方式，只把它们从单文件分发器迁移到对应 handler。
- 本次 change 不引入 `zod`、`@hono/zod-validator` 或共享 schema 生成。

**Rationale**
- 这次 change 的主要风险来自“路由层结构迁移”，不是输入校验缺失。
- 如果同时引入 Hono 和 `zod`，会把风险从“一个变量”变成“两个变量”，扩大 diff 和排障范围。

**Alternatives considered**
- 同轮引入 `zod` 做请求体验证：长期方向合理，但会显著扩大首轮迁移范围。
- 完全不保留请求体验证：会引入行为回归，不能接受。

### Decision: 测试迁移到共享 app 入口，而不是保留旧 router 兼容层

**Decision**
- 将当前 `http-router.test.ts` 迁移为针对共享 Hono app 的请求测试，继续使用真实 `Request`/`Response` 断言行为。
- 不为了减少 diff 而保留“旧 router 兼容壳”。

**Rationale**
- 测试应该锚定稳定的应用边界，而不是继续依赖一个准备被拆掉的实现文件。
- Hono app 仍然支持直接基于 `Request` 发起测试，不会损失当前测试风格。

**Alternatives considered**
- 保留 `createHttpRouter()` 兼容封装，让测试暂时继续调用：能减少短期改动，但会把旧模型继续带进新结构。

## Risks / Trade-offs

- **[迁移同时触及多条主链路]** REST、SSE、静态回退都在同一次重构范围内。  
  → Mitigation: 先迁移简单 JSON 路由，再迁移工作区/会话路由，最后迁移 `send` 和 static handler，并用现有请求测试回归。

- **[新增 Hono 依赖]** 引入新的框架抽象后，后续维护者需要理解其路由与中间件模型。  
  → Mitigation: 保持装配层和路由模块简单直接，不引入额外插件体系；把关键决策写入本 design。

- **[第一阶段未引入 schema 校验]** 结构会更清晰，但请求体验证仍是手写逻辑。  
  → Mitigation: 本轮先迁移现有校验；若 Hono 层稳定，再单独做 follow-up change 引入 `zod`。

- **[测试改造会产生较大 diff]** 即使行为不变，测试入口和 imports 也会调整。  
  → Mitigation: 保持测试断言内容基本不变，只替换 app 构造方式，优先做机械迁移。

## Migration Plan

1. 在 `apps/electron/package.json` 中添加 `hono` 依赖。
2. 新建 `apps/electron/src/main/http/` 应用层目录，抽出共享响应、错误和静态处理模块。
3. 先迁移状态、设置、用户资料等简单 JSON 路由，再迁移工作区和会话路由。
4. 将 `POST /api/sessions/:id/send` 迁移为 Hono handler，并复用现有 SSE 管理器和 Agent 运行流程。
5. 让 `createHttpServer()` 改为创建 Hono app 并把 `fetch` 委托给 `app.fetch`。
6. 将 HTTP 测试对准共享 app 入口，补齐对 API 未命中、静态资源回退和会话/工作区主路径的回归验证。
7. 删除或收口旧的集中式 `http-router.ts` 实现，确保最终只有一套 HTTP 应用层入口。

**Rollback**
- 如迁移中发现 Hono 集成阻塞主链，可回退到当前手写 router，并移除新增 `http/` 目录与 `hono` 依赖。
- 由于本次不改变 REST/SSE 协议，回退不涉及数据迁移。

## Open Questions

- 当前没有阻塞实现的开放问题；后续是否引入 `zod` 作为请求体验证统一层，将作为后续独立 change 评估。
