## 1. Shared Locator Contract

- [x] 1.1 更新 `packages/shared` 中的 CMS `targetSelection` 类型与辅助构造函数，改为 locator-first 的 `cms-island` 结构
- [x] 1.2 更新 page-builder 侧 CMS 选择结果协议与相关序列化/反序列化逻辑，确保确认结果保留 `htmlPath`、`sourceSelector`、`parentBlockSelector` 与 `component`

## 2. Preview Runtime And Selection

- [x] 2.1 更新 CMS preview bootstrap，为每个顶层 CMS island 的渲染根节点注入 runtime locator 元数据，并停止镜像作者态 `sourceId`
- [x] 2.2 更新 preview bridge 的 CMS island 解析逻辑，使其基于 runtime locator 组装 `cms-island` 目标并在元数据缺失或冲突时 fail closed
- [x] 2.3 调整 Builder 选区与 CMS 对话框集成逻辑，使已选 CMS island 在重新打开选择器时继续沿用 locator-first 目标

## 3. Formal Write Paths

- [x] 3.1 更新 `apply_cms_binding` 与相关目标解析逻辑，使 `cms-island` 写入按 `htmlPath + sourceSelector + parentBlockSelector + component` 解析并严格 fail closed
- [x] 3.2 更新 CMS target snapshot、普通 CMS targeted edit guardrail 与 block deletion 路径，使其统一消费 runtime locator 而不再依赖作者态 `sourceId`
- [x] 3.3 更新 HTML mutation pipeline、manifest 与 validator，改为保留 locator snapshots，并在支持的写入路径中剥离 `data-proma-cms-source-id` / `data-proma-cms-island-*`

## 4. Regression Coverage

- [x] 4.1 补充 shared types、preview bootstrap 和 preview bridge 测试，覆盖 multi-root locator、一致性检查与 stale locator fail-closed
- [x] 4.2 补充 apply、snapshot、deletion 与 targeted edit 测试，覆盖 locator-first 解析、parent block 校验和旧 `sourceId` 不再生效的场景
- [x] 4.3 补充 manifest/validator 与 HTML sanitize 测试，覆盖 runtime-only attrs 诊断与自动剥离
