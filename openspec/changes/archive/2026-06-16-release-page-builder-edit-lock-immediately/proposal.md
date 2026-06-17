## Why

当前 PageBuilder 编辑页关闭时会发送 release，但后端会把锁保留为 5 秒待释放状态，导致普通用户手动关闭构建页后，其他人短时间内仍看到项目被锁定并无法立即进入编辑。用户视角下“关闭编辑页签”应当代表退出编辑，锁应在 release 到达后立即对其他编辑者可用，同时仍需要尽量保留刷新页面时的恢复体验。

## What Changes

- 调整 PageBuilder 编辑锁 release 语义：当前 holder 释放锁后，该锁不再阻塞其他人获取编辑权，也不再让项目列表显示为 locked。
- 保留短时间刷新恢复能力：release 后的 pending 锁只允许同一 `lockId + holderId` 在 grace 时间内通过 renew 恢复。
- 其他编辑者在 release pending 期间 acquire 时应立即成功，并覆盖旧 pending 锁；旧 holder 后续 renew 不得抢回锁。
- release pending 锁不得授权普通写操作，避免已关闭页面的迟到写请求继续修改项目。
- release 请求 holder 不匹配时仍保持忽略，不影响当前有效锁。
- 不改变编辑锁 TTL、心跳间隔、活跃 Agent 和同步导出 busy 的现有语义。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `page-builder-edit-lock`: 调整编辑锁释放后的可见状态、获取阻塞规则、刷新恢复和写操作授权语义。

## Impact

- 后端服务：调整 `apps/app/src/main/lib/page-builder-edit-lock-service.ts` 中 acquire、renew、validate、getEditState 和 release pending 的内部判断。
- 后端路由：继续复用现有 edit-lock acquire/renew/status/release API，不新增公开接口。
- 前端：原则上无需改动关闭页签 release 触发逻辑；如测试暴露 UI 状态假设，再做最小修正。
- 测试：更新 `page-builder-edit-lock-service` 测试，覆盖 release 后立即可 acquire、列表状态 available、同 holder 刷新恢复、被新 holder 覆盖后旧 holder renew 失败、pending 锁不可授权写操作。
