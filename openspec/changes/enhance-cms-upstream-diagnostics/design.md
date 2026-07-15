## Context

PageBuilder 当前有两套 CMS 调用链路：CMS 集成接口使用 `X-CMS-Cookie` 调用 `{AI_PAGE_BUILDER_CMS_BASE_URL}/ui/login` 校验当前用户登录态；Builder 内部 CMS 浏览、Agent CMS tools、CMS islands 静态化和资源本地化仍通过宿主配置的旧 slim API `/api/token`、`/api/sites`、`/api/catalogsTree`、`/api/catalogs`、`/api/catalogs/:id/contents` 和 CMS 资源 URL 访问上游。

现有实现缺少 CMS 专用上游调用日志，失败时经常只返回固定的“CMS 鉴权失败，请检查宿主配置中的账号密码是否正确”，无法判断是 token 失效、权限不足、接口状态异常、CMS 返回业务错误、网络错误还是响应格式不符合预期。旧 token provider 还会在进程内缓存 token，若 CMS 提前使 token 失效，可能出现重启服务后恢复的现象。

## Goals / Non-Goals

**Goals:**

- 为所有 CMS 上游请求提供统一、结构化、可检索的详细日志。
- CMS 上游诊断日志原样记录请求头、请求体、响应头和响应体，不对 CMS Cookie、Authorization、账号密码或 token 做敏感字段脱敏。
- CMS 调用失败时，业务错误信息包含 HTTP 状态码、接口路径和 CMS 原始错误摘要，避免固定鉴权文案遮蔽根因。
- 旧 CMS API token 失效时自动清理缓存并重试一次，减少人工重启服务恢复的场景。
- CMS 列表、栏目、内容读取继续保持实时语义，不引入跨请求 CMS 数据缓存。
- 静态导出、另存模板、CMS integration API 和 Agent CMS tools 能沿用底层 CMS 错误详情。

**Non-Goals:**

- 不把旧 slim API 迁移为新的 CMS `ui` 接口。
- 不改变 CMS 集成、handoff、Builder Access Session 或 CMS 浏览的鉴权模型。
- 不为 CMS 上游日志新增远程日志服务或分布式 tracing 系统。
- 不在成功的二进制资源响应中读取完整 body；避免破坏流式响应或显著增加内存占用。
- 不修复 CMS 上游本身的权限、账号、Cookie 或接口数据问题。

## Decisions

### 1. 使用 CMS 专用上游日志 helper，而不是在各调用点散落 `console.log`

新增 CMS upstream diagnostics helper，复用现有 backend diagnostic logger，并统一输出 `component`、`category`、`operation`、`phase`、`method`、`url`、`pathname`、`query`、`requestHeaders`、`requestBody`、`responseStatus`、`responseStatusText`、`responseHeaders`、`responseBody`、`durationMs` 和异常字段。

替代方案是在 `cms-gateway.ts`、`cms-token-provider.ts`、`cms-login-validator.ts` 中分别打印日志。该方案实现快，但字段不一致，后续排查和测试都更难维护。

### 2. 在读取响应体的调用点记录日志，避免重复消费 `Response`

JSON/text 请求在现有代码中本来需要读取 `response.text()` 或 `response.json()`。本次改造应统一改为先读取原始 `text()`，记录原始响应，再解析 JSON。这样能同时满足日志和错误详情保留，不需要 clone 多份响应。

CMS 资源请求成功时通常需要把 `response.body` 流式返回给前端或写入导出包，因此成功路径只记录响应状态、响应头和内容元数据。资源请求失败时，如果响应可读取为文本，则记录错误响应体；否则记录响应头和状态。

### 3. CMS 诊断日志不做敏感字段脱敏

根据本次需求，CMS 上游诊断日志需要原样记录请求头、请求体、响应头和响应体。因此 CMS upstream logging helper 不应对 `cookie`、`authorization`、`set-cookie`、`username`、`password`、`access_token` 等字段做脱敏或替换。

该决策只适用于 CMS 上游诊断日志。业务错误响应仍应以 CMS 上游状态和响应摘要为主，不需要把完整请求头拼入返回给前端、CMS 系统或 Agent tool 的错误消息中。

### 4. 用统一错误详情构造替换固定鉴权文案

新增或抽取统一的 CMS upstream error detail 构造逻辑，将 `operation`、`pathname/url`、HTTP 状态码、`statusText`、CMS message/msg/error 字段和原始响应体摘要组合成可读错误消息。

`CmsTokenProviderError` 和 `CmsGatewayError` 继续保留现有错误 code，用于上层决定 HTTP 状态或工具提示类型，但 `message` 必须包含上游诊断摘要。

### 5. token 失效时清理缓存并重试一次

扩展 `CmsAuthorizationProvider`，增加可选的 `invalidateAuthorizationHeader()` 能力。`CmsTokenProvider` 实现该方法，清理缓存 token 和过期时间。

`CmsGateway.requestJson()` 遇到 HTTP 401/403 或响应体明显表示鉴权失败时，如果本次请求尚未重试过，则清理 token 并重新获取 token 后重试一次。重试仍失败时返回包含第二次上游响应的错误详情。

### 6. CMS 数据读取请求显式声明 no-cache

旧 CMS API 的 GET 请求补充 `Cache-Control: no-cache` 和 `Pragma: no-cache`，与 `/ui/login` 校验策略保持一致。前端已有 `cache: 'no-store'` 和服务端响应 `Cache-Control: no-store` 继续保留。

## Risks / Trade-offs

- [Risk] CMS upstream 日志会包含 Cookie、Authorization、账号密码或 token。→ Mitigation: 这是本次需求明确选择；部署方必须将诊断日志视为敏感运行数据并控制访问权限。
- [Risk] CMS JSON/text 响应体较大时会增加日志体积并加快日志滚动。→ Mitigation: 复用现有诊断日志滚动与 retention；二进制成功响应不读取 body。
- [Risk] 自动 token 重试可能让单次失败多一次上游请求。→ Mitigation: 只在明确鉴权失败时重试一次，避免无限重试和请求风暴。
- [Risk] 业务错误更详细后，前端和 CMS 调用方看到的错误文案会变化。→ Mitigation: 继续保留结构化 `code` 和 HTTP 状态，调用方不应依赖完整错误文案做业务分支。
- [Risk] `/ui/login` 从 `response.json()` 改为 `response.text()` 再解析可能影响少数测试断言。→ Mitigation: 保持成功响应解析结果不变，并补充失败详情测试。
