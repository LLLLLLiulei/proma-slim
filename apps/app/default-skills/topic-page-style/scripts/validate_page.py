#!/usr/bin/env python3
"""
专题页自动校验脚本
用法：python3 validate_page.py <生成的html文件路径>

只做"可编程验证"的检查：锚点完整性、禁用元素、section 标记完整性、
相邻 section 布局重复、基础 HTML 结构完整性、图片资产路径和首屏 Banner 基础检查。

无法程序化判断的主观项（配色是否好看、内容措辞是否得当、圆角/阴影是否符合
场景）请对照 references/qa-checklist.md 人工确认，本脚本不覆盖这些内容。
"""
import sys
import re
from pathlib import Path, PurePosixPath
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

FORBIDDEN_EMOJI_PATTERN = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]"
)
STYLE_SCRIPT_COMMENT_PATTERN = re.compile(
    r"<!--.*?-->|<style\b[^>]*>.*?</style>|<script\b[^>]*>.*?</script>",
    re.IGNORECASE | re.DOTALL,
)
ALLOWED_GEOMETRY_CHARS = set("◆●▸○◉")
FORBIDDEN_STRINGS = [
    ("picsum.photos", "禁止使用随机图片占位服务 picsum.photos（见 SKILL.md 图片策略）"),
]
FORBIDDEN_PATTERNS = [
    (re.compile(r'backdrop-filter\s*:', re.IGNORECASE), "检测到 backdrop-filter（玻璃拟态），传统专题页不使用毛玻璃效果（见反AI感对照表）"),
]
WARN_PATTERNS = [
    (re.compile(r'word-break\s*:\s*break-all', re.IGNORECASE), "检测到 word-break:break-all，中文场景会误伤标点符号，建议改用 overflow-wrap:anywhere"),
]
BOX_SHADOW_PATTERN = re.compile(r'box-shadow\s*:\s*([^;}]*)', re.IGNORECASE)
COMMENT_PATTERN = re.compile(r"<!--.*?-->", re.IGNORECASE | re.DOTALL)
IMAGE_URL_PATTERN = re.compile(
    r"url\(\s*['\"]?([^'\")\s]+\.(?:png|jpe?g|webp|gif|svg)(?:\?[^'\")\s]*)?)['\"]?\s*\)",
    re.IGNORECASE,
)
VISUAL_IMAGE_REQUIRED_PAGE_PATTERN = re.compile(
    r"(会议|活动|培训|年会|大会|峰会|展会|论坛|政务|党建|周年|文旅|城市|非遗|公益|环保|节约|校园|纪实|返乡|榜单|评选|专题)"
)
DEFAULT_COLOR_PATTERN = re.compile(r"#(?:1A5FBF|0D4A8E|3498DB|D6EAF8)\b", re.IGNORECASE)

VOID_TAGS = {"br", "hr", "img", "input", "meta", "link", "source",
             "area", "base", "col", "embed", "param", "track", "wbr"}


class Collector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.hrefs = []          # (lineno, target_id)
        self.fake_hrefs = []     # (lineno, message)
        self.data_layouts = []   # (lineno, tag, value, allow_repeat) 文档顺序
        self.sections = []       # (lineno, id, data-layout)
        self.tag_stack = []      # (tag, lineno, classes) 用于粗略检测未闭合标签
        self.nesting_warnings = []
        self.image_count = 0
        self.images = []         # (lineno, src, classes, ancestor_path)
        self.title_text_parts = []
        self.h1_text_parts = []
        self.visible_text_parts = []
        self.has_viewport = False
        self.has_lang = False
        self.header_placeholder_count = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set((attrs.get("class") or "").split())
        ancestor_path = [(parent_tag, set(parent_classes)) for parent_tag, _, parent_classes in self.tag_stack]
        ancestor_classes = set()
        for _, parent_classes in ancestor_path:
            ancestor_classes.update(parent_classes)
        if tag == "img":
            self.image_count += 1
            self.images.append((self.getpos()[0], (attrs.get("src") or "").strip(), classes, ancestor_path))
        if "id" in attrs:
            self.ids.add(attrs["id"])
        raw_href = attrs.get("href")
        if tag == "a" and raw_href is not None:
            href = raw_href.strip()
            href_lower = href.lower()
            if href == "#":
                self.fake_hrefs.append((self.getpos()[0], 'href="#" 是假链接，请改为真实锚点、真实链接或纯文本'))
            elif href_lower.startswith("javascript:"):
                self.fake_hrefs.append((self.getpos()[0], f'href="{raw_href}" 是 javascript 假链接，请改为真实锚点、真实链接或纯文本'))
            elif not href:
                self.fake_hrefs.append((self.getpos()[0], 'href 为空，请改为真实锚点、真实链接或纯文本'))
            elif href.startswith("#") and len(href) > 1:
                self.hrefs.append((self.getpos()[0], href[1:]))
        if tag == "section":
            self.sections.append((self.getpos()[0], attrs.get("id"), attrs.get("data-layout")))
        if "data-layout" in attrs:
            allow_repeat = attrs.get("data-layout-repeat") == "true"
            self.data_layouts.append((self.getpos()[0], tag, attrs["data-layout"], allow_repeat))
        if tag == "html" and attrs.get("lang"):
            self.has_lang = True
        if tag == "meta" and attrs.get("name") == "viewport":
            self.has_viewport = True
        if "placeholder-visual" in classes and ("hero" in ancestor_classes or "kv-banner" in ancestor_classes):
            self.header_placeholder_count += 1
        if tag not in VOID_TAGS:
            self.tag_stack.append((tag, self.getpos()[0], classes))

    def handle_endtag(self, tag):
        if self.tag_stack and self.tag_stack[-1][0] == tag:
            self.tag_stack.pop()
            return
        for i in range(len(self.tag_stack) - 1, -1, -1):
            if self.tag_stack[i][0] == tag:
                top_tag, top_lineno, _ = self.tag_stack[-1]
                self.nesting_warnings.append(
                    f"第{self.getpos()[0]}行：</{tag}> 与第{top_lineno}行起的 <{top_tag}> 存在交叉闭合，请人工检查 HTML 嵌套"
                )
                del self.tag_stack[i:]
                return
        # 找不到匹配的开始标签——多数情况下是解析器对不规范HTML的正常宽容，不单独报告

    def handle_data(self, data):
        open_tags = {tag for tag, _, _ in self.tag_stack}
        if "title" in open_tags:
            self.title_text_parts.append(data)
        if "h1" in open_tags:
            self.h1_text_parts.append(data)
        if not {"style", "script"} & open_tags:
            text = re.sub(r"\s+", "", data)
            if text:
                self.visible_text_parts.append(text)


def emoji_check_target(html):
    target = STYLE_SCRIPT_COMMENT_PATTERN.sub("", html)
    return "".join(ch for ch in target if ch not in ALLOWED_GEOMETRY_CHARS)


def split_css_layers(value):
    layers, current, depth = [], [], 0
    for ch in value:
        if ch == "(":
            depth += 1
        elif ch == ")" and depth:
            depth -= 1
        if ch == "," and depth == 0:
            layers.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    if current:
        layers.append("".join(current).strip())
    return layers


def has_outer_box_shadow(html):
    for match in BOX_SHADOW_PATTERN.finditer(html):
        layers = split_css_layers(match.group(1))
        if any(layer and "inset" not in layer.lower() for layer in layers):
            return True
    return False


def base_layout(value):
    match = re.match(r"\s*([A-Za-z]+)", value or "")
    return match.group(1).upper() if match else (value or "").strip()


def iter_div_fragments_with_class(html, required_class, excluded_class=None):
    div_pattern = re.compile(r"<(/?)div\b[^>]*>", re.IGNORECASE)
    class_pattern = re.compile(r"\bclass\s*=\s*(['\"])(.*?)\1", re.IGNORECASE | re.DOTALL)
    pos = 0
    while True:
        match = div_pattern.search(html, pos)
        if not match:
            return
        pos = match.end()
        if match.group(1):
            continue
        class_match = class_pattern.search(match.group(0))
        if not class_match:
            continue
        classes = set(class_match.group(2).split())
        if required_class not in classes or (excluded_class and excluded_class in classes):
            continue

        depth = 1
        end_pos = match.end()
        for next_match in div_pattern.finditer(html, match.end()):
            if next_match.group(1):
                depth -= 1
            else:
                depth += 1
            end_pos = next_match.end()
            if depth == 0:
                yield match.start(), html[match.start():end_pos]
                pos = end_pos
                break
        else:
            yield match.start(), html[match.start():]
            return


def line_number_at(html, pos):
    return html.count("\n", 0, pos) + 1


def strip_tags(value):
    return re.sub(r"<[^>]+>", "", value)


def has_crowded_hero_copy(html):
    title_match = re.search(
        r'<h1\b[^>]*class\s*=\s*["\'][^"\']*\bhero__title\b[^"\']*["\'][^>]*>(.*?)</h1>',
        html,
        re.IGNORECASE | re.DOTALL,
    )
    if not title_match:
        return False
    title_text = re.sub(r"\s+", "", strip_tags(title_match.group(1)))
    if len(title_text) <= 24:
        return False
    has_english_subtitle = re.search(r'\bclass\s*=\s*["\'][^"\']*\bhero__subtitle-en\b', html, re.IGNORECASE)
    subtitle_count = len(re.findall(r'\bclass\s*=\s*["\'][^"\']*\bhero__subtitle\b', html, re.IGNORECASE))
    return bool(has_english_subtitle or subtitle_count >= 2)


def iter_css_image_urls(html):
    html_without_comments = COMMENT_PATTERN.sub(lambda match: " " * (match.end() - match.start()), html)
    for match in IMAGE_URL_PATTERN.finditer(html_without_comments):
        yield line_number_at(html, match.start(1)), match.group(1).strip()


def normalized_relative_path(src):
    if not src or is_remote_or_data_src(src) or src.startswith("#"):
        return None
    split = urlsplit(src)
    if split.scheme or split.netloc:
        return None
    clean = unquote(split.path).replace("\\", "/")
    if not clean or clean.startswith("/"):
        return None
    while clean.startswith("./"):
        clean = clean[2:]
    parts = PurePosixPath(clean).parts
    if not parts or ".." in parts:
        return None
    return "/".join(parts)


def is_usable_local_asset(base_dir, src):
    if not is_assets_path(src):
        return False
    local_path = local_asset_path(base_dir, src)
    return bool(local_path and local_path.exists())


def has_usable_image_asset(base_dir, html, parser):
    if any(is_usable_local_asset(base_dir, src) for _, src, _, _ in parser.images):
        return True
    return any(is_usable_local_asset(base_dir, src) for _, src in iter_css_image_urls(html))


def is_visual_image_required_page(parser):
    visible_text = "".join(parser.visible_text_parts)[:6000]
    title_and_h1 = "".join(parser.title_text_parts + parser.h1_text_parts)
    return bool(VISUAL_IMAGE_REQUIRED_PAGE_PATTERN.search(title_and_h1 + visible_text))


def is_remote_or_data_src(src):
    lowered = src.lower()
    return lowered.startswith(("http://", "https://", "//", "data:"))


def local_asset_path(base_dir, src):
    normalized = normalized_relative_path(src)
    if not normalized:
        return None
    return base_dir / normalized


def is_assets_path(src):
    normalized = normalized_relative_path(src)
    if not normalized:
        return False
    return PurePosixPath(normalized).parts[0] == "assets"


def ancestor_has_class(ancestor_path, class_name):
    return any(class_name in classes for _, classes in ancestor_path)


def has_real_header_image(base_dir, parser):
    for _, src, classes, ancestor_path in parser.images:
        if not is_usable_local_asset(base_dir, src):
            continue
        parent_classes = ancestor_path[-1][1] if ancestor_path else set()
        if ancestor_has_class(ancestor_path, "kv-banner"):
            return True
        if ancestor_has_class(ancestor_path, "hero-carousel"):
            return True
        if "hero__bg" in classes and "hero" in parent_classes:
            if {"hero--gradient", "hero--minimal"} & parent_classes:
                continue
            return True
    return False


def invalid_header_image_warnings(parser):
    warnings = []
    for lineno, _, classes, ancestor_path in parser.images:
        if "hero__bg" not in classes:
            continue
        ancestor_classes = set()
        for _, parent_classes in ancestor_path:
            ancestor_classes.update(parent_classes)
        if "hero" not in ancestor_classes:
            continue
        parent_classes = ancestor_path[-1][1] if ancestor_path else set()
        if "hero" not in parent_classes:
            warnings.append(
                f"第{lineno}行：Header 图片结构不符合规范，img.hero__bg 必须是 .hero 的直接子元素，不能放进 .hero__content"
            )
        elif {"hero--gradient", "hero--minimal"} & parent_classes:
            warnings.append(
                f"第{lineno}行：.hero--gradient/.hero--minimal 会隐藏 img.hero__bg；如使用真实 Header 图，请改用普通 .hero、.hero--poster-left 或 .hero--poster-image"
            )
    return warnings


def check(path):
    html_path = Path(path)
    html = html_path.read_text(encoding="utf-8", errors="replace")
    fails, warns = [], []

    parser = Collector()
    parser.feed(html)

    base_dir = html_path.parent

    # 1. 锚点完整性：Tab/链接的 href="#x" 必须有对应 id="x"
    for lineno, target in parser.hrefs:
        if target not in parser.ids:
            fails.append(
                f"第{lineno}行：链接 href=\"#{target}\" 找不到对应的 id=\"{target}\" 元素"
            )
    for lineno, message in parser.fake_hrefs:
        fails.append(f"第{lineno}行：{message}")

    # 2. 禁用元素
    if FORBIDDEN_EMOJI_PATTERN.search(emoji_check_target(html)):
        warns.append(
            "检测到疑似装饰性 emoji/符号字符，请确认是否为不当的装饰用途"
            "（若是，替换为 CSS 形状 ◆●▸ 或纯文字标记；若是正文中的合理符号可忽略此项）"
        )
    lower_html = html.lower()
    for needle, msg in FORBIDDEN_STRINGS:
        if needle.lower() in lower_html:
            fails.append(msg)
    for pattern, msg in FORBIDDEN_PATTERNS:
        if pattern.search(html):
            fails.append(msg)
    for pos, fragment in iter_div_fragments_with_class(html, "gallery--asymmetric", "gallery--asymmetric-compact"):
        if "<img" not in fragment.lower() and fragment.count("placeholder-img") >= 2:
            fails.append(
                f"第{line_number_at(html, pos)}行：无真实图片时不要使用大面积 .gallery--asymmetric 伪图集，"
                "请改用 .gallery--asymmetric-compact、普通 2x2 图集、新闻列表或省略图集"
            )

    # 2b. 警告模式（不阻断但建议修改）
    for pattern, msg in WARN_PATTERNS:
        if pattern.search(html):
            warns.append(msg)
    if DEFAULT_COLOR_PATTERN.search(html):
        warns.append(
            "检测到 base.css 默认示例色值（如 #1A5FBF/#3498DB），请确认已按主题重新推导并替换 :root 色彩变量"
        )
    if has_outer_box_shadow(html):
        warns.append(
            "检测到 box-shadow（外阴影），请确认不是弥散阴影/悬浮卡片效果——"
            "传统专题页用细边框代替阴影；纯 inset 内阴影不受此限制"
        )
    if has_crowded_hero_copy(html):
        warns.append(
            "Header 主标题较长且同时包含英文副标题或多行会务信息，"
            "请压缩主标题、移除英文副标题，或把时间/地点/主办单位移到内容区"
        )
    visual_image_required = is_visual_image_required_page(parser)
    real_header_image = has_real_header_image(base_dir, parser)
    if visual_image_required and not has_usable_image_asset(base_dir, html, parser):
        warns.append(
            "会议/活动/培训类页面未检测到真实图片；其他首屏强视觉页面也应确认是否已优先使用用户素材、"
            "图片生成工具或图片搜索/下载工具；确实无可用视觉资产时再使用 CSS/SVG 回退"
        )
    if visual_image_required and not real_header_image:
        warns.append(
            "首屏强视觉页面未检测到 .kv-banner img 或 .hero__bg 真实 Banner/KV；"
            "请确认已按 image-assets.md 生成/导入 Banner，并在 Header 中实际引用"
        )
    if visual_image_required and parser.header_placeholder_count and not real_header_image:
        warns.append(
            "Header 仍使用 .placeholder-visual 占位。仅在用户素材、图片生成和图片搜索均不可用或失败时才可接受"
        )
    if visual_image_required:
        warns.extend(invalid_header_image_warnings(parser))

    for lineno, src, _, _ in parser.images:
        if not src:
            fails.append(f"第{lineno}行：<img> 缺少 src，必须引用真实图片路径或删除该图片元素")
            continue
        if src.lower().startswith("data:"):
            warns.append(f"第{lineno}行：检测到 data URI 图片。专题页建议使用 assets/ 中的独立图片文件")
            continue
        if src.lower().startswith(("http://", "https://", "//")):
            warns.append(f"第{lineno}行：图片仍是远程 URL，Page Builder 专题页应优先导入 assets/ 后用相对路径引用")
            continue
        if not is_assets_path(src):
            warns.append(f"第{lineno}行：图片路径 \"{src}\" 不在 assets/ 下，请确认不是临时路径或未导入素材")
        local_path = local_asset_path(base_dir, src)
        if local_path and not local_path.exists():
            warns.append(f"第{lineno}行：图片文件不存在：{local_path}")
    for lineno, src in iter_css_image_urls(html):
        if src.lower().startswith("data:"):
            warns.append(f"第{lineno}行：检测到 CSS data URI 图片。专题页建议使用 assets/ 中的独立图片文件")
            continue
        if src.lower().startswith(("http://", "https://", "//")):
            warns.append(f"第{lineno}行：CSS 图片仍是远程 URL，Page Builder 专题页应优先导入 assets/ 后用相对路径引用")
            continue
        if not is_assets_path(src):
            warns.append(f"第{lineno}行：CSS 图片路径 \"{src}\" 不在 assets/ 下，请确认不是临时路径或未导入素材")
        local_path = local_asset_path(base_dir, src)
        if local_path and not local_path.exists():
            warns.append(f"第{lineno}行：CSS 图片文件不存在：{local_path}")

    # 3. 相邻 section 布局重复（data-layout 由 assets/base.html 约定写法标注）
    for lineno, section_id, layout in parser.sections:
        if not section_id:
            fails.append(f"第{lineno}行：<section> 缺少 id，无法被 Tab/锚点稳定引用")
        if not layout:
            fails.append(f"第{lineno}行：<section> 缺少 data-layout，无法做布局节奏校验")

    section_layouts = [
        (ln, v, base_layout(v), allow_repeat)
        for ln, tag, v, allow_repeat in parser.data_layouts
        if tag == "section"
    ]
    if not parser.sections:
        warns.append(
            "未检测到任何 <section> 内容区，无法做布局节奏校验——"
            "建议按 SKILL.md 第六节要求使用 section 并标注 id/data-layout"
        )
    else:
        for i in range(1, len(section_layouts)):
            if section_layouts[i][2] == section_layouts[i - 1][2]:
                if section_layouts[i][3]:
                    continue
                fails.append(
                    f"第{section_layouts[i][0]}行：与上一个 section 使用了相同的 "
                    f"基础布局 \"{section_layouts[i][2]}\"（当前 data-layout=\"{section_layouts[i][1]}\"）。"
                    "如确属 SKILL.md 第三节的“同类并列信息例外”，请在当前重复 section "
                    "显式添加 data-layout-repeat=\"true\"；否则应更换布局或调整参数制造差异"
                )

    # 4. 基础结构完整性
    if "<!DOCTYPE" not in html.upper():
        fails.append("缺少 <!DOCTYPE html> 声明")
    if not parser.has_viewport:
        fails.append("缺少 <meta name=\"viewport\"> 响应式声明")
    if not parser.has_lang:
        warns.append("<html> 标签未声明 lang 属性，建议加 lang=\"zh-CN\"")

    # 5. 明显未闭合的标签（宽松提示，脚本按简化规则判断，可能有误报，仅供排查线索）
    leftover = [t for t in parser.tag_stack if t[0] not in VOID_TAGS]
    if leftover:
        tag, ln, _ = leftover[0]
        warns.append(
            f"第{ln}行起的 <{tag}> 标签在文档结束时仍未匹配到闭合标签，请人工检查"
        )
    warns.extend(parser.nesting_warnings)

    return fails, warns


def main():
    if len(sys.argv) != 2:
        print("用法：python3 validate_page.py <html文件路径>")
        sys.exit(2)

    path = sys.argv[1]
    if not Path(path).exists():
        print(f"文件不存在：{path}")
        sys.exit(2)

    fails, warns = check(path)

    print(f"== 校验报告：{path} ==\n")
    if fails:
        print(f"❌ FAIL（{len(fails)} 项，必须修复后重新运行本脚本）：")
        for f in fails:
            print(f"  - {f}")
        print()
    if warns:
        print(f"⚠️  WARN（{len(warns)} 项，需人工确认是否可接受）：")
        for w in warns:
            print(f"  - {w}")
        print()
    if not fails and not warns:
        print("✅ 未发现可编程校验范围内的问题。")

    print("提醒：配色是否完成防重复检查、圆角/阴影等视觉细节，"
          "请对照 references/qa-checklist.md 人工过一遍。")

    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
