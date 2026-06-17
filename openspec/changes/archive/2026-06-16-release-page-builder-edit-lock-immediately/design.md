## Context

PageBuilder 当前通过工作区级 edit lock 保证同一项目同时只能由一个构建页编辑。构建页在 React unmount 和浏览器 `pagehide` 时会以 best-effort 方式调用 release API；后端收到 release 后不会立即释放锁，而是写入 `releasePendingUntil = now + 5s`，并在 grace 结束前仍把该锁视为有效锁。

这个设计能兼容普通刷新：旧页面触发 release，新页面在 grace 内用同一 `lockId + holderId` renew 后取消 pending release。但它也让用户手动关闭页签后，项目在 5 秒内仍被列表和 acquire 逻辑视为 locked，和普通用户对“关闭编辑页即退出编辑”的预期不一致。

## Goals / Non-Goals

**Goals:**

- release 请求到达后，项目应立即对其他编辑者可获取，并在首页/项目列表中显示为 available。
- 保留刷新恢复能力：同一 `lockId + holderId` 在短 grace 内仍可 renew 恢复原锁。
- release pending 锁不得继续授权普通写操作。
- 保持现有 edit-lock API 路径、请求体、响应体和前端 release 触发逻辑不变。
- 保持活跃 Agent、同步导出 busy、TTL 过期和 holder mismatch release 的既有语义。

**Non-Goals:**

- 不尝试在浏览器层面区分“关闭页签”和“刷新页面”。
- 不引入 distributed lock、持久化锁存储或新的跨进程锁协调机制。
- 不新增 release 版本字段或修改前后端公开协议。
- 不改变 Agent 活跃会话恢复、CMS Builder Access Session 校验或静态导出 busy 判断。

## Decisions

### Decision 1: release pending 不再作为 blocking lock

release 后仍可短时间保留原锁记录，但 acquire、getEditState、assertProjectAvailable 等面向“项目是否可进入编辑/是否可删除”的判断不应把 pending 记录视为有效占用。这样关闭页签后，只要 release 到达，其他用户可以立即进入编辑，列表也不会继续显示锁定。

替代方案是把 release 改成直接删除锁。该方案更简单，但刷新时旧页面 release 和新页面 renew 存在竞态，可能导致新页面刚恢复的锁被迟到 release 删除。

### Decision 2: renew 独立允许同一 holder 恢复 release pending 锁

为了保留刷新体验，renew 需要能读取仍在 grace 内的 release pending 记录，并在 `lockId + holderId` 匹配时清除 `releasePendingUntil`、延长 TTL。若其他 holder 已经 acquire，新锁会覆盖 pending 记录，旧 holder 的 renew 将失败，不能抢回锁。

替代方案是完全取消 refresh grace，刷新后总是重新 acquire。该方案用户可接受度可能也不错，但会改变现有刷新恢复语义，并可能在活跃 Agent 会话恢复场景中引入额外冲突。

### Decision 3: validate/assertCanEdit 不承认 release pending 锁

release pending 只服务于刷新恢复 renew，不代表页面仍持有可写编辑权。因此 validate 和 assertCanEdit 应使用“可写有效锁”判断，release pending 锁必须返回 invalid，避免关闭页签后的迟到写请求继续修改项目。

### Decision 4: 拆分内部锁读取语义，而不是扩大 API 协议

后端服务内部需要区分三类读取：

- renewable lock：未过期且 pending 未超过 grace，可用于同 holder renew。
- writable/blocking lock：未过期且不是 release pending，可用于写操作授权、acquire 冲突和列表 locked 状态。
- stale lock：TTL 过期或 release pending 超过 grace，应清理。

通过内部 helper 拆分语义即可完成修复，不需要修改 API payload 或 shared public type。

## Risks / Trade-offs

- [Risk] 浏览器关闭页签时 release 请求可能完全丢失 → 继续依赖 TTL 自动过期兜底，这也是当前 best-effort release 的既有限制。
- [Risk] 用户刷新瞬间其他人先 acquire，会导致原刷新页 renew 失败 → 这是“release 后项目立即可用”的预期结果；新页面应按现有锁失效处理重新进入或显示提示。
- [Risk] 内部 helper 拆分不清会让 pending 锁在某些路径仍显示 locked 或授权写入 → 通过服务测试覆盖 acquire、getEditState、validate/assertCanEdit 和 renew 关键路径。
- [Risk] 删除项目在 release pending 期间会变为允许 → 这符合“关闭编辑页即退出编辑”的语义；若还有活跃 Agent 或同步导出，仍会按现有 busy 规则阻止删除。

## Migration Plan

- 无数据迁移。edit lock 当前存储在进程内存，服务重启会自然清空。
- 部署后新 release 语义立即生效；已有 pending 锁最多在原 grace 或 TTL 内被新逻辑清理/覆盖。
- 如需回滚，可恢复旧的 getValidLock 单一语义和原测试预期。

## Open Questions

- 无。
