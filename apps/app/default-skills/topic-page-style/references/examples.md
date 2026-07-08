# 轻量执行示例

> 查阅时机：需要校准“口语化需求 → 类型配方 → Banner/KV 资产 → HTML 结构”的执行方式时。这里只给关键决策和片段，不提供完整大 HTML。

## 示例一：蓝白会议培训页

用户口语化摘要：

```text
做一个中国煤炭工业协会人力资源工作委员会年会专题页，要像正式会议专题，有会议议程、热点资讯、图片集锦，最好有蓝白色 Banner。
```

内部归类：

```text
页面类型：蓝白会议培训型
页面壳：传统 CMS topic-shell，960-1080px
Header：完整 KV Banner，优先图片生成，1920x480
导航：.tab-nav--blue 或 .tab-nav--primary
模块序列：J 焦点资讯 → D 议程时间轴 → F 热点资讯卡 → E 图片集锦 → G 联系/页脚
硬事实处理：日期、主办、地点、联系方式未提供时使用“待发布/待确认”
```

Banner prompt：

```text
Formal conference and training website KV banner for China coal industry human resources annual meeting, blue and white wave lines, subtle institutional emblem area, abstract auditorium and education training elements, clean official meeting design, 1920x480 wide poster, title-safe whitespace, no garbled text, no identifiable faces, avoid mine shaft, machinery close-up, accident or production-site imagery
```

关键 HTML 片段：

```html
<header class="kv-banner kv-banner--center">
  <img src="assets/conference-kv.png" alt="中国煤炭工业协会人力资源工作委员会年会专题主视觉">
</header>
<nav class="tab-nav tab-nav--blue tab-nav--block-active">
  <a href="#home" class="active">专题首页</a>
  <a href="#agenda">会议议程</a>
  <a href="#news">热点资讯</a>
  <a href="#gallery">图片集锦</a>
</nav>
<main class="topic-shell topic-shell--narrow">
  <section id="home" class="module-box" data-layout="J">...</section>
  <section id="agenda" class="module-box" data-layout="D">...</section>
  <section id="news" class="module-box" data-layout="F">...</section>
  <section id="gallery" class="module-box" data-layout="E">...</section>
</main>
```

注意点：

- 如果没有真实会议图，图集用紧凑预留或 2x2，不使用大面积伪图集。
- 议程是中段核心，不要藏在普通卡片后。
- 页脚用蓝色 `.footer--multi`，二维码缺素材时写“二维码待发布”。

## 示例二：城市文旅门户页

用户口语化摘要：

```text
做一个“千年古城”城市文化专题页，像地方门户专题，有城市风景 banner、文化栏目、非遗、活动视频和古韵图集。
```

内部归类：

```text
页面类型：城市文旅频道型
页面壳：传统 CMS topic-shell，1000-1080px
Header：城市风景全宽 Banner，优先生成/搜索横向城市图，1920x420
导航：.tab-nav--blue.tab-nav--blue-red-active
模块序列：头条横条 → J 左大图/右文化摘要 → M-twin 文艺/非遗 → video-grid 活动视频 → M 史说列表/活动 banner → E 古韵图集
标题：门户蓝色标题或 CMS 横线标题
```

Banner prompt：

```text
Wide Chinese city culture and tourism topic banner for ancient city heritage, panoramic lake and skyline, historical statue or landmark silhouette, bright blue sky, traditional local portal website header style, 1920x420, title-safe area on left, no people close-up, no logo, no small text
```

关键 HTML 片段：

```html
<header class="kv-banner kv-banner--center">
  <img src="assets/city-culture-kv.png" alt="千年古城文化专题主视觉">
</header>
<nav class="tab-nav tab-nav--blue tab-nav--blue-red-active">
  <a href="#home" class="active">首页</a>
  <a href="#culture">文化荟萃</a>
  <a href="#heritage">非遗传承</a>
  <a href="#video">活动专题</a>
  <a href="#gallery">古韵图集</a>
</nav>
<main class="topic-shell">
  <section id="home" class="module-box" data-layout="J">...</section>
  <section id="culture" class="module-box" data-layout="M-twin">...</section>
  <section id="video" class="module-box" data-layout="F">...</section>
  <section id="gallery" class="module-box" data-layout="E">...</section>
</main>
```

注意点：

- 图片密度高，但正文仍在窄壳内，不做全屏大卡片瀑布流。
- 视频缩略图中央用 CSS 播放按钮，不用 emoji。
- 导航贴紧 Banner，active 用整块高亮，不只做现代下划线。
