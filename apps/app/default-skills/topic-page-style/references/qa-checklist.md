# 质量校验清单

> 查阅时机：SKILL.md 第六节"生成流程"第 5 步，跑完 `scripts/validate_page.py` 之后，用这份清单过一遍脚本覆盖不到的主观/细节项。

## 分工说明：脚本 vs 人工

`scripts/validate_page.py` 已自动检查以下**可编程验证**的项，本清单不再重复：

- ✅ **FAIL（阻断）**：锚点完整性（href="#x" 必须有 id="x"）
- ✅ **FAIL（阻断）**：禁用元素（picsum.photos、backdrop-filter 玻璃拟态）
- ✅ **FAIL（阻断）**：相邻 section 布局重复（data-layout 节奏）
- ✅ **FAIL（阻断）**：HTML 结构完整性（DOCTYPE、viewport meta）
- ⚠️ **WARN（警告）**：未闭合标签、装饰性 emoji、非 inset 的 box-shadow、word-break:break-all、lang 属性缺失

以下清单覆盖脚本**无法自动判断**、需要人工确认的项。

## A. 文字与排版

- [ ] 长标题是否会挤飞同行的日期/按钮？（标题 `flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`，日期/按钮 `flex-shrink:0`）
- [ ] 卡片描述行数是否用 `line-clamp` 统一，避免高度参差？
- [ ] 数字类内容（统计值、日期、时间）是否都加了 `font-variant-numeric:tabular-nums`？
- [ ] 中文行高是否用了 `var(--leading)`，而不是浏览器默认值？
- [ ] 是否误用了 `word-break:break-all`（会误伤中文标点）？中文场景应使用 `overflow-wrap:anywhere`。
- [ ] 长文限宽是否用 `em`/`px` 而非 `ch`（`ch` 按拉丁字符计量，中文场景会偏窄）？

## B. 图片

- [ ] 图片容器是否都设置了 `aspect-ratio` + `object-fit:cover`，避免高度参差或变形？
- [ ] 是否同时锁死了图片的宽和高（会导致变形）？应该只锁 `aspect-ratio` + `width:100%`。
- [ ] 占位图的文字标签是否与页面主题相关（如"会议现场""专家介绍"），而不是写"图片占位"这类无意义文字？
- [ ] Banner 图片策略是否已按 SKILL.md 第一节执行完毕（已生成，或已声明扫描结果为空/生成失败原因）？

## C. 布局稳健性

- [ ] flex 子项是否都设置了 `min-width:0`，避免被内容撑爆？
- [ ] grid 的列宽是否用 `minmax(0, 1fr)` 而非裸 `1fr`？
- [ ] flex-wrap 场景下，间距是否统一用 `gap` 而非 `margin`（避免换行后间距不一致）？
- [ ] **图文平衡**（B 布局）：文字区域高度是否 ≥ 图片高度的 70%？若文少图空，是否已改用 `flex-start` 顶对齐 + 更扁的图比例（见 SKILL.md 第四节）？

## D. 响应式

- [ ] 768px 断点：双栏布局（B/J/M）是否正确回落为单栏纵向堆叠？
- [ ] Tab 导航在移动端是否可以横向滚动，且不换行？
- [ ] 标题字号是否用了 `clamp()`，避免超宽屏或窄屏溢出？

## E. 交互验证（含 JS 的组件）

- [ ] Tab 点击后是否平滑滚动到位，且当前 tab 高亮正确？
- [ ] 锚点跳转的目标 section 是否被吸顶导航遮挡（检查 `scroll-margin-top`）？
- [ ] Hero/内容区轮播是否能自动播放，也能手动点击圆点切换？

## F. 反 AI 感与视觉判断（主观项，对照 SKILL.md 第三节表格逐条确认）

- [ ] 圆角是否按场景区分，而不是全页统一成一个"看起来安全"的数值？
- [ ] 是否出现了弥散阴影/悬浮卡片效果？应替换为细边框。
- [ ] 是否出现了装饰性 emoji？应替换为 CSS 形状或纯文字标记。
- [ ] 配色是否完成了"防重复检查"（`references/color-system.md` 第 5 节）？
- [ ] 标题变体、Header 形式、圆角这几个维度是否都写出了选择依据，而不是沿用了默认值？

## G. 收尾

- [ ] 页面是否为纯 HTML/CSS/JS，没有引入 React/Vue 等框架？
- [ ] 是否已经运行过 `scripts/validate_page.py` 并且所有 FAIL 项都已修复（WARN 项已人工确认可接受）？

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
