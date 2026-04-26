## Why

当前 `page-builder` 在处理页面样式错乱、布局异常、交互失效或“页面还是不对”这类问题时，主要依赖静态源码分析；当真实预览结果与源码直觉不一致时，Agent 容易停留在盲修状态。现在需要在保持现有 ordinary owner 路由轻量化的前提下，让 Agent 在静态排查无果或重复修复失败时稳定升级到 Playwright 进行真实预览诊断。

## What Changes

- 为 `page-builder-guided-generation` 增加轻量的浏览器排错升级规则：在 ordinary repair、ordinary follow-up 与 selected-block follow-up 场景中先做静态排查，若仍不能稳定解释问题，或用户再次反馈页面仍有问题，则改用 Playwright MCP 检查真实预览后再继续修复，并在诊断完成后主动关闭 Playwright 会话。
- 让 page-builder 运行时上下文向 Agent 暴露稳定的浏览器调试入口与运行时说明，覆盖本地开发与 Docker sidecar 两种 Playwright 访问方式，避免模型猜测 URL、退回 `file://` 或误判运行环境。
- 保持现有 owner routing、CMS 受控链路与普通 turn 的轻量提示结构，不新增基于关键词/正则的宿主分流逻辑，也不把这套规则扩展成重型调试手册。
- 第一阶段保持现有 page-builder MCP 挂载策略不变，优先覆盖 ordinary repair、ordinary follow-up、selected-block follow-up 与重复反馈场景中的自动 Playwright 排查。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-guided-generation`: ordinary owner 在 ordinary repair、ordinary follow-up 与 selected-block follow-up 的页面问题排查场景中增加“静态检查失败后升级到 Playwright 真实预览诊断”的行为约束，并保持该约束为轻量 owner 规则。
- `workspace-capability-surface`: page-builder 运行时上下文增加稳定的浏览器调试入口与 Playwright 运行时说明，确保模型在本地开发与 Docker 环境下都不必猜测预览地址和访问方式。

## Impact

- Affected code: `apps/app/default-skills/page-builder-guided-generation/`, `apps/app/src/main/lib/agent-prompt-builder.ts`, `apps/app/src/main/lib/agent-orchestrator.ts`, related page-builder runtime Playwright helpers
- Affected tests: page-builder guided-generation skill tests, prompt-builder tests, orchestrator workspace runtime tests
- Systems: page-builder ordinary repair flow, runtime prompt context, Playwright MCP preview debugging behavior
