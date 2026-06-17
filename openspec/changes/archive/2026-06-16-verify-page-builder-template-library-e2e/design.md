## Context

PageBuilder 模板库一期由 5 个独立 change 组成：模板 registry、当前项目另存模板、Builder 另存入口、使用模板创建项目、首页模板库 UI。每个 change 已覆盖自身的服务、路由或组件测试，但用户真实路径跨越多个模块，单点测试无法证明整体闭环可交付。

当前项目没有独立的 Playwright test runner 基础设施；已有验证能力主要是 Bun 单元/路由/组件测试，加上必要时通过 Playwright MCP 做真实浏览器检查。因此本 change 应作为归档前验证收口，不引入新的 E2E 框架或生产依赖。

## Goals / Non-Goals

**Goals:**

- 验证 standalone 模板库主流程完整可用：另存模板、首页展示、预览、使用模板进入 Builder、删除模板和历史记录保留。
- 验证跨模块边界没有回退：base path、CMS 集成生产模式、CMS dev standalone bypass、编辑锁、CMS 集成静态快照另存、无内置模板、无缩略图。
- 用现有 Bun 测试承载可重复验证，用 Playwright MCP 或等效手工浏览器流程完成一次真实端到端验证记录。
- 发现阻断闭环的问题时允许做最小修复，并补充对应测试。
- 在同步/归档前确认 OpenSpec 文档、任务拆分文档和实现行为一致。

**Non-Goals:**

- 不新增业务功能、API、manifest 字段或模板目录格式。
- 不引入 Playwright test runner、CI E2E 框架或新的测试基础设施。
- 不新增内置模板、模板缩略图、模板市场、zip 导入、CMS 动态模板、CMS 侧模板资产或模板共享权限。
- 不改变 CMS 集成访问模型；CMS 集成生产模式仍阻断全局 standalone 模板库 API，dev standalone bypass 仍按 standalone 行为调试。

## Decisions

### 1. Change 6 作为验证收口，而不是功能扩展

本 change 只验证前 5 个 change 的组合行为，并修复验证中发现的阻断性缺口。这样可以避免将“模板库一期收口”和“新增模板能力”混在一起，降低归档风险。

替代方案：在 Change 6 中补做自动 E2E 框架、分页、模板筛选或更多 UI 优化。该方案会扩大 scope，使收口 change 变成新功能 change，不采用。

### 2. 自动验证优先复用现有 Bun 测试层

可重复验证应优先落到现有 Bun 路由、服务和组件测试中，包括模板 registry、另存模板、实例化、首页模板库、Builder 另存入口和 CMS 集成路由边界。这些测试运行稳定，能覆盖大部分状态和错误分支。

替代方案：新增 Playwright test runner 并把全流程自动化。该方案长期价值更高，但会引入测试基础设施建设、启动服务编排和 fixture 生命周期维护，超出本次归档前收口目标，不采用。

### 3. 真实浏览器验证采用 Playwright MCP 或等效手工流程

模板库主流程包含 iframe 预览、新窗口预览、当前窗口跳转 Builder、sessionStorage preview cache 和历史记录展示。至少需要一次真实浏览器验证来确认 DOM、路由和用户交互确实串通。验证结果应记录到任务完成情况或验证说明中。

替代方案：只跑单元/路由/组件测试。该方案无法证明真实浏览器中的 iframe、新窗口和跳转链路，容易遗漏集成问题，不采用。

### 4. CMS 相关验证区分三条边界

CMS 验证必须明确区分：

- CMS 集成生产模式：不展示 standalone 首页资源区，全局模板库列表、详情、预览、使用和删除 API 不开放。
- CMS dev standalone bypass：允许按 standalone 行为调试模板库。
- CMS integrated Builder 当前 workspace 另存模板 API：在有效 Builder Access Session 和编辑锁下可用，用于生成静态快照模板。

这样可以避免把“生产模式阻断全局模板库 API”误解为“CMS integrated Builder 不能另存模板”。

### 5. 静态快照验证以产物质量为准

CMS integrated Builder 另存模板的关键不是复用 CMS 动态绑定，而是确认另存产物已经固化为静态页面，且不残留 CMS 作者态标签、runtime/manifest 或鉴权信息。验证可以通过路由/服务测试读取模板目录或预览 HTML 完成；如使用浏览器验证，则以可在 standalone 模板预览中打开为补充证据。

## Risks / Trade-offs

- [Risk] 手工/Playwright MCP 验证不如自动 E2E 可重复。→ Mitigation: 关键边界仍用 Bun 测试覆盖；Playwright MCP 只负责真实用户路径确认，并记录步骤和结果。
- [Risk] 验证中发现的问题可能诱发 scope creep。→ Mitigation: 只允许修复阻断主流程或既有规格回归的问题；新能力另开 change。
- [Risk] CMS 集成环境依赖真实配置导致验证不稳定。→ Mitigation: 优先使用已有 CMS 集成路由/服务测试和 fixture 检查静态快照质量；真实浏览器验证聚焦 standalone 主流程。
- [Risk] 前 5 个 change 尚未归档，主规格和 active change 规格可能同时存在。→ Mitigation: Change 6 的文档同步任务应明确检查 active specs 与最终主规格合并路径，归档前再做严格校验。

## Migration Plan

本 change 不涉及数据迁移或运行时部署迁移。实施顺序为：先补齐/运行现有测试验证，再执行 Playwright MCP 真实流程验证，最后同步 OpenSpec 主规格并归档模板库相关 changes。若需要回滚，只需移除本 change 中新增的验证文档或测试补充；已完成的模板库业务能力不受影响。

## Open Questions

当前没有阻塞性未决问题。默认采用保守验证收口：不新增 E2E 框架，不新增业务功能，只做现有测试、必要缺口修复和 Playwright MCP 验证记录。
