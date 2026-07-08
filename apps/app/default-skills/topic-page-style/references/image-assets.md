# 图片资产与 Banner/KV 生成指南

> 查阅时机：首屏强视觉页面在写 HTML 前必须读取。本文件定义如何自行探测宿主图片生成 MCP、如何组织 Banner/KV prompt、如何搜索/导入回退，以及如何把资产接入 HTML。

## 1. 工具能力探测顺序

不要假设工具名固定。先看当前会话暴露给模型的工具声明（工具名、namespace、description/schema），按以下顺序判断。若宿主没有提供单独的 list-tools/registry API，就以当前可见工具声明为准：不要臆造未暴露的 `generate_image` 工具名或参数；未观察到生图工具时转入已暴露的图片搜索/导入能力或 CSS/SVG 回退，并只在内部记录 `fallbackReason`。

1. **用户/简报/项目素材**：已有可用 Banner、会议现场、城市、活动、图集素材时优先使用。
2. **图片生成 MCP**：查找工具名或说明包含以下语义的工具：`generate_image`、`image_generation`、`text_to_image`、`create_image`、`image_generate`、`image` + `generate`。如果存在，按该工具的实际 schema 调用；不要凭空编造参数。
3. **图片搜索/导入 MCP**：Page Builder 运行时可能暴露 `mcp__image_search__search_images` 和 `mcp__image_search__download_images`。搜索工具输入为 `query`、可选 `count`、可选 `orientation`；下载工具接收 `search_images` 返回的 provider-aware `ImageResult` 候选数组和可选 `count`，导入当前 workspace 的 `assets/` 并返回 `assetRelativePath` / `assetPreviewPath`。
4. **CSS/SVG 回退**：只有以上均不可用、失败、结果不适合，或用户明确不要图片时使用。

内部记录本次资产决策：`targetSlot`、`targetRatio`、`toolUsed`、`assetPath`、`fallbackReason`。不要把这段记录输出进最终 HTML。

## 2. 首屏是否必须获取图片

以下类型默认是强视觉页面，必须先尝试获得 Banner/KV：

- 会议、活动、培训、年会、峰会、展会、论坛
- 政务宣传、周年纪念、区域战略、党建
- 城市、文旅、历史、非遗、地方门户
- 公益行动、环保、节约、校园活动
- 纪实故事、节日专题、返乡人物
- 榜单、评选、年度盘点

纯文档型页面（法规全文、公告通知、政策原文）可豁免，但要在内部规划中标注“纯文档型，豁免强视觉”。

## 3. 尺寸与使用位置

先确定图片落点，再确定尺寸或比例：

| 落点 | 推荐尺寸/比例 | HTML 结构 |
|---|---|---|
| 完整设计 KV / 海报 Banner | `1920x420`、`1920x480`、`4.5:1` 到 `4:1` | `.kv-banner img` 或 `.hero--poster-image .hero__bg`，不裁切 |
| 背景式 Hero 摄影图 | `1600x900`、`16:9` | `.hero > img.hero__bg + .hero__overlay + .hero__content` |
| 焦点区大图 J | `960x600`、`960x540`、`16:10` 或 `16:9` | `.focus__img img` |
| 双栏图文 B | `800x600`、`640x426`、`4:3` 或 `3:2` | `.row__img img` |
| 图库主图 E | `960x540` | `.gallery` / `.gallery--asymmetric` |
| 图库小图 / 卡片图 | `640x640`、`640x480`、`800x600` | `.gallery__item img` / `.card__media img` |

如果图片生成工具支持 `width`、`height`、`aspectRatio`、`size` 等字段，按目标落点传入；如果不支持尺寸字段，在 prompt 中明确目标比例和用途。图片搜索工具只支持方向时，用 `orientation: landscape`，再选接近目标比例的候选图。

## 4. Prompt 组织原则

prompt 按这个顺序写：

```text
页面任务主体 → 内容对象 → 领域辅助元素 → 视觉风格 → 尺寸/构图 → 禁用偏离场景
```

不要让领域词抢走页面任务。比如“煤炭行业教育培训会议”应生成会议/培训 KV、蓝白会务主视觉、抽象行业纹理或会场元素，而不是矿井、设备特写、施工现场。

**生成图片禁止绘制任何文字**：图片生成 prompt 必须明确 `no text, no letters, no numbers, no Chinese characters, no English words, no typography, no logo, no seal, no signage, no QR code`。不要要求模型绘制页面标题、会议名、年份、日期、主办单位、logo 或任何标题安全文字区；页面标题、口号、日期、单位名称必须由 HTML/CSS 渲染。生成结果若出现文字、乱码、伪字母或数字（右下角“AI生成”等平台生成提示角标除外），先用更强禁字 prompt 重试一次；仍失败则改用图片搜索或 CSS/SVG，不要把带字图片接入 Header。

通用安全约束：

```text
no text, no letters, no numbers, no Chinese characters, no English words, no typography, no logo, no seal, no signage, no QR code, no garbled characters, no identifiable faces, no controversial symbols, positive neutral tone, clean composition
```

AI 生成图不主动做水印检查；“AI生成”等平台生成提示角标不作为阻断问题。只检查主题贴合、图片内文字/乱码、人脸、争议符号和不适内容。外部搜索图、素材站图、用户/CMS 素材才检查第三方水印、版权署名、二维码和平台角标。

## 5. 类型化 Banner prompt 模板

按页面类型选一个模板，再填主题词。不要原样照抄示例里的括号。

### 政务红金

```text
Chinese government-style special topic KV visual background for [主题], red and gold ceremonial composition, flowing red ribbon, city skyline or landmark silhouette, warm light, formal public-service tone, wide horizontal banner background, 1920x480, clean open space for HTML title overlay, no text, no letters, no numbers, no Chinese characters, no English words, no typography, no logo, no seal, no signage, no QR code, no faces, no controversial symbols
```

### 蓝白会议培训

```text
Formal conference and training website KV visual background for [会议/培训主题], blue and white wave lines, abstract auditorium or education base elements, clean official meeting design, 1920x480 wide banner background, open whitespace for HTML title overlay, no text, no letters, no numbers, no Chinese characters, no English words, no typography, no logo, no seal, no signage, no QR code, no garbled characters, no identifiable faces, avoid industrial accident or production-site imagery
```

### 深色科技年会

```text
Dark blue technology conference hero background for [科技/数字经济主题], star field, network lines, world map outline, glowing cyan accents, stage-like annual conference atmosphere, 1600x900 or 1920x480 depending on header, high contrast but restrained, no text, no letters, no numbers, no Chinese characters, no English words, no typography, no logo, no signage, no faces
```

### 城市文旅/门户

```text
Wide city culture and tourism topic visual background for [城市/文旅主题], panoramic skyline, river or landmark, bright blue sky, documentary-realistic but polished, traditional Chinese portal website header atmosphere, 1920x420, open area for HTML title overlay, no text, no letters, no numbers, no Chinese characters, no English words, no typography, no logo, no seal, no signage, no people close-up
```

### 公益/纪实

```text
Documentary-style public welfare topic hero image for [公益行动主题], realistic close-up scene related to the action, calm composition, subtle color grading, clean open space for HTML title overlay, 1600x900 or 1920x480, no text, no letters, no numbers, no Chinese characters, no English words, no typography, no logo, no signage, no identifiable faces, no negative shock imagery, no garbled characters
```

### 榜单/评选

```text
Editorial ranking topic visual background for [榜单主题], minimal light gray background, energetic diagonal color accents, sports or industry object silhouette, poster-like composition, open whitespace for HTML title overlay, 1920x480, no text, no letters, no numbers, no Chinese characters, no English words, no typography, no logo, no signage, no faces
```

## 6. 图片搜索回退

当没有图片生成工具但有 `mcp__image_search__search_images`：

1. 用页面任务词组织 `query`，不要只搜行业词。
2. 传 `count: 4-8` 和 `orientation: "landscape"`。
3. 选择主题正面、中性、无可辨识人脸、无明显版权/平台标记、比例接近目标区块的候选。
4. 调用 `mcp__image_search__download_images`，传入选中的候选数组和 `count`。
5. 使用返回的 `assetRelativePath` 或 `assetPreviewPath` 写入 HTML，例如 `src="assets/page-builder-image-....png"`。

搜索例子：

```json
{ "query": "city culture tourism panoramic skyline Huizhou lake landmark", "count": 6, "orientation": "landscape" }
```

## 7. HTML 接入规则

完整 KV/海报图：

```html
<header class="kv-banner kv-banner--center">
  <img src="assets/banner-topic.png" alt="专题主视觉">
</header>
```

背景式 Hero：

```html
<header class="hero hero--poster-left">
  <img class="hero__bg" src="assets/hero-topic.png" alt="">
  <div class="hero__overlay"></div>
  <div class="hero__content">
    <h1 class="hero__title">专题标题</h1>
    <p class="hero__subtitle">短口号或导语</p>
  </div>
</header>
```

不要把背景图放进 `.hero__content`。生成或导入成功后，禁止继续保留纯 CSS Hero 作为首屏主视觉。

## 8. 失败与回退

图片生成失败时先简化 prompt 重试一次：减少装饰、减少对象、保留主题和比例。仍失败则走图片搜索；搜索也失败再用 CSS/SVG。

CSS/SVG 回退要求：

- 首屏可用 `.placeholder-cms`、`.placeholder-visual` 或 `.hero-geo`，但正文中最多再使用 1 个同风格大视觉占位。
- 图集不要用大面积 `.gallery--asymmetric` 占位；改用 `.gallery--asymmetric-compact`、普通 2x2 图集、新闻列表、日期卡或“图片持续更新”提示。
- 最终 HTML 不写“无生图工具”“搜索失败后回退”等内部注释。
