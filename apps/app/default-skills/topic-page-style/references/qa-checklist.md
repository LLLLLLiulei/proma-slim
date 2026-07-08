# 质量校验清单

> 查阅时机：SKILL.md 第六节"生成流程"第 7 步静态自检后、第 8 步渲染验收时，用这份清单过一遍脚本覆盖不到的主观/细节项。

## 分工说明：脚本 vs 人工

`scripts/validate_page.py` 已自动检查以下**可编程验证**的项，本清单不再重复：

- ✅ **FAIL（阻断）**：锚点完整性（href="#x" 必须有 id="x"）
- ✅ **FAIL（阻断）**：假链接（`href="#"`、`href="javascript:..."`、空 `href`）
- ✅ **FAIL（阻断）**：禁用元素（picsum.photos、backdrop-filter 玻璃拟态）
- ✅ **FAIL（阻断）**：默认 `.gallery--asymmetric` 中全部使用占位图形成大面积伪图集
- ✅ **FAIL（阻断）**：相邻 section 布局重复（data-layout 节奏）；确属同类并列信息时需显式加 `data-layout-repeat="true"`
- ✅ **FAIL（阻断）**：`section` 缺少 `id` 或 `data-layout`
- ✅ **FAIL（阻断）**：HTML 结构完整性（DOCTYPE、viewport meta）
- ⚠️ **WARN（警告）**：默认主题色未替换、首屏强视觉页面缺真实 Banner（启发式检测，最终以本清单人工确认图片策略是否完成为准）、图片路径不存在或不在 `assets/`、未闭合标签、装饰性 emoji、外层 box-shadow、word-break:break-all、lang 属性缺失、长 Header 文案拥挤风险

以下清单覆盖脚本**无法自动判断**、需要人工确认的项。

## A. 文字与排版

- [ ] 长标题是否会挤飞同行的日期/按钮？（标题 `flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`，日期/按钮 `flex-shrink:0`）
- [ ] 卡片描述行数是否用 `line-clamp` 统一，避免高度参差？
- [ ] 数字类内容（统计值、日期、时间）是否都加了 `font-variant-numeric:tabular-nums`？
- [ ] 中文行高是否用了 `var(--leading)`，而不是浏览器默认值？
- [ ] 是否误用了 `word-break:break-all`（会误伤中文标点）？中文场景应使用 `overflow-wrap:anywhere`。
- [ ] 长文限宽是否用 `em`/`px` 而非 `ch`（`ch` 按拉丁字符计量，中文场景会偏窄）？

## B. 图片

- [ ] 生成或选用图片前，是否区分了页面任务词、内容对象词、领域词和调性词？图片主体是否服务页面任务词，而不是只服务领域词？
- [ ] 会议、培训、活动、政策、成果展示等页面是否优先呈现对应任务场景、设计型 KV 或抽象主视觉，而不是被行业领域词带偏到生产现场、设备特写、施工现场或负面风险画面？
- [ ] 写 HTML 前是否已查看当前工具列表，自行探测 `generate_image`、`text_to_image`、`image_generation`、`create_image` 等图片生成 MCP 工具，而不是只按固定工具名判断？
- [ ] 如果存在图片生成 MCP，是否按该工具的真实 schema 传入 prompt 与尺寸/比例，并把生成结果写入或导入 `assets/`？
- [ ] 图片容器是否都设置了 `aspect-ratio` + `object-fit:cover`，避免高度参差或变形？
- [ ] 是否同时锁死了图片的宽和高（会导致变形）？应该只锁 `aspect-ratio` + `width:100%`。
- [ ] Header 使用整张已设计 KV/海报图时，是否使用 `.kv-banner` 或 `.hero--poster-image` 保持整图不裁切？
- [ ] Header 使用背景式 hero 时，结构是否为 `.hero` 直接子元素：`img.hero__bg` → `.hero__overlay` → `.hero__content`？背景图不能放进 `.hero__content`。
- [ ] 占位图的文字标签是否与页面主题相关（如"会议现场""专家介绍"），而不是写"图片占位"这类无意义文字？
- [ ] Banner 图片策略是否已按 SKILL.md 第一节执行完毕（使用用户/项目素材，或宿主提供工具生成，或通过图片搜索/下载工具导入，或已安全回退 CSS 占位）？
- [ ] 如果宿主提供图片生成能力，Banner 是否已先尝试生成并实际接入 HTML，而不是直接降级为纯 CSS Hero？
- [ ] 如果只提供 `mcp__image_search__search_images` / `mcp__image_search__download_images` 这类图片搜索/下载工具，是否先搜索并导入了合适横向图，而不是把“没有 AI 生图工具”当作没有视觉资产能力？
- [ ] 如果调用宿主 MCP/图片工具生成图片，是否按最终使用区块传入尺寸参数（如 `width`、`height`、`aspectRatio`、`size`），或在 prompt 中明确目标尺寸和比例？
- [ ] 如果使用图片搜索工具且工具不支持尺寸参数，是否传入 `orientation: landscape` 并优先选择宽高比接近目标区块的候选图？
- [ ] 如果 Banner 是 AI 生成图片，是否只检查主题贴合、乱码文字、人脸、争议符号和不适内容，而没有主动进行水印检查或因“AI生成”类平台提示阻断使用？
- [ ] 如果图片来自外部来源、用户/CMS 素材或疑似素材站，是否检查第三方水印、素材站 logo、版权署名、二维码或平台角标？
- [ ] 最终 HTML 是否没有输出“无图片生成工具”“已安全回退”等内部工具判断注释？

## C. 布局稳健性

- [ ] 如果目标是传统 CMS 专题页，是否使用了 `.topic-shell` + `.module-box` 的内容壳，而不是只用大面积交替 `section--alt`？
- [ ] 传统 CMS 内容壳是否使用 960–1080px 左右的 `--shell-width`，而不是默认把正文拉到 1200px？
- [ ] 模块分隔是否主要依靠细边框、栏目标题线、浅灰分隔线，而不是白卡悬浮阴影？
- [ ] Header 是否只保留主标题和短口号？是否避免同时使用英文副标题、长主标题、多行会务信息？
- [ ] 无真实图片时，是否避免使用大面积 `.gallery--asymmetric` 伪图集？会议风采/图集模块是否控制高度，避免一张占位大图撑满首屏？
- [ ] 如果 Header 已经是 CSS/SVG 主视觉，正文中是否避免继续堆多个同风格大色块视觉模块？
- [ ] flex 子项是否都设置了 `min-width:0`，避免被内容撑爆？
- [ ] grid 的列宽是否用 `minmax(0, 1fr)` 而非裸 `1fr`？
- [ ] flex-wrap 场景下，间距是否统一用 `gap` 而非 `margin`（避免换行后间距不一致）？
- [ ] **图文平衡**（B 布局）：文字区域高度是否 ≥ 图片高度的 70%？若文少图空，是否已改用 `flex-start` 顶对齐 + 更扁的图比例（见 SKILL.md 第四节）？

## D. 响应式

- [ ] 768px 断点：双栏布局（B/J/M）是否正确回落为单栏纵向堆叠？
- [ ] Tab 导航在移动端是否可以横向滚动，且不换行？传统 CMS 页面默认静态导航；只有现代单页锚点才加 `.tab-nav--sticky`。
- [ ] 标题字号是否用了 `clamp()`，避免超宽屏或窄屏溢出？

## E. 交互验证（含 JS 的组件）

- [ ] Tab 点击后是否平滑滚动到位，且当前 tab 高亮正确？
- [ ] 锚点跳转的目标 section 是否被吸顶导航遮挡（检查 `scroll-margin-top`）？
- [ ] Hero/内容区轮播是否能自动播放，也能手动点击圆点切换？

## E2. 浏览器渲染验收（有浏览器/Playwright 时）

- [ ] 桌面视口（约 1366-1440px 宽）打开页面后，首屏 Banner/KV 是否加载且非空？
- [ ] 移动视口（约 390px 宽）打开页面后，是否没有水平滚动、文字重叠、按钮/导航挤压？
- [ ] Banner 关键主体和标题是否没有被裁掉？完整海报是否使用 `.kv-banner` 或 `.hero--poster-image` 保持整图？
- [ ] Tab 导航在移动端是否可横向滚动或自然换行，且单项仍可点击？
- [ ] 所有真实图片是否成功加载，没有 404、空 `src`、外链随机占位或变形？
- [ ] 多栏模块在移动端是否正确折叠：B/J/M 单栏，F/E/视频网格 2 列或 1 列，议程表转为可读卡片/时间轴？

## F. 反 AI 感与视觉判断（主观项，对照 SKILL.md 第三节表格逐条确认）

- [ ] 圆角是否按场景区分，而不是全页统一成一个"看起来安全"的数值？
- [ ] 是否出现了弥散阴影/悬浮卡片效果？应替换为细边框。
- [ ] 是否出现了装饰性 emoji？脚本只 WARN，人工仍必须替换为 CSS 形状或纯文字标记。
- [ ] 配色是否完成了"防重复检查"（`references/color-system.md` 第 5 节）？
- [ ] 标题变体、Header 形式、圆角这几个维度是否已在内部确认选择依据，而不是沿用了默认值？最终 HTML 前后不要输出解释文字。

## G. 收尾

- [ ] 页面是否为纯 HTML/CSS/JS，没有引入 React/Vue 等框架？
- [ ] 是否已经运行过 `scripts/validate_page.py` 并且所有 FAIL 项都已修复（WARN 项已人工确认可接受）？
- [ ] 会议天数、具体日期、议程时间、场次数、报名二维码、备案信息、主办/承办单位、联系方式等硬事实是否都来自用户/真实素材；未提供时是否使用弱占位或“待发布”表述，而不是确定数字或正式安排？

---

## 附录：常见修复速查（出问题时按现象查表）

### 文字溢出

| 现象 | 修复 |
|------|------|
| 长标题挤飞同行日期/按钮 | `标题{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` `日期{flex-shrink:0}` |
| 卡片摘要行数不一 | 用 `.line-1`/`.line-2`/`.line-3` 工具类统一 |
| 长 URL 撑破容器 | `overflow-wrap:anywhere;word-break:break-word` |
| 数字宽度跳动 | `font-variant-numeric:tabular-nums` |

### 图片

| 现象 | 修复 |
|------|------|
| 图片高度参差 | 容器设 `aspect-ratio` + `img{width:100%;object-fit:cover}`（参照 base.css 中所有 img 规则的模式） |
| 图片变形 | `aspect-ratio` + `width:100%`，不要同时锁死宽高 |
| 图片撑爆 flex | `图{flex:0 0 40%;min-width:280px}` + `img{width:100%}` |
| CLS 布局位移 | 图容器预设 `aspect-ratio` + `background:var(--color-bg-alt)` 占位 |

### flex/grid 塌陷

| 现象 | 修复 |
|------|------|
| grid `1fr` 被撑爆 | `grid-template-columns: repeat(N, minmax(0, 1fr))` |
| flex 子项溢出 | 所有 flex 子项 `min-width:0` |
| flex-wrap 行间距不一致 | 用 `gap` 不用 `margin` |

### 中文专项

| 现象 | 修复 |
|------|------|
| 行高不够段落发闷 | `line-height:var(--leading)` |
| `word-break:break-all` 误伤中文标点 | 改用 `overflow-wrap:anywhere` |
| `ch` 单位中文偏窄 | `ch` 按拉丁 `0` 计量，中文全角约 2ch。中文正文用 `em` 或 `px`（如 `max-width:38em`） |
