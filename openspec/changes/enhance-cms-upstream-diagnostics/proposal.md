## Why

当前 PageBuilder 调用 CMS 上游接口失败时，日志缺少请求地址、参数、请求头、响应状态和响应体等关键上下文，导致只能通过重启、复现和猜测排查问题。同时部分鉴权失败被固定映射为“CMS 鉴权失败，请检查宿主配置中的账号密码是否正确”，无法判断真实 HTTP 状态、CMS 原始错误或 token 缓存失效等根因。

## What Changes

- 为所有 CMS 上游调用增加统一的详细诊断日志，覆盖 `/ui/login`、`/api/token`、旧 CMS `/api/*` 读取接口和 CMS 资源代理请求。
- 日志记录每次 CMS 请求的 API 地址、请求参数、请求头、请求体、响应状态、响应头、响应体、耗时和异常信息；CMS 诊断日志不做敏感字段脱敏。
- CMS 调用失败时保留并向调用方返回可诊断错误摘要，包括 HTTP 状态码、CMS 原始错误信息或响应体摘要，而不是固定鉴权文案。
- CMS API 遇到已缓存 token 失效类错误时，清理 token 缓存并自动重试一次，降低必须重启服务才能恢复的概率。
- CMS 数据读取请求补充实时读取语义，避免中间缓存影响列表、栏目、内容等实时性。
- CMS 同步导出、另存模板和 Agent CMS tools 继续沿用底层 CMS 错误详情，避免在上层重新折叠为不可诊断的通用错误。

## Capabilities

### New Capabilities

- `page-builder-cms-upstream-diagnostics`: 约束 PageBuilder 访问 CMS 上游接口时的详细日志、错误详情保留、token 失效重试和实时请求语义。

### Modified Capabilities

- `diagnostic-logging`: 后端诊断日志需要纳入 CMS 上游调用事件，并允许 CMS 诊断日志记录原始请求/响应详情。
- `page-builder-cms-browser-dialog`: CMS 浏览弹框读取失败时需要展示包含上游状态和错误摘要的可诊断错误，而不是只显示通用失败。
- `page-builder-cms-integration`: CMS 集成接口的 `/ui/login` 校验和同步导出失败需要保留上游 HTTP 状态和 CMS 错误摘要。
- `page-builder-cms-rendering-static-export`: CMS islands 静态化失败和 CMS 资源本地化失败需要在导出失败记录中保留底层 CMS 上游错误详情。
- `page-builder-cms-sdk-tools`: Agent CMS tools 的上游失败错误需要包含 CMS HTTP 状态和原始错误摘要，并保持对 agent 的可操作恢复指导。

## Impact

- 影响后端 CMS 调用链路：`cms-login-validator.ts`、`cms-token-provider.ts`、`cms-gateway.ts`、CMS browser handlers、CMS integration routes、static export service 和 CMS SDK tools。
- 影响诊断日志内容和体积：CMS JSON/text 响应体会进入日志；二进制资源成功响应记录元数据，失败响应尽量记录可读错误体。
- 影响错误响应文本：CMS 相关失败将包含 HTTP 状态码、接口路径和 CMS 原始错误摘要；调用方需要接受更具体的错误文案。
- 不引入新的外部服务依赖；可复用现有 diagnostic logging 基础设施。
