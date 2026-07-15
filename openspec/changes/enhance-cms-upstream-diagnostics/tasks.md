## 1. CMS 上游诊断基础设施

- [x] 1.1 新增 CMS upstream diagnostics helper，统一输出 request_start、request_success、request_failure、token_cache_hit、token_invalidated_retry 等日志事件
- [x] 1.2 实现 CMS 请求/响应字段序列化，原样保留 CMS 请求头、请求体、响应头和响应体，不做敏感字段脱敏
- [x] 1.3 实现 CMS 上游错误详情构造工具，支持从 HTTP 状态、接口路径、CMS message/msg/error 字段、原始响应体和 fetch 异常中生成可读错误摘要

## 2. 底层 CMS 调用链路改造

- [x] 2.1 改造 CMS `/ui/login` 登录态校验，记录完整上游日志，并在 401/403、非 2xx、非 JSON、结构异常和网络异常时返回包含上游详情的错误消息
- [x] 2.2 改造 CMS token provider，记录 `/api/token` 请求日志，失败时返回 HTTP 状态和 CMS 响应摘要，并为 token provider 增加缓存失效能力
- [x] 2.3 改造 CMS JSON API `requestJson`，为站点、栏目、内容请求增加完整上游日志、no-cache 请求头、增强错误详情和 token 失效后一次自动重试
- [x] 2.4 改造 CMS asset fetch，记录资源请求日志；成功二进制响应只记录元数据，失败响应记录 HTTP 状态、响应头和可读错误体

## 3. 上层错误传播与用户可见行为

- [x] 3.1 调整 CMS browser route 错误映射，使 CMS 浏览弹框能收到包含上游状态和 CMS 错误摘要的失败消息，并合理区分 auth、upstream、config 和 invalid_request
- [x] 3.2 调整 CMS integration `/api/integrations/cms/*` 登录态校验错误传播，使 CMS 调用方收到 `cms_login_expired` 或 `cms_login_unavailable` 的同时能看到上游状态和错误摘要
- [x] 3.3 调整 CMS 同步导出、离线静态导出和另存模板失败传播，保留 CMS island 预取、CMS 资源下载和 CMS 数据读取的底层错误详情
- [x] 3.4 调整 Agent CMS SDK tools 错误格式化，保留底层 CMS gateway message 中的 HTTP 状态、请求路径和 CMS 错误摘要，同时继续给出 agent 可操作恢复指导

## 4. 测试与验证

- [x] 4.1 补充 `cms-login-validator` 测试，覆盖 `/ui/login` 非 2xx、401/403、非 JSON、结构异常和网络异常时的日志与错误详情
- [x] 4.2 补充 `cms-token-provider` 测试，覆盖 token 请求失败、CMS 原始错误摘要、缓存失效和不脱敏日志行为
- [x] 4.3 补充 `cms-gateway` 测试，覆盖 JSON API 失败详情、no-cache 请求头、token 失效重试、资源请求失败详情和日志字段
- [x] 4.4 补充 CMS browser、CMS integration、static export 和 CMS SDK tools 相关测试，验证上层不会重新折叠底层 CMS 错误详情
- [x] 4.5 运行相关测试套件和类型检查，至少覆盖 CMS gateway、token provider、login validator、CMS integration routes、static export、CMS SDK tools
