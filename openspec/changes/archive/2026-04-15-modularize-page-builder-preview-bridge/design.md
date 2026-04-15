## Context

当前 page-builder preview bridge 以单个资源文件 [apps/app/resources/page-builder/page-builder-preview-bridge.js](/Users/liu/Documents/work/learning/Proma/apps/app/resources/page-builder/page-builder-preview-bridge.js) 交付，内部同时承载了 hover/selected overlay、CMS island 目标解析、inline text editing、replace-image capability、parent message protocol、MutationObserver 同步和 bootstrap 生命周期。随着区块选择、内联编辑和 CMS island 选择能力持续叠加，这个文件已经演变成一个高耦合的 runtime monolith。

当前宿主集成方式同时有三个重要约束：

- Builder 预览仍通过单个本地路由 `/api/page-builder/preview-bridge.js` 注入 bridge 资产。
- `workspace-preview-service` 只负责把 bridge 作为最后一个注入脚本插入 preview HTML，不负责协调一组 bridge 子模块资源。
- 现有测试同时覆盖 bridge 的外部注入契约和若干内部实现细节，其中一部分通过“脚本文本包含某段代码”来断言。

因此，这次 change 的本质不是重做 preview 交付模型，而是在不破坏现有宿主契约的前提下，把 bridge 的源码组织和验证方式从单文件演进为可维护的模块化 runtime。

## Goals / Non-Goals

**Goals:**

- 将 preview bridge 从手工维护的大型单资源脚本演进为职责清晰的模块化源码结构。
- 保持 bridge 的外部宿主契约稳定：继续通过单个本地 bridge 资产注入 preview，不引入浏览器直接请求的多模块 bridge 资源链。
- 让 bridge 的核心职责边界显式化，至少分离 bootstrap、消息协议、目标解析、CMS island 语义、overlay 编排和 inline editing。
- 调整 bridge 测试重心，使其更多验证行为与打包边界，而不是依赖大量 bundled script 文本片段匹配。

**Non-Goals:**

- 不在本 change 中把 preview bridge 改造成浏览器直接加载的多文件 ESM 资源集合。
- 不改变现有 page-builder preview bridge 的 URL、注入顺序或用户可见交互语义。
- 不借这次重构同步重写 CMS rendering preview、Builder 页面状态模型或现有 page-builder preview 路由体系。
- 不在本 change 中新增新的 page-builder 编辑能力；只重构 bridge 的实现与 runtime contract。

## Decisions

### Decision: 采用“模块化源码 + 单个 bridge 产物”的重构路线

**Decision**

preview bridge 的源码将拆分为多个职责明确的源模块，但对宿主和浏览器继续暴露单个 bridge 资产。宿主仍通过现有 `/api/page-builder/preview-bridge.js` 路由返回 bridge 内容，preview HTML 仍继续注入一个 bridge 脚本标签，而不是变成浏览器直接请求多个 bridge 子模块资源。

**Rationale**

- 当前主要痛点是源码可维护性，而不是 bridge 体积已经大到必须做浏览器级拆包。
- 维持单资产对外契约可以避免同时重构 preview HTML 注入、路由层资源组织、子模块版本传播和缓存语义。
- 这条路线能最大化复用现有 preview bridge 注入机制，同时把实现复杂度控制在源码和构建边界内。

**Alternatives considered**

- 继续保留单文件手工脚本：拒绝，无法实质解决职责缠绕和测试脆弱问题。
- 改为浏览器直接加载多文件模块：拒绝，当前收益主要集中在代码组织，不值得为此引入新的 bridge 资源分发体系。

### Decision: 预览桥接源码迁移到专用 runtime 源目录，并由宿主构建为单个 bridge 输出

**Decision**

bridge 运行时代码将迁移到专用源码目录，由一个明确的 entry 作为组合根，再由宿主层把该 entry 构建为单个 bridge 输出。现有 `page-builder-preview-bridge.ts` 将从“直接读取静态资源文件”转为“读取并交付构建后的 bridge 产物”，同时继续承担 source token 替换和版本计算职责。

**Rationale**

- 当前 `resources/page-builder/page-builder-preview-bridge.js` 同时承担源码、产物和分发资源三种角色，这是造成维护困难的根源之一。
- 让宿主只关心“如何读取产物并对外提供版本化 asset URL”，源码则留在模块化目录里，会让边界更清晰。
- 仓库里已经存在 CMS rendering preview 这类“源码 entry + 宿主构建并交付 preview 资产”的先例，可作为实现参考。

**Alternatives considered**

- 继续把模块化源码直接放在 `resources/` 下并手工拼接：拒绝，资源目录更适合产物而不是复杂源模块树。
- 把构建产物长期 check in 到仓库：拒绝，容易造成源码与产物漂移，且不利于基于源码版本计算 asset hash。

### Decision: 以职责分层拆分 bridge，而不是按功能开关做懒加载

**Decision**

bridge 将优先按职责边界拆分，而不是按加载时机拆分。建议的一级模块边界包括：

- `bootstrap`: DOM ready、CMS rendering ready、事件绑定和 observer 生命周期
- `protocol`: 与 parent 的消息协议、ready announcement、source token 使用
- `selection`: 普通 block 目标解析、selector 生成、rect/key 计算
- `cms-island`: CMS island root grouping、source-atomic 目标提升与 metadata 读取
- `overlays`: hover/selected/passive overlay DOM 和同步编排
- `inline-editing`: 文本热点编辑态、保存请求和保存结果处理
- `state`: 共享 bridge runtime 状态容器与受控读写

**Rationale**

- 当前 bridge 的复杂性主要来自职责缠绕，而不是单个 feature 是否要按需懒加载。
- 按职责拆分最利于后续维护、测试和代码审查，也最容易逐步迁移现有代码。
- 当前多个能力共享 hover/selected target、overlay 和 parent protocol 状态，过早做按需加载会把简单重构升级为复杂状态同步问题。

**Alternatives considered**

- 按功能开关或事件路径拆成懒加载模块：拒绝，当前没有足够的性能证据支撑这类复杂度。
- 仅在单文件内部用注释分区：拒绝，仍然无法形成稳定的可测试边界。

### Decision: 使用显式 runtime 状态与组合入口，而不是继续依赖散落的顶层可变局部变量

**Decision**

模块化后的 bridge 将通过显式的 runtime state 和组合入口管理共享状态，而不是让多个职责继续隐式读写同一大文件中的顶层局部变量。entry 负责创建共享 state、注入依赖并初始化各职责模块。

**Rationale**

- 当前 bridge 的行为高度依赖顶层可变局部变量，模块化后如果继续保留隐式共享变量，拆分只会停留在文件层表象。
- 显式 state 和组合入口更利于行为测试、局部替换和后续迭代。
- 这也能减少某些功能间的“顺手改一个局部变量就影响其他路径”的风险。

**Alternatives considered**

- 把所有模块都设计成直接读写 `window` 上的共享全局：拒绝，状态边界会更模糊。
- 继续保留大文件风格的顶层局部变量，只是拆成多个 `import` 文件：拒绝，维护收益有限。

### Decision: 测试从“产物字符串细节”转向“行为 + 打包边界”双层验证

**Decision**

bridge 测试将保留少量产物级 smoke coverage，用来验证 source token 替换、bundle 可读出和 asset version 变化；但大部分现有“脚本文本必须包含某段局部实现代码”的断言应迁移到模块行为测试或更稳定的 bridge 运行时行为测试。

**Rationale**

- 字符串包含断言在单文件时代勉强可用，但在模块化后会强绑定 bundle 细节，导致测试难以演进。
- 完全删除产物测试也不可取，因为 bridge 仍然通过单资产对外提供，仍需要验证 bundling/snapshot/versioning 边界。
- 双层验证可以同时保护外部契约和内部可维护性。

**Alternatives considered**

- 保持现有大量字符串断言不动：拒绝，会让模块化收益被测试脆弱性抵消。
- 完全只测黑盒行为，不保留任何 bundle smoke test：拒绝，无法保护 bridge 资产生成与 token 注入这类宿主边界。

## Risks / Trade-offs

- **[增加宿主构建路径会引入新的 bridge 打包失败面]** → Mitigation: 保留单资产 smoke test，并在 asset route 上对缺失 entry / 缺失输出给出明确错误。
- **[模块边界切得过细可能把简单重构演变成状态管理重构]** → Mitigation: 先按一级职责分层，避免第一版引入过多细粒度 helper 模块。
- **[测试迁移期间可能短暂降低 bridge 回归覆盖率]** → Mitigation: 先保留关键产物级 smoke tests，再分批把脆弱字符串断言替换成行为测试。
- **[单资产策略保留了部分 bundle 体积问题]** → Mitigation: 本 change 先优先解决维护性；若后续证明确有加载瓶颈，再单独评估浏览器级多模块分发。
- **[源码目录迁移可能影响现有 `PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH` 覆盖用法]** → Mitigation: 明确保留该环境变量的 override 语义，并让它覆盖“最终 bridge 产物路径”而不是重新引入源文件直读。

## Migration Plan

1. 新建 preview bridge runtime 源目录和 entry，定义 state、协议、目标解析、overlay、CMS island、inline editing、bootstrap 的模块边界。
2. 调整 `page-builder-preview-bridge.ts`，使其从 bridge entry 构建并读取单个 bridge 产物，同时保留现有 asset URL 和版本语义。
3. 保持 `page-builder` route 与 `workspace-preview-service` 的桥接注入契约不变，只更新其读取来源。
4. 迁移现有 preview bridge 相关测试：
   - 保留 asset/version/bundle smoke tests
   - 为核心模块职责补行为测试
   - 删减对 bundle 内部文本片段的强耦合断言
5. 在实现完成后，移除旧的单文件手工 bridge 资源或把它降级为明确的生成产物入口，避免双重事实来源。

**Rollback**

- 如果模块化源码或构建链路不稳定，可临时回退到旧的单文件 bridge 资源读取方式，不影响 page-builder preview 的外部注入契约。
- 因为这次 change 不改变对外 route 和注入顺序，回滚只需要回退 bridge 源与读取逻辑，不需要回滚 preview HTML、Builder 或 CMS rendering preview 行为。

## Open Questions

- 构建产物是否需要继续保留一个可选的“磁盘 override 路径”以便本地调试，还是只保留源码 entry + 自动构建路径。
- 旧 bridge 资源文件在迁移完成后，是彻底移除，还是保留为显式生成产物路径的一部分。
