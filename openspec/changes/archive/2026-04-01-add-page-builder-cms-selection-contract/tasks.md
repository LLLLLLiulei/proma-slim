## 1. Shared selection contract

- [x] 1.1 在 `packages/shared` 中定义 CMS 选择器的 request context 类型，至少覆盖 `targetBlock.selector` 和可选入口来源
- [x] 1.2 在 `packages/shared` 中定义统一的 CMS 选择结果判别联合类型，覆盖栏目单选 / 多选与固定内容条目集合
- [x] 1.3 为共享类型补充必要的导出与类型测试，确保协议字段和分支语义清晰可消费

## 2. CmsBrowserDialog contract upgrade

- [x] 2.1 调整 `CmsBrowserDialog` props，使其在打开时接收目标区块上下文而不是仅依赖本地 UI 状态
- [x] 2.2 将 `CmsBrowserDialog` 的确认逻辑从原始 `tab + catalogs[] + contents[]` 返回值升级为统一结构化结果
- [x] 2.3 在栏目页签确认时根据已选栏目数量输出 `single` 或 `multiple` 语义，并返回对应 `catalogIds` 与 `snapshot.catalogs`
- [x] 2.4 在内容页签确认时输出 `contents-fixed / fixed-items` 语义，并返回 `contentIds`、去重后的 `catalogIds` 与 `snapshot.contents`
- [x] 2.5 明确第一版结果中不返回 `latest-by-catalog`、`querySpec`、`limit` 等动态查询字段

## 3. Builder integration

- [x] 3.1 在 `BuilderPage` 中将当前已选区块 `selector` 映射为 CMS 选择器的 request context，并透传给 `CmsBrowserDialog`
- [x] 3.2 确认区块工具条路径打开弹框时能够携带当前目标区块上下文，而不破坏现有选区与弹框开关状态
- [x] 3.3 为后续 Module 3 预留统一的 `onConfirmSelection` 消费点，使 `BuilderPage` 可以直接接收结构化绑定候选

## 4. Verification

- [x] 4.1 更新 `CmsBrowserDialog` 测试，覆盖栏目单选、栏目多选和固定内容多选的结构化确认结果
- [x] 4.2 更新 `BuilderPage` 相关测试，覆盖目标区块上下文透传到 `CmsBrowserDialog` 的行为
- [x] 4.3 运行与 CMS 选择器和 Builder 集成相关的测试与类型检查，确认协议升级没有破坏现有浏览能力
