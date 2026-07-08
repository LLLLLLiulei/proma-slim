# 布局参考手册

> 本文件只在 `SKILL.md` 第三节的决策表选定某个布局字母后查阅——**只读你需要的那一节，不必通读全文**。
> 每节给出：线框图、内容约束、易错点、对应的 CSS 类名。**具体的 CSS 属性值在 `assets/base.css` 里，本文件不重复誊写**——需要样式细节时去看那个文件，改数值也在那个文件里改。
> 
> **提醒**：每个 `<section>` 必须加 `data-layout="X"` 属性（X 为布局字母，如 `data-layout="D"`），这是 `scripts/validate_page.py` 自动校验布局节奏的依据。同布局不同形态可加后缀（如 `data-layout="M-twin"`）。相邻 section 确属同类并列信息时，显式加 `data-layout-repeat="true"`。

## 目录

| 布局 | 一句话说明 | 对应 CSS 选择器（在 base.css 中） |
|---|---|---|
| [KV/海报 Banner](#kv海报-banner) | 保持整图海报不裁切的 Header | `.kv-banner`, `.hero--poster-image` |
| [CMS 内容壳](#cms-内容壳与模块框) | 传统专题页的白色内容壳与模块框 | `.topic-shell`, `.module-box`, `.module-header` |
| [栏目标题变体](#栏目标题四种变体所有布局共用) | 四种 section 标题样式 | `.section-title` 系列 |
| [A 纯文卡片](#布局-a纯文卡片) | 段落文字、说明 | `.section-body`, `.pullquote` |
| [B1/B2 双栏图文](#布局-b1b2双栏图文) | 图文 zigzag 交替 | `.row`, `.row--reverse` |
| [C 数据展示行](#布局-c数据展示行) | 统计数字 | `.stats`, `.stat-item` |
| [D 时间线/议程表](#布局-d时间线) | 历程、议程 | `.timeline`, `.agenda` |
| [E 图片画廊](#布局-e图片画廊) | 多图并列 | `.gallery` |
| [F 列表卡片](#布局-f列表卡片) | 并列条目 | `.card-grid`, `.card` |
| [G CTA区块](#布局-gcta-区块) | 报名/联系 | `.cta` |
| [H Tab导航](#布局-htab--栏目导航) | 栏目切换 | `.tab-nav` |
| [I 新闻列表行](#布局-i新闻列表行) | 标题+日期条目 | `.news-list` |
| [J 焦点区](#布局-j焦点区) | 左大图+右列表 | `.focus` |
| [K Hero轮播](#布局-khero-轮播图) | Header多图轮播 | `.hero-carousel` |
| [L 内容区滑动](#布局-l内容区图片滑动) | 水平滑动 | `.slider`, `.carousel` |
| [M 两栏并排](#布局-m两栏并排) | section内左右并排 | `.page-layout` |
| [特殊专题模块](#特殊专题模块) | 榜单色带、节日愿望区、会务页脚 | `.ranking-band`, `.festival-band`, `.footer__qr` |

---

## KV/海报 Banner

参考截图的首屏多数是“已设计好的整图海报”，不是普通背景图裁切后再叠 DOM 标题。

```html
<header class="kv-banner kv-banner--center">
  <img src="assets/banner.jpg" alt="页面主标题">
</header>
```

**使用规则**：

- 有完整 KV/海报图时，优先用 `.kv-banner`，图片 `width:100%; height:auto`，避免 `object-fit:cover` 裁掉海报文字、logo 或装饰。
- 如果必须沿用 `.hero` 结构展示纯图，用 `.hero--poster-image`，让 `.hero__bg` 改为静态图片流。
- 无真实图时才使用 `.hero--gradient`、`.placeholder-visual` 或更克制的 `.placeholder-cms` 兜底；传统 CMS 页面优先 `.placeholder-cms`，避免首屏几何渐变感过重。
- 导航条通常紧贴 KV 下方，不额外留大空白。

---

## CMS 内容壳与模块框

传统中文专题页优先使用内容壳，而不是全页大面积交替底色。

```text
<main class="topic-shell">
  ┌──────────────────────────────────────────┐
  │ module-box: 栏目标题 + 焦点区/新闻/图集  │
  ├──────────────────────────────────────────┤
  │ module-box: 双栏栏目 / 议程 / 嘉宾        │
  └──────────────────────────────────────────┘
</main>
```

**使用规则**：

- `.topic-shell` 控制页面主内容宽度、白底、细边框和模块之间的紧凑间距；默认使用 `--shell-width:1040px`，`.topic-shell--narrow` 为 960px，`.topic-shell--wide` 为 1200px。
- `.module-box` 是栏目模块容器，适合传统 CMS 的头条、资讯、图集、议程、视频等。
- `.module-header` 用于“栏目标题 + 更多>”的门户式标题行。
- 如果页面是纪实叙事或榜单长条，可以不用 `.topic-shell`，但仍要让每个模块有稳定宽度和清晰边界。

---

## 栏目标题（四种变体，所有布局共用）

标题是每个 section 的起点。四种变体按页面气质选择，全页统一一种。0D 是传统 CMS 门户/会议/政务页面的优先形态；0A 是常规信息默认形态但仍需主动确认选择依据（见 SKILL.md 第四节）。特殊区块（如议程）可使用不同变体。

```
变体 0A 左色条：       ▌ 区块标题
变体 0B 居中装饰线：        区块标题
                        ━━━━━━━━
变体 0C 色块标题条：   █████ 区块标题 █████
变体 0D CMS 横线：     ───── ◆ 区块标题 ◆ ─────
```

标题右侧可选"更多>"小字链接，指向列表详情，类名 `.section-title__more`。

**推荐**：传统 CMS 门户/政务/会议页面优先使用 `.section-title--cms-line` 或 `.module-header`。0B 下短线更接近现代落地页，除文旅/纪实页外不要默认使用。

**可选装饰**：政务/节庆可用 `.section-title--ribbon` 或 `.section-divider-logo`；门户蓝色短线标题可用 `.section-title--portal-blue`。

---

## 布局 A：纯文卡片

**用于**：段落文字、说明、项目介绍。

```
┌──────────────────────────────────────────────────────┐
│  栏目标题 (变体 0A/0B/0C 选一)                       │
│  正文段落 · line-height: var(--leading)               │
│  [可选] 配图: 居中, max-width:100%, 圆角按场景         │
└──────────────────────────────────────────────────────┘
```

**内容约束**：段落 ≤300 字/段；配图 `aspect-ratio: 16/9` 或 `4/3`。长文可用 `.section-body--narrow` 限制窄栏阅读宽度（已内置 `margin:0 auto` 居中）。

**易错点**：连续出现多个纯文区块会显得单调——纯文卡片仅用于概述和简短说明，不应连续出现。宽幅（>1200px）下使用 `--narrow` 会造成标题整宽、正文半宽的视觉割裂；此时应优先考虑将页面密度升为标准档，或将标题也收窄到与正文同宽。

**引用块变体**：突出重要文字时用 `.pullquote`（左边框+浅色底）。

---

## 布局 B1/B2：双栏图文

**用于**：一段文字配一张图。图固定 `flex:0 0 40%`，文 `flex:1`。奇数 B1(左图右文)，偶数 B2(右图左文，加 `.row--reverse`)。

```
B1: [ 图 40% ][ 文 60% ]    B2: [ 文 60% ][ 图 40% ]
```

**内容约束**：图 `aspect-ratio: 4/3`（初始参考值，**必须**按 SKILL.md 第四节显式选择实际比例后再使用，不能直接沿用）；标题 ≤24 字；正文 ≤120 字。图宽度默认 40%，可加 `.row--tight`（35%）或 `.row--compact`（30%）。顶对齐加 `.row--top`。三者可任意组合。

**易错点（双向）**：
- **图过大挤没文字**：图必须固定 `flex:0 0 40%`；文字容器必须 `min-width:0` 防长标题撑爆容器。
- **文少图空、居中留白**：当文字量少（< 图高的 70%）时，`align-items: center` 会让文字"浮"在图旁边，上下虚空。应对：① 降图比例 `4:3→3:2` 或 `16:9`（降图高）② 加 `.row--top`（`align-items:flex-start`，文顶对齐不悬空）③ 缩图宽：`.row--tight`（图 35%）或 `.row--compact`（图 30%）。三者可组合，如 `.row.row--top.row--compact`。
- **图文平衡判断**：生成前估算文字区域高度是否 ≥ 图片渲染高度的 70%。是 → `center` 居中；否 → `.row--top` + 更扁的图比例 + 缩窄图宽度（三者至少选其一，严重不匹配时三者全上）。

---

## 布局 C：数据展示行

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  47.2%   │  │  1,280   │  │  89 亿   │   数字: clamp(28px,3vw,40px) bold accent
│  指标说明  │  │  指标说明  │  │  指标说明  │   标签: 14px secondary
└──────────┘  └──────────┘  └──────────┘
```

**内容约束**：每行 3–5 个；每个 `min-width:140px`；数字必须 `font-variant-numeric:tabular-nums` 防止宽度跳动。

**多组数据行的处理**：如果同一页面需要多组统计数字，不必强行插入其他布局分隔——用列数（3列 vs 4列）或是否带图标区分,见 SKILL.md 第三节"例外条款"。

---

## 布局 D：时间线

```
●──── YYYY.MM  事件标题
│     事件描述...
◉──── YYYY.MM  事件标题 (当前项, accent 高亮)
```

**内容约束**：每条 = 时间 + 标题 + 描述(可省)；时间用 `tabular-nums`。

**议程表变体**（时间+议题+地点/主讲人等多列信息时使用 `.agenda` 表格而非时间线）：

```
时间          议程内容                    地点/主讲人
时间待发布     开幕环节待确认               地点待确认 / 主讲人待确认
时间待发布     主题交流方向待发布             地点待确认 / 主讲人待确认
```

**选择建议**：描述性强、有叙事顺序 → 时间线；结构化、多列信息、用户说"议程表" → 表格（移动端自动转卡片式，见 base.css 响应式规则）。多天议程可在每天之间插入 `.agenda-day` 标签（深色小字标签，视觉上分隔不同日期）。

**多天议程的日期标签**：`.agenda-day`（深色背景+白字标签，用于议程表中分隔不同日期）。

**会议面板变体**：会议/培训截图常见“日期标签 + 竖向时间线”的居中白色面板。用 `.agenda-panel` 包裹 `.agenda-tabs` 和 `.agenda-timeline`：

```html
<div class="agenda-panel">
  <div class="agenda-tabs">
    <span class="agenda-tabs__item active">上午</span>
    <span class="agenda-tabs__item">下午</span>
  </div>
  <ol class="agenda-timeline">
    <li class="agenda-timeline__item">
      <time class="agenda-timeline__time">时间待发布</time>
      <div class="agenda-timeline__title">议程主题待发布</div>
      <div class="agenda-timeline__desc">地点与嘉宾待确认</div>
    </li>
  </ol>
</div>
```

---

## 布局 E：图片画廊

```
┌──┐┌──┐┌──┐┌──┐
│  ││  ││  ││  │    repeat(4, 1fr)，4 列固定网格
└──┘└──┘└──┘└──┘    aspect-ratio: 1 或 4/3
```

**内容约束**：图片统一比例；数量建议 4 的倍数（4/8/12）便于网格对齐，非固定数量用 `.gallery--auto`。

**非对称变体**：`.gallery--asymmetric` 让首图占据全部 3 行（`grid-row:1/-1`），适合有一张主图+若干配图的场景。`.gallery--asymmetric` 只适合至少有 1 张真实主图或已生成的高质量主视觉图时使用；若全部图片都是占位图，不要使用默认 `.gallery--asymmetric`，改用紧凑 2x2 网格、新闻/日期卡、焦点占位，或直接省略图集模块。

**紧凑预留变体**：无真实素材但仍需要保留“会议风采/活动图集”入口时，使用 `.gallery--asymmetric-compact` 或普通 2x2 `.gallery`。该变体限制行高，避免一张占位大图撑满首屏。

**与布局 L 的选择**：图片较少(≤6张)、需一次看完 → 布局 E；图片较多或需突出每张 → 布局 L 滑动。

---

## 布局 F：列表卡片

```
┌──────────┐┌──────────┐┌──────────┐
│  上图     ││  上图     ││  上图     │  repeat(3, minmax(0,1fr))
│  标题     ││  标题     ││  标题     │  描述 line-clamp:3
│  描述...  ││  描述...  ││  描述...  │
└──────────┘└──────────┘└──────────┘
```

**内容约束**：标题 `line-clamp:2`，描述 `line-clamp:3`，保证卡片高度整齐（配合 `align-items:stretch`）。列数调整通过 modifier class 切换：`.card-grid--cols2`（2 列）、默认（3 列）、`.card-grid--cols4`（4 列）、`.card-grid--guest`（5 列）。响应式自动适配：2/4 列在 768px 回落为 2 列，4 列在 480px 回落为单列。**卡片在交替底色区块（`.section--alt`）中使用时，应加 `.card--alt` 使卡片背景继承父容器底色，避免白卡浮在灰底上（违反反 AI 感规则）。**

**不规则网格变体**（参考页面均使用非等宽排列，避免全页等宽卡片的单调感）：
- `grid-template-columns: 2fr 1fr 1fr` — 左侧大卡片 + 右侧两小卡片
- `grid-template-columns: 1fr 2fr` — 左文右大图或反之
- `grid-template-columns: 60% 40%` — 明确比例分割
- `grid-column: span 2` — 让某个卡片跨列

**嘉宾卡变体**（`.card-grid--guest`，桌面 5 列/平板 3 列/手机 2 列）：圆形头像 `.card__avatar`，无照片时省略头像只保留姓名+身份，卡片改左对齐排列。方形头像变体 `.card--guest-square`（头像 `border-radius:4px`）适用于不需要圆形头像的场景。

**易错点**：grid 的 `1fr` 会被长内容撑爆——必须用 `minmax(0, 1fr)`。**卡片数 ÷ 列数**：先数卡片数量，选择能被整除的列数（4 张卡用 2 列或 4 列、不用 3 列）；若数量不适合均分，使用不规则网格（如 `2fr 1fr 1fr` 或 `span 2`）消化余数，避免最后一行只剩 1 张孤卡。

---

## 布局 G：CTA 区块

```
        "立即报名参会"
          [ 按钮 ]
     联系电话 / 邮箱 / 地址（均待补充）
```

**变体**：`.cta`（按钮式，浅色底）、`.cta--dark`（深色底，页面视觉终点，白字）、`.cta--inline`（纯文字联系方式行，传统 CMS 风格）、`.cta--qr`（二维码占位）。按钮触达尺寸不小于 `44px×44px`（移动端可点性要求）。

**页脚联系区**：会议/培训页脚优先用 `.footer.footer--multi` + `.footer__contact` + `.footer__qr` + `.footer__icp`，不要只放一行版权。

---

## 布局 H：Tab / 栏目导航

```
┌──────────────────────────────────────────────────────────┐
│   首页  │  资讯  │  议程  │  嘉宾  │  图集  │  联系      │
└──────────────────────────────────────────────────────────┘
```

**内容约束**：5–8 个栏目；每项 2–4 字；移动端横向滚动(`overflow-x:auto`)。

**交互行为**：每个 tab 的 `href` 必须指向对应 section 的 `id`。点击平滑滚动并高亮的 JS 直接从 `assets/tab-nav.js` 复制，不要重新实现。

**多种配色皮肤**（通过 modifier class 切换，具体颜色值见 base.css）：

| 皮肤 class | 背景 | 适用场景 |
|---|---|---|
| 默认（无 modifier） | 浅灰 + 底部主色条高亮 | 通用 |
| `.tab-nav--dark` | 深色底 | 科技/深色主题页面 |
| `.tab-nav--primary` | 主色实底 | 强调品牌色的场景 |
| `.tab-nav--blue` | 门户蓝实底 | 会议/培训/文旅频道等传统 CMS 导航 |
| `.tab-nav--block-active` | 当前项整块主色 | 传统栏目条整块高亮 |
| `.tab-nav--blue-red-active` | 蓝底 + 红色当前项 | 博览会/城市频道 |
| `.tab-nav--cream-block` | 米色分隔 + 块状当前项 | 培训/机构专题 |
| `.tab-nav--cream` | 浅黄米色 | 文旅/人文场景 |
| `.tab-nav--red` | 红色实底 | 节庆/政务场景 |
| `.tab-nav--white` | 纯白+细线 | 极简场景 |

---

## 布局 I：新闻列表行

```
· 新闻标题文字 ─────────────────── YYYY-MM-DD
· 新闻标题文字 ─────────────────── YYYY-MM-DD
```

**内容约束**：标题单行省略(`ellipsis`)；日期 `YYYY-MM-DD` 统一格式；条目 4–8 条。

**易错点**：长标题会挤飞日期——标题需 `min-width:0`+`text-overflow:ellipsis`+`white-space:nowrap`+`overflow:hidden`，日期需 `flex-shrink:0`。

**缩略图变体**（`.news-list--thumb`，左小图120×80 + 右标题2行+摘要2行+日期）：适合需要图文并重的资讯列表，建议优先使用此变体而非纯文字列表，呼应"图片优先"原则。

**日期卡变体**（`.news-list--date-card`）：左侧为月日日期块，右侧为标题和摘要，适合会议热点资讯、公告通知。

**视频列表/宫格变体**：缩略图外层加 `.video-thumb`，中央显示 CSS 播放按钮；多视频区使用 `.video-grid` + `.video-card` + `.video-card__title`，标题 1 行截断。

---

## 布局 J：焦点区

```
┌────────────────────────────────────────────┐
│  ┌──────────────────┐  ┌────────────────┐  │
│  │    焦点大图 55%    │  │ · 新闻标题     │  │
│  │  aspect-ratio 16:10│  │ · 新闻标题     │  │
│  └──────────────────┘  └────────────────┘  │
└────────────────────────────────────────────┘
```

**内容约束**：图 `aspect-ratio:16/10` 或 `16/9`；右侧列表 4–6 条；通常放在概述之后、详细内容之前，作为信息聚合区。

**传统 CMS 变体**：

| 变体 | 类名/组合 | 适用 |
|---|---|---|
| J1 左大图右列表 | `.focus` 默认 | 博览会、会议、新闻聚合 |
| J2 左列表右大图 | `.focus.focus--reverse` | 地方两会、资讯摘要 |
| J3 上焦点下三列 | `.module-box` 内先 `.focus` 后 `.module-grid--cols3` | 政务/门户首页首屏 |
| J4 左缩略图列表右视频 | `M` + `.news-list--thumb` + `.video-grid`/`.video-thumb` | 公益行动、视频新闻 |

焦点区通常放在 `.module-box` 内，标题用 `section-title--cms-line` 或 `module-header`。

---

## 布局 K：Hero 轮播图

**用于**：Header 区域需要展示多张图片时替代单一背景图。

```
┌──────────────────────────────────────────────────┐
│  [图1]  ←→  [图2]  ←→  [图3]                     │
│  主标题 + 副标题（可选）                           │
│              ○ ○ ●          ← 圆点指示器           │
└──────────────────────────────────────────────────┘
```

**内容约束**：2–4 张图片，统一比例；自动切换间隔 5s；JS 直接从 `assets/tab-nav.js` 复制（同一文件里包含轮播逻辑）。无真实图片时用几何渐变占位（`.hero-geo`，见 base.css）。

**替代选择**：只有一张图时用静态大图 Hero，不需要轮播。

**纯图模式**：若 Header 仅需展示一张无文字叠加的大图（如活动合影），可使用 `.hero--image-only`（隐藏遮罩和文字内容层，仅保留图片）。

---

## 布局 L：内容区图片滑动

**用于**：图片较多的 section，通过水平滑动在有限空间内展示更多内容。

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────→
│  图/卡片  │ │  图/卡片  │ │  图/卡片  │ │ ...   水平滑动
└──────────┘ └──────────┘ └──────────┘ └──────→
```

**内容约束**：每个 item 固定宽度（320px 或紧凑型 260px，紧凑型加 `.slider--tight`）；`scroll-snap` 确保滑动后对齐。

**轮播变体**（`.carousel`，自动播放+圆点指示器，适用于 section 内嵌轮播）：JS 复用 K 布局的轮播逻辑。

**嵌套用法**：可嵌入布局 M——左栏轮播+右栏文字列表。

**传统图集变体**：如果图片数量少且有主图，优先用 `.gallery--asymmetric` 而不是横滑。传统 CMS 更常见“大图 + 缩略图/说明”，横滑更偏现代移动交互。

---

## 布局 M：两栏并排

**三种形态，均为 section 级局部使用（非页面骨架）**：

| 形态 | 类名 | 场景 |
|------|------|------|
| 不对称 70/30 | 默认 | section 内一主一辅（主文+辅列表） |
| 等宽 50/50 | `--even` | section 内左右对等 |
| twin-sections | `--twin` 包裹两个独立 `.page-layout__main` | 两个平级 section 并排，各带独立标题，与整宽 section 交替 |

```
┌────────────────────────────────┐  ← 整宽 section
├──────────────┬─────────────────┤  ← twin-sections 并排
│  Section A   │   Section B     │     各 50%，各带标题
├──────────────┴─────────────────┤  ← 整宽 section
│            Section C           │
└────────────────────────────────┘
```

**内容约束**：默认 70/30。**不要**把整页所有内容塞进 M 的左栏——参考页面中无此模式，M 只解决 section 内部局部并排的需求。

---

## 特殊专题模块

这些模块只在特定截图类型中使用，避免把普通资讯/会议页做成过度装饰。

### 榜单长条海报

用于“风云榜/评选/年度盘点”：

```html
<section id="ranking" data-layout="R" class="ranking-band ranking-band--blue">
  <div class="ranking-band__content">
    <div class="ranking-band__label">年度榜单</div>
    <h2 class="ranking-band__title">分类标题</h2>
    <ul class="ranking-band__list"><li>条目待补充</li></ul>
  </div>
  <div class="ranking-band__media"><div class="placeholder-visual">主题图</div></div>
</section>
```

说明区可用 `.ranking-board`。斜切色带是榜单页局部例外，不要扩散到政务/会议页。

### 节日纪实愿望区

用于春节、返乡、纪实活动页：

```html
<section id="wishes" data-layout="W" class="festival-band">
  <div class="festival-band__inner">
    <div class="wish-panel">
      <h2 class="wish-panel__title">愿望清单</h2>
      <ul class="wish-list"><li class="wish-list__item">留言待补充</li></ul>
    </div>
    <div class="placeholder-img">活动海报</div>
  </div>
</section>
```

它是内容活动区，不是现代 CTA；不要放大按钮作为中心。
