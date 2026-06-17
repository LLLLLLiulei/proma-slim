## 1. 测试基线

- [x] 1.1 更新 `page-builder-edit-lock-service` 单元测试，移除“release grace 内阻塞第二个编辑者”的旧预期。
- [x] 1.2 增加 release 后立即允许不同 holder acquire 的测试，并验证新 lock 覆盖旧 pending lock。
- [x] 1.3 增加 release pending 期间 `getEditState()` 返回 available 的测试。
- [x] 1.4 增加同一 `lockId + holderId` 在 grace 内 renew 可恢复 pending lock 的测试。
- [x] 1.5 增加 pending lock 被新 holder 覆盖后旧 holder renew 失败的测试。
- [x] 1.6 增加 release pending lock 不能通过 `validate()` / `assertCanEdit()` 授权写操作的测试。

## 2. 编辑锁服务实现

- [x] 2.1 在 `page-builder-edit-lock-service.ts` 中拆分内部锁读取语义，区分 renewable lock、writable/blocking lock 和 stale lock。
- [x] 2.2 调整 `acquire()`，使 release pending lock 不再构成 locked 冲突，允许新 holder 立即获取并覆盖旧 pending 记录。
- [x] 2.3 调整 `renew()`，允许同一 `lockId + holderId` 在 grace 内恢复 release pending lock，并在恢复时清除 `releasePendingUntil`。
- [x] 2.4 调整 `validate()` / `assertCanEdit()`，确保 release pending lock 不被视为可写有效锁。
- [x] 2.5 调整 `getEditState()` / `assertProjectAvailable()`，确保 release pending lock 不再让项目显示或判断为 editor locked。
- [x] 2.6 保持 holder mismatch release、TTL 过期、活跃 Agent 和同步导出 busy 现有行为不回退。

## 3. 集成回归

- [x] 3.1 回归 edit-lock HTTP route 测试，确认 release API 接口和响应码不变。
- [x] 3.2 回归 BuilderPage 关闭/刷新相关测试，确认前端 release 触发和 refresh storage 行为不变。
- [x] 3.3 如现有测试依赖旧 grace blocking 语义，按新 spec 更新断言，不扩大前端改动范围。

## 4. 验证

- [x] 4.1 运行 `bun test apps/app/src/main/lib/page-builder-edit-lock-service.test.ts`。
- [x] 4.2 运行相关 HTTP 和 BuilderPage 测试。
- [x] 4.3 运行 `bun run --cwd apps/app typecheck` 和 `bun run --cwd apps/page-builder typecheck`。
- [x] 4.4 运行 `git diff --check`。
