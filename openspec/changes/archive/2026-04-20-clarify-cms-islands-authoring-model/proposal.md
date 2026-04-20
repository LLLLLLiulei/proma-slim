## Why

`page-builder` 现在已经具备宿主管理的 CMS islands 预览与局部 Vue 渲染能力，但相关 prompt/skill 还没有把这套作者态心智模型讲成足够直接的执行规则。结果是 Agent 在遇到 `cms-catalog` / `cms-content` 或局部 Vue slot authoring 时，仍可能自行引入 Vue runtime、从 CDN 加载 Vue，甚至把整页改造成单一 Vue app。

## What Changes

- 明确 page-builder 的作者态模型为 `HTML-first + host-managed CMS islands`：普通页面区域继续使用普通 HTML/CSS/JS，Vue template 语法只用于 `cms-catalog` / `cms-content` 的 slot authoring。
- 更新 page-builder 根级 `CLAUDE.md`、`page-builder-guided-generation` 和 `cms-binding-apply`，显式声明不要自行引入 Vue runtime、不要整页 `createApp` / `mount`、不要把 `cms-*` 之外的页面写成 Vue authoring。
- 新增针对 page-builder 作者态 Vue 边界的 guardrail/spec，要求运行时对作者自行引入 Vue、整页 mount、以及 `cms-*` 外的 Vue 指令或插值坏模式给出 fail-closed 诊断，而不是仅依赖 prompt 自觉。

## Capabilities

### New Capabilities
- `page-builder-vue-authoring-boundaries`: 定义 page-builder 的 HTML-first 作者态边界，并约束系统阻断作者自行引入 Vue runtime、整页 Vue 化以及 `cms-*` 之外的 Vue authoring。

### Modified Capabilities
- `page-builder-prompt-layering`: 增加根级 prompt 对 CMS islands 运行时模型与“禁止自行整页 Vue 化”的全局说明。
- `page-builder-guided-generation`: 增加普通页面生成/迭代 flow 对非 CMS 区域保持普通 HTML authoring、不得把已有页面升级为整页 Vue app 的边界。
- `page-builder-cms-apply-skill`: 增加专用 CMS apply flow 对“只 author `cms-*` source tag 与 slot template，不 author Vue runtime / page-wide mount”的明确约束。

## Impact

- Prompt surfaces: `apps/app/resources/templates/page-builder-workspace-claude.md`
- Skills and references:
  - `apps/app/default-skills/page-builder-guided-generation/`
  - `apps/app/default-skills/cms-binding-apply/`
- Validation / guardrails:
  - `packages/page-builder-cms-rendering/`
  - `apps/app/src/main/lib/page-builder-agent-html-guardrails-service*`
  - related page-builder HTML / CMS rendering validation tests
