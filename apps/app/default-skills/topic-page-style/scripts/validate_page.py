#!/usr/bin/env python3
"""
专题页自动校验脚本
用法：python3 validate_page.py <生成的html文件路径>

只做"可编程验证"的检查：锚点完整性、禁用元素、相邻 section 布局重复、
基础 HTML 结构完整性。

无法程序化判断的主观项（配色是否好看、内容措辞是否得当、圆角/阴影是否符合
场景）请对照 references/qa-checklist.md 人工确认，本脚本不覆盖这些内容。
"""
import sys
import re
from pathlib import Path
from html.parser import HTMLParser

FORBIDDEN_EMOJI_PATTERN = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]"
)
FORBIDDEN_STRINGS = [
    ("picsum.photos", "禁止使用随机图片占位服务 picsum.photos（见 SKILL.md 图片策略第5步）"),
]
FORBIDDEN_PATTERNS = [
    (re.compile(r'backdrop-filter\s*:', re.IGNORECASE), "检测到 backdrop-filter（玻璃拟态），传统专题页不使用毛玻璃效果（见反AI感对照表）"),
]
WARN_PATTERNS = [
    (re.compile(r'box-shadow\s*:(?!.*inset)', re.IGNORECASE), "检测到 box-shadow（外阴影），请确认不是弥散阴影/悬浮卡片效果——传统专题页用细边框代替阴影（见反AI感对照表）。inset 内阴影不受此限制"),
    (re.compile(r'word-break\s*:\s*break-all', re.IGNORECASE), "检测到 word-break:break-all，中文场景会误伤标点符号，建议改用 overflow-wrap:anywhere"),
]

VOID_TAGS = {"br", "hr", "img", "input", "meta", "link", "source",
             "area", "base", "col", "embed", "param", "track", "wbr"}


class Collector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.hrefs = []          # (lineno, target_id)
        self.data_layouts = []   # (lineno, tag, value) 文档顺序
        self.tag_stack = []      # (tag, lineno) 用于粗略检测未闭合标签
        self.has_viewport = False
        self.has_lang = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        href = attrs.get("href") or ""
        if tag == "a" and href.startswith("#") and len(href) > 1:
            self.hrefs.append((self.getpos()[0], href[1:]))
        if "data-layout" in attrs:
            self.data_layouts.append((self.getpos()[0], tag, attrs["data-layout"]))
        if tag == "html" and attrs.get("lang"):
            self.has_lang = True
        if tag == "meta" and attrs.get("name") == "viewport":
            self.has_viewport = True
        if tag not in VOID_TAGS:
            self.tag_stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        for i in range(len(self.tag_stack) - 1, -1, -1):
            if self.tag_stack[i][0] == tag:
                del self.tag_stack[i:]
                return
        # 找不到匹配的开始标签——多数情况下是解析器对不规范HTML的正常宽容，不单独报告


def check(path):
    html = Path(path).read_text(encoding="utf-8", errors="replace")
    fails, warns = [], []

    parser = Collector()
    parser.feed(html)

    # 1. 锚点完整性：Tab/链接的 href="#x" 必须有对应 id="x"
    for lineno, target in parser.hrefs:
        if target not in parser.ids:
            fails.append(
                f"第{lineno}行：链接 href=\"#{target}\" 找不到对应的 id=\"{target}\" 元素"
            )

    # 2. 禁用元素
    if FORBIDDEN_EMOJI_PATTERN.search(html):
        warns.append(
            "检测到疑似装饰性 emoji/符号字符，请确认是否为不当的装饰用途"
            "（若是，替换为 CSS 形状 ◆●▸ 或纯文字标记；若是正文中的合理符号可忽略此项）"
        )
    for needle, msg in FORBIDDEN_STRINGS:
        if needle in html:
            fails.append(msg)
    for pattern, msg in FORBIDDEN_PATTERNS:
        if pattern.search(html):
            fails.append(msg)

    # 2b. 警告模式（不阻断但建议修改）
    for pattern, msg in WARN_PATTERNS:
        if pattern.search(html):
            warns.append(msg)

    # 3. 相邻 section 布局重复（data-layout 由 assets/base.html 约定写法标注）
    section_layouts = [(ln, v) for ln, tag, v in parser.data_layouts if tag == "section"]
    if not section_layouts:
        warns.append(
            "未检测到任何 <section data-layout=\"...\"> 属性，无法做布局节奏校验——"
            "建议按 SKILL.md 第六节要求为每个 section 标注 data-layout"
        )
    else:
        for i in range(1, len(section_layouts)):
            if section_layouts[i][1] == section_layouts[i - 1][1]:
                warns.append(
                    f"第{section_layouts[i][0]}行：与上一个 section 使用了相同的 "
                    f"data-layout=\"{section_layouts[i][1]}\"，请确认是否属于 SKILL.md 第三节"
                    "的“同类并列信息例外”，否则应更换布局或调整参数制造差异"
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
        tag, ln = leftover[0]
        warns.append(
            f"第{ln}行起的 <{tag}> 标签在文档结束时仍未匹配到闭合标签，请人工检查"
        )

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
