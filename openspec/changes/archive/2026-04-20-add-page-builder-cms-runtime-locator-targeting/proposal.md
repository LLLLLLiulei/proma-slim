## Why

当前 CMS 选区、apply、删除和 targeted edit 同时依赖作者态源码里的 `data-proma-cms-source-id` 与 `data-proma-block-id`。这些内部 identity 直接暴露在 agent 可编辑的 HTML 中，已经出现被手写、重复和污染的真实案例，导致目标漂移、误删误改和 fail-closed 回滚频发；现在需要把 CMS 定位收敛为宿主管理的 runtime locator，而不是继续依赖源码中的内部 id。

## What Changes

- 将 `cms-island` 目标选择从“源码 id + selector”收敛为 runtime locator，至少包含 `htmlPath`、`component`、`sourceSelector` 与 `parentBlockSelector`
- **BREAKING** 停止将 `data-proma-cms-source-id` 视为受支持的作者态 identity；正式 CMS 写入、删除、快照和 targeted edit 不再依赖或生成该字段
- 将 CMS 相关正式写入链路改为 locator-first、fail-closed 的目标解析：locator 失效、命中不唯一或父块校验失败时直接中止，不做隐式兜底
- 将 preview 渲染根节点暴露的内部定位元数据改为宿主管理的 runtime locator 注解，而不是镜像作者态 `sourceId`
- 将 manifest、validator 和 HTML sanitize 逻辑更新为 runtime-locator 模型：内部定位元数据不再作为作者态 contract 的一部分持久化到源码
- 保留普通静态 block 的现有选择路径作为兼容层，但 CMS 链路不再继续依赖源码里的 `blockId` 作为 source identity

## Capabilities

### New Capabilities

### Modified Capabilities

- `page-builder-cms-island-selection`: `cms-island` 目标必须暴露宿主管理的 runtime locator，而不是依赖作者态 `sourceId`
- `page-builder-cms-selection-contract`: CMS 选择确认结果中的 `targetSelection` 必须保留 locator-first 的 CMS 目标信息
- `page-builder-cms-rendering-preview`: preview bootstrap 必须为渲染根节点注入 locator 元数据，供 selection bridge 稳定回传
- `page-builder-cms-rendering-apply-tool`: `apply_cms_binding` 必须按 runtime locator 解析并重写源 CMS 标签，且对失效 locator fail closed
- `page-builder-cms-targeted-edit-guardrails`: 已选 CMS 区域的普通编辑 guardrail 必须围绕 runtime locator 工作，并停止依赖作者态 id
- `page-builder-block-deletion`: 删除已选 CMS island 时必须按 runtime locator 删除源 CMS 标签，而不是按旧的作者态 id 推断
- `page-builder-cms-rendering-manifest-validation`: manifest 与 validator 必须停止要求持久化 `sourceId`，并把内部定位属性视为 runtime-only 元数据

## Impact

- `packages/shared` 中的 `PageBuilderTargetSelection` / CMS target locator 类型
- `apps/page-builder` 中的 preview bridge、CMS 选择结果协议和选区序列化逻辑
- `apps/app` 中的 CMS apply、target snapshot、block deletion、targeted edit guardrail 和 HTML sanitize 流程
- `packages/page-builder-cms-rendering` 中的 preview bootstrap、manifest/validator 与相关测试
- 现有 workspace HTML、skills 和诊断文案；历史 `data-proma-cms-source-id` 将不再作为正式 contract 的一部分
