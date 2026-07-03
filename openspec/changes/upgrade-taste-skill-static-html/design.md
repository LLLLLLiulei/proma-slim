## Context

`page-builder-guided-generation` 当前在普通 PageBuilder flow 中作为 owner 负责需求澄清和确认，并在确认后显式调用 `taste-skill` 执行首轮整页视觉生成或首轮明显 block 重设计。现有 `taste-skill` 已包含 PageBuilder 专用 override，但其下方仍保留较多通用前端 skill 内容，例如默认 React/Next、Tailwind、包安装、Framer Motion、shadcn/ui 等，这些规则会弱化 PageBuilder 的 HTML-first 静态页面边界。

本次变更只调整 prompt/skill 文档与对应测试，不改变 runtime routing、工具调用、预览服务、导出链路或 CMS apply 流程。

## Goals / Non-Goals

**Goals:**

- 保留 `taste-skill` 作为 PageBuilder execute-only visual worker 的现有职责边界。
- 将 `taste-skill` 的默认生产目标收敛为纯静态 HTML/CSS/JS。
- 明确默认文件结构：`workspace-files/index.html`、`workspace-files/assets/styles.css`、`workspace-files/assets/script.js`。
- 明确外部 JS/CSS 依赖策略：默认零依赖；确需使用时仅允许 `https://unpkg.com/` 且固定版本。
- 吸收升级版 taste skill 中适合静态页面的设计质量规则，包括 brief inference、dials、布局纪律、反 AI 模板化和预检清单。
- 保留 CMS island / Vue authoring 边界，避免普通页面区域被升级为框架应用。

**Non-Goals:**

- 不引入新的 npm/bun 运行时依赖。
- 不支持 React、Next、Tailwind 构建链、Framer Motion 或 shadcn/ui 作为 PageBuilder 默认生成目标。
- 不实现 vendor 化 CDN 资源下载，也不保证导出包完全离线运行。
- 不改变 `page-builder-guided-generation` 的用户侧澄清、确认、覆盖确认和 owner routing 机制。
- 不改动 CMS apply、CMS rendering、预览或静态导出接口。

## Decisions

### 1. 以 v1 为主体，裁剪吸收 v2 核心规则

保留 v1 的 PageBuilder role、execute-only 定位、workspace 文件边界、CMS 边界和用户输出纪律。v2 只作为规则来源，选择性吸收以下内容：静默 brief inference、设计 dials、色彩/字体/布局一致性、反 AI tells、文案自审、轻量 preflight。

替代方案是直接覆盖为 v2。该方案被排除，因为 v2 默认 React/Next/Tailwind/Motion，且会要求输出 `Design Read`、安装依赖或使用构建工具，不适合当前 PageBuilder 普通用户体验。

### 2. 静态页面输出采用强约束文件结构

`taste-skill` 在 PageBuilder 中 SHALL 将自有样式和脚本拆分到 `workspace-files/assets/styles.css` 与 `workspace-files/assets/script.js`，`index.html` 只保留语义结构、meta 与资源引用。这样可以让预览、导出、模板化和后续编辑更稳定，也减少 agent 将大段内联 CSS/JS 堆在 HTML 中造成的维护成本。

允许少量不可避免的小型 inline 属性或无脚本降级结构，但不允许大段 `<style>` / `<script>` 成为默认输出方式。

### 3. 外部依赖默认零依赖，确需使用时 unpkg-only

默认使用原生 HTML/CSS/JS。只有当交互或视觉效果用原生方式实现成本明显过高时，才可引用浏览器可直接运行的 CSS/JS 库。引用必须满足：

- 来源为 `https://unpkg.com/`；
- 版本固定，不使用 `@latest`；
- 能在浏览器中直接运行，不需要 bundler、transpiler、npm install 或构建步骤；
- 页面核心内容在依赖加载失败时仍可阅读。

React、Next、Framer Motion、shadcn/ui、Tailwind 构建链等需要构建工具或组件工程上下文的方案不作为 PageBuilder 默认路径。

### 4. 设计质量规则内部化，不扩大用户可见输出

v2 的 `Design Read` 思路保留为内部判断：agent 应从已确认 brief 中静默判断页面类型、受众、风格词、约束和适合的设计强度，但不向用户输出长篇设计推理。用户可见回复继续保持产品级、简短、面向可见结果。

### 5. CMS 边界不因静态页面升级而放松

普通非 CMS 页面区域继续使用 HTML/CSS/JS。已有 `cms-catalog` / `cms-content` 仍视为宿主管理的 CMS source tags；Vue template 语法只允许在当前 CMS source tag 的 slot authoring 内部出现。`taste-skill` 不得引入 page-wide Vue runtime、React runtime 或其他框架 runtime 来接管整页。

## Risks / Trade-offs

- [Risk] 过多设计规则会增加 skill 文档长度和 prompt 负担 → Mitigation: 只吸收 v2 核心规则，裁剪 appendices、安装命令、大量设计系统映射和 block library 合约。
- [Risk] unpkg CDN 在导出的静态包运行时可能不可用 → Mitigation: 明确默认零依赖，并要求核心内容无脚本可读；完全离线 vendor 化不纳入本次范围。
- [Risk] 过强的“禁止”规则可能压制用户明确想要的风格 → Mitigation: 文档使用“默认避免，用户明确要求时可有意图地执行”的表达，而不是所有风格一刀切硬禁。
- [Risk] 单纯修改 skill 文档无法完全防止模型偶发生成构建型代码 → Mitigation: 通过文档测试锁定关键约束，并在后续真实样例中继续迭代 prompt。
