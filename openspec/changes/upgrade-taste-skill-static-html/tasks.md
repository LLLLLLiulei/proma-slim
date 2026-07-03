## 1. Skill 文档升级

- [x] 1.1 重写 `apps/app/default-skills/taste-skill/SKILL.md` 的 PageBuilder 静态页面输出契约，保留 `taste-skill` 名称、execute-only worker 定位和首轮视觉生成职责。
- [x] 1.2 明确默认文件结构为 `workspace-files/index.html`、`workspace-files/assets/styles.css`、`workspace-files/assets/script.js`，并要求自有 CSS/JS 拆分到 `assets/`。
- [x] 1.3 移除或改写 React/Next、Tailwind 构建链、Framer Motion、shadcn/ui、安装命令、package manager 检查等构建型默认规则。
- [x] 1.4 增加外部 JS/CSS 依赖策略：默认零依赖；确需外部库时仅允许固定版本的 `https://unpkg.com/` 浏览器直连资源。
- [x] 1.5 吸收升级版 taste skill 的核心设计质量约束，包括静默 brief inference、design dials、色彩/字体/布局一致性、反 AI 模板化、文案自审和轻量 preflight。
- [x] 1.6 保留并强化 CMS island / Vue authoring 边界，确保普通页面区域继续使用 HTML/CSS/JS，不引入 page-wide framework runtime。

## 2. 测试覆盖

- [x] 2.1 更新或新增 skill 文档测试，断言 `taste-skill` 仍声明为 PageBuilder execute-only visual worker，并保留首轮整页生成与首轮 block 重设计职责。
- [x] 2.2 增加测试断言 `taste-skill` 明确声明 `workspace-files/index.html`、`workspace-files/assets/styles.css`、`workspace-files/assets/script.js` 输出结构。
- [x] 2.3 增加测试断言外部 JS/CSS 依赖仅允许固定版本 `https://unpkg.com/`，且默认零依赖。
- [x] 2.4 增加测试断言 `taste-skill` 不再包含构建型默认规则或安装命令要求，例如 `React or Next.js`、`Tailwind CSS for 90%`、`npm install`、`Framer Motion` 默认路径等。
- [x] 2.5 增加测试断言 `taste-skill` 保留 CMS island、Vue slot authoring 和普通 HTML/CSS/JS 边界。

## 3. 验证

- [x] 3.1 运行聚焦的 skill 文档测试，确认新增约束全部通过。
- [x] 3.2 运行 `bun run typecheck`，确认文档测试调整未引入类型错误。
- [x] 3.3 运行 `openspec status --change upgrade-taste-skill-static-html`，确认 change 已达到 apply-ready 状态。
