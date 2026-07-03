## Why

当前 `taste-skill` 已承担 PageBuilder 首轮视觉生成职责，但其通用前端规则仍包含 React/Next/Tailwind、安装依赖、Framer Motion 等需要构建工具或包管理器的默认假设，和 PageBuilder 纯静态 HTML 输出目标不完全一致。需要基于现有 v1 规则保留 PageBuilder 专用边界，同时吸收升级版 taste skill 中更成熟的 brief 判断、反模板化设计约束与质量预检能力，让普通口语化需求更稳定地产出可预览、可导出的静态页面。

## What Changes

- 升级 `taste-skill` 文档，使其明确作为 PageBuilder 的 HTML-first execute-only visual worker。
- 约束首轮生成与大块重做默认产物结构为 `workspace-files/index.html`、`workspace-files/assets/styles.css`、`workspace-files/assets/script.js`。
- 移除或改写需要构建工具的默认规则，包括 React/Next、Tailwind 构建链、Framer Motion、shadcn/ui、npm install 等。
- 新增外部依赖策略：默认零依赖；确需 JS/CSS 库时只能从 `https://unpkg.com/` 引用，并固定版本，不使用 `@latest`。
- 引入升级版中的核心质量约束：静默 brief inference、设计强度 dials、色彩/字体/布局一致性、反 AI 模板化、文案自审、轻量预检清单。
- 保留 CMS island 与 Vue authoring 边界，确保普通页面区域继续使用 HTML/CSS/JS，CMS slot 内的 Vue authoring 不被破坏。
- 补充聚焦测试，确保 skill 文档不再鼓励构建型前端栈，并稳定声明静态文件结构和 unpkg 依赖边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-guided-generation`: 扩展 canonical visual worker 中 `taste-skill` 的执行契约，要求其在 PageBuilder 中按纯静态 HTML/CSS/JS、assets 拆分和 unpkg-only 外部依赖策略工作。

## Impact

- 影响 `apps/app/default-skills/taste-skill/SKILL.md`。
- 可能影响 `apps/app/src/main/lib/page-builder-guided-generation-skill.test.ts` 或新增/调整相关 skill 文档测试。
- 不改变 PageBuilder API、运行时路由、CMS apply 流程或预览/导出接口。
- 不新增运行时依赖；仅改变 agent skill 文档约束与对应测试。
