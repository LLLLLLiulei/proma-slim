## ADDED Requirements

### Requirement: `taste-skill` 在 PageBuilder 中必须按静态 HTML-first 契约执行
系统 SHALL 让 `taste-skill` 在 PageBuilder 中作为 execute-only visual worker 执行首轮整页视觉生成与首轮明显 block 重设计；该 worker 的默认产物 MUST 是可直接预览和导出的静态 HTML/CSS/JS，而不是需要构建工具、包管理器或框架工程上下文的应用。

#### Scenario: 首轮生成写入拆分后的静态文件
- **WHEN** `page-builder-guided-generation` 在确认后调用 `taste-skill` 生成首轮整页页面
- **THEN** `taste-skill` SHALL 将页面入口写入 `workspace-files/index.html`
- **AND** `taste-skill` SHALL 将自有样式写入 `workspace-files/assets/styles.css`
- **AND** `taste-skill` SHALL 将自有脚本写入 `workspace-files/assets/script.js`
- **AND** `taste-skill` SHALL 使用相对路径从 `index.html` 引用这些资源

#### Scenario: 大块首轮重设计保持静态文件结构
- **WHEN** `taste-skill` 被用于首轮明显 block 重设计
- **THEN** `taste-skill` SHALL 在当前 `workspace-files/` 预览产物内完成修改
- **AND** `taste-skill` SHALL 继续维护 `index.html`、`assets/styles.css` 与 `assets/script.js` 的职责拆分
- **AND** `taste-skill` SHALL NOT 创建需要额外构建步骤的新前端工程

#### Scenario: 纯静态页面不默认内联大段样式或脚本
- **WHEN** `taste-skill` 生成或重做普通非 CMS 页面区域
- **THEN** `taste-skill` SHALL 将大段 CSS 和 JavaScript 放入 `workspace-files/assets/` 下的资源文件
- **AND** `taste-skill` SHALL NOT 默认把整页 CSS 堆入 `index.html` 的大型 `<style>` 标签
- **AND** `taste-skill` SHALL NOT 默认把整页交互逻辑堆入 `index.html` 的大型 `<script>` 标签

### Requirement: `taste-skill` 的外部 JS/CSS 依赖必须是 unpkg-only 且无需构建
系统 SHALL 让 `taste-skill` 默认使用零外部依赖；当确有必要引用外部 JS 或 CSS 库时，依赖 MUST 来自 `https://unpkg.com/`，MUST 固定具体版本，并且 MUST 能被浏览器直接加载运行。

#### Scenario: 需要外部浏览器库时只引用固定版本 unpkg 资源
- **WHEN** `taste-skill` 判断某个视觉或交互效果确实需要外部 JS/CSS 库
- **THEN** `taste-skill` SHALL 只使用以 `https://unpkg.com/` 开头的资源 URL
- **AND** `taste-skill` SHALL 在 URL 中固定具体版本
- **AND** `taste-skill` SHALL NOT 使用 `@latest` 或未固定版本的包引用

#### Scenario: 禁止需要构建工具的前端依赖作为默认输出
- **WHEN** `taste-skill` 在 PageBuilder 普通静态页面中选择技术实现
- **THEN** `taste-skill` SHALL NOT 默认使用 React、Next.js、Framer Motion、shadcn/ui、Tailwind 构建链或其他需要编译/打包的依赖
- **AND** `taste-skill` SHALL NOT 输出 `npm install`、`bun install`、`pnpm install`、`yarn add` 或等价安装命令作为完成页面生成的前置步骤

#### Scenario: 外部依赖加载失败时核心内容仍可读
- **WHEN** `taste-skill` 选择从 unpkg 引入可选 JS/CSS 资源
- **THEN** 页面 SHALL 保持核心文本、主要结构和主要 CTA 在依赖加载失败时仍可阅读或可访问
- **AND** `taste-skill` SHALL NOT 让页面主要内容完全依赖外部运行时渲染后才出现

### Requirement: `taste-skill` 必须静默应用适合静态页面的设计质量判断
系统 SHALL 让 `taste-skill` 根据已确认的用户简报静默判断页面类型、目标受众、风格方向、约束和设计强度，并在生成中应用适合静态 HTML 页面的质量约束；该 worker SHALL NOT 接管普通用户侧澄清、最终确认或对话路由。

#### Scenario: 根据已确认简报静默推导设计方向
- **WHEN** `taste-skill` 开始执行首轮视觉生成或首轮明显 block 重设计
- **THEN** `taste-skill` SHALL 从已确认简报和当前页面上下文中推导页面类型、受众、风格词、品牌素材和约束
- **AND** `taste-skill` SHALL 将这些判断用于布局、动效、密度、字体和色彩选择
- **AND** `taste-skill` SHALL NOT 向用户输出长篇 design read、内部路由说明或 skill 执行过程

#### Scenario: 默认避免常见 AI 模板化设计
- **WHEN** `taste-skill` 生成普通专题页、活动页、落地页或作品集页
- **THEN** `taste-skill` SHALL 默认避免 AI 紫蓝渐变、无理由居中 hero、三等分等高卡片、泛玻璃拟态、空泛营销文案和重复 section 布局
- **AND** `taste-skill` MAY 在用户明确要求相关风格时有意图地使用对应元素
- **AND** `taste-skill` SHALL 保持整页色彩、字体、圆角、间距和 CTA 意图一致

#### Scenario: 生成前后执行轻量质量预检
- **WHEN** `taste-skill` 完成页面文件写入前
- **THEN** `taste-skill` SHALL 检查页面是否保持静态 HTML/CSS/JS 输出、移动端可用、首屏清晰、主要 CTA 可见、动效支持 reduced motion、文案具体且不编造强事实
- **AND** `taste-skill` SHALL 修正明显违反这些质量约束的问题后再完成输出

### Requirement: `taste-skill` 必须保留 CMS island 与 Vue authoring 边界
系统 SHALL 让 `taste-skill` 在静态 HTML-first 升级后继续遵守 PageBuilder 的 CMS authoring contract；已有 `cms-catalog` / `cms-content` 是宿主管理的 CMS source tags，Vue template 语法只可存在于当前 CMS source tag 的 slot authoring 内部。

#### Scenario: 普通页面区域不得被升级为全页框架应用
- **WHEN** `taste-skill` 修改普通非 CMS 页面区域
- **THEN** `taste-skill` SHALL 使用普通 HTML/CSS/JS 完成结构、样式与交互
- **AND** `taste-skill` SHALL NOT 引入 page-wide Vue runtime、React runtime、importmap、framework bootstrap 或全页 mount 流程

#### Scenario: 已有 CMS 区域只在当前 source tag 内使用受控 Vue authoring
- **WHEN** `taste-skill` 需要调整当前页面中已有 `cms-catalog` 或 `cms-content` 区域的视觉结构
- **THEN** `taste-skill` MAY 只在该当前 CMS source tag 的 slot templates 中使用符合 canonical contract 的 Vue template 语法
- **AND** `taste-skill` SHALL NOT 在 CMS source tag 外部的普通页面区域新增 `v-*`、`@*`、`:` 绑定或 `{{ ... }}` 插值
- **AND** `taste-skill` SHALL NOT 静默改写 CMS binding identity 或新建新的 `cms-*` 标签
