"""生成 /zh|en/research/ 索引页和 leaderboard-data-quality 中英研究页。

正文取自 市场/research/ 定稿，数字按原文保留不四舍五入。
顶栏不加「研究」；页脚按 build_site.T['foot'] 补研究入口；索引卡复用 guides 的 g-list/g-card。
用法：python3 tools/build_research.py [稿件目录]
"""
import html, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_site as bs  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else "/workspace/projects/wakeloom/市场/research"
E = html.escape
PUBLISHED = "2026-10-30"
SLUG = "leaderboard-data-quality"
ZH_MD = "RESEARCH-leaderboard-data-quality-2026-10-30.md"
EN_MD = "RESEARCH-leaderboard-data-quality-2026-10-30-en.md"

META = {
    "zh": dict(
        h1="Polymarket 排行榜头部地址，有多少数据能直接拿来选人？",
        title="Polymarket 排行榜头部地址，有多少数据能直接拿来选人？ | Wakeloom 织迹",
        desc="Wakeloom 排行榜前 50 名里 34% 是第三方来源；对照 Polymarket 30 天盈利榜前 100，公开详情页上 49 个尚未核对。数字保留原文。",
        name="研究",
        index_h1="Polymarket 跟单研究",
        index_title="Polymarket 跟单研究 | Wakeloom 织迹",
        index_desc="公开页面快照研究：排行榜数据质量、第三方来源占比、已结算市场数与选人含义。",
        index_lead="只统计公开页面服务端直出的快照，不列地址，不评价个人。",
        more="延伸阅读",
        read="阅读",
        date_label="发布于",
    ),
    "en": dict(
        h1="How much of the data on top Polymarket traders can you actually use to pick who to copy?",
        title="How much of the data on top Polymarket traders can you actually use to pick who to copy? | Wakeloom",
        desc="Of Wakeloom's top 50, 34% use third-party data. Of Polymarket's 30-day profit top 100, 49 are unverified on public wallet pages. Numbers kept verbatim.",
        name="Research",
        index_h1="Polymarket copy trading research",
        index_title="Polymarket Copy Trading Research | Wakeloom",
        index_desc="Studies from public page snapshots: leaderboard data quality, third-party share, resolved markets, and what that means for picking traders.",
        index_lead="Counts the server-rendered page snapshot only. Anonymous aggregates; no addresses listed.",
        more="Further reading",
        read="Read",
        date_label="Published",
    ),
}

GUIDE_LINKS = {
    "zh": [
        ("/zh/guides/how-to-pick-polymarket-traders/", "跟单前，怎么判断一个 Polymarket 交易者"),
        ("/zh/guides/polymarket-trader-data-checklist/", "跟单前该看哪些数据：样本量、回撤和收益集中度"),
        ("/zh/guides/polymarket-leaderboard-copy-pitfalls/", "照抄 Polymarket 排行榜的常见坑"),
        ("/zh/leaderboard/", "排行榜"),
        ("/zh/how-it-works/", "选人方法"),
        ("/zh/faq/", "常见问题"),
    ],
    "en": [
        ("/en/guides/how-to-pick-polymarket-traders/", "How to evaluate a Polymarket trader before copying"),
        ("/en/guides/polymarket-trader-data-checklist/", "What to check before copying a trader: sample size, drawdown and concentration"),
        ("/en/guides/polymarket-leaderboard-copy-pitfalls/", "Common pitfalls of copying the Polymarket leaderboard"),
        ("/en/leaderboard/", "Leaderboard"),
        ("/en/how-it-works/", "How it works"),
        ("/en/faq/", "FAQ"),
    ],
}

RESEARCH_LINK = {
    "zh": ("/zh/research/leaderboard-data-quality/", "Polymarket 排行榜头部地址，有多少数据能直接拿来选人？"),
    "en": ("/en/research/leaderboard-data-quality/", "How much of the data on top Polymarket traders can you actually use to pick who to copy?"),
}


def inline(t):
    out, pos = [], 0
    for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|`([^`]+)`", t):
        out.append(E(t[pos:m.start()]))
        if m.group(1):
            out.append(f'<a href="{E(m.group(2))}">{E(m.group(1))}</a>')
        elif m.group(3):
            out.append(f"<strong>{inline(m.group(3))}</strong>")
        else:
            out.append(f"<code>{E(m.group(4))}</code>")
        pos = m.end()
    out.append(E(t[pos:]))
    return "".join(out)


def is_table_sep(ln):
    return bool(re.match(r"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$", ln))


def parse_table(lines, i):
    rows = []
    while i < len(lines) and lines[i].strip().startswith("|"):
        ln = lines[i].strip()
        if is_table_sep(ln):
            i += 1
            continue
        cells = [c.strip() for c in ln.strip("|").split("|")]
        rows.append(cells)
        i += 1
    return rows, i


def table_html(rows):
    if not rows:
        return ""
    head, body = rows[0], rows[1:]
    th = "".join(f"<th>{inline(c)}</th>" for c in head)
    trs = []
    for r in body:
        # pad/truncate to head width
        cells = (r + [""] * len(head))[: len(head)]
        trs.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>")
    return f'<div class="r-table-wrap"><table class="r-table"><thead><tr>{th}</tr></thead><tbody>{"".join(trs)}</tbody></table></div>'


def body_html(md):
    # Drop H1 (page already has it) and internal workspace paths
    lines = []
    for ln in md.split("\n"):
        if ln.startswith("# ") and not ln.startswith("## "):
            continue
        if "/workspace/" in ln:
            continue
        lines.append(ln)

    parts, para, i = [], [], 0

    def flush():
        if para:
            parts.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()

    while i < len(lines):
        raw = lines[i]
        ln = raw.strip()
        if not ln:
            flush()
            i += 1
            continue
        if ln.startswith("|") and i + 1 < len(lines) and is_table_sep(lines[i + 1].strip()):
            flush()
            rows, i = parse_table(lines, i)
            parts.append(table_html(rows))
            continue
        if ln.startswith("### "):
            flush()
            parts.append(f"<h3>{inline(ln[4:])}</h3>")
        elif ln.startswith("## "):
            flush()
            parts.append(f"<h2>{inline(ln[3:])}</h2>")
        elif re.match(r"^\d+\. ", ln):
            flush()
            items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i].strip()):
                items.append(f"<li>{inline(re.sub(r'^\d+\. ', '', lines[i].strip()))}</li>")
                i += 1
            parts.append(f'<ol>{"".join(items)}</ol>')
            continue
        elif ln.startswith("- "):
            flush()
            items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append(f"<li>{inline(lines[i].strip()[2:])}</li>")
                i += 1
            parts.append(f'<ul>{"".join(items)}</ul>')
            continue
        else:
            para.append(ln)
        i += 1
    flush()
    return "".join(parts)


def further(lang):
    m = META[lang]
    links = "".join(f'<li><a href="{E(h)}">{E(n)}</a></li>' for h, n in GUIDE_LINKS[lang])
    return f'<section class="card prose g-more"><h2>{m["more"]}</h2><ul>{links}</ul></section>'


def shell_lines(lang, path):
    """沿用现网 guides 页头；页脚 nav 统一用 build_site.foot_nav（含研究），避免重建丢链。
    顶栏不加「研究」；语言切换指到对本页。"""
    ref = open(os.path.join(ROOT, lang, "guides", "index.html"), encoding="utf-8").read().split("\n")
    banner = next(l for l in ref if l.startswith('<div class="pv"'))
    header = next(l for l in ref if l.startswith('<header class="top">'))
    nav = next(l for l in ref if l.startswith('<nav class="nv">'))
    foot = next(l for l in ref if l.startswith('<footer class="ft">'))
    # 页脚链接以 T['foot'] 为准（含研究）
    foot = re.sub(
        r"(<footer class=\"ft\">.*?<nav>)(.*?)(</nav>)",
        lambda m: m.group(1) + bs.foot_nav(lang) + m.group(3),
        foot,
        count=1,
        flags=re.S,
    )
    other = "en" if lang == "zh" else "zh"
    nav = nav.replace(" class=on", "")
    # guides 页的语言切换在 nav 行里
    nav = nav.replace(f'href="/{other}/guides/"', f'href="/{other}/{path}"')
    return banner, header, nav, foot


def finish(lang, path, s, article=False):
    banner, header, nav, foot = shell_lines(lang, path)
    L = s.split("\n")
    for i, l in enumerate(L):
        if l.startswith('<div class="pv"'):
            L[i] = banner
        elif l.startswith('<header class="top">'):
            L[i] = header
        elif l.startswith('<nav class="nv">'):
            L[i] = nav
        elif l.startswith('<footer class="ft">'):
            L[i] = foot
        elif l.startswith('<link rel="stylesheet" href="/site.css'):
            # 索引卡与 guides 共用 guides.css；文章页再叠 research.css（宽表）
            css = l + '<link rel="stylesheet" href="/assets/guides/guides.css?v=3">'
            if article:
                css += '<link rel="stylesheet" href="/assets/research/research.css?v=2">'
            L[i] = css
    return "\n".join(L).replace('data-waitlist="off"', 'data-waitlist="on"', 1)


def patch_guides_further():
    """guides 文章延伸阅读末尾加研究文；索引页在卡片列表后补一块延伸阅读。"""
    articles = [
        f"guides/{s}/"
        for s in (
            "how-to-pick-polymarket-traders",
            "polymarket-trader-data-checklist",
            "polymarket-leaderboard-copy-pitfalls",
        )
    ]
    for lang in ("zh", "en"):
        href, name = RESEARCH_LINK[lang]
        li = f'<li><a href="{href}">{E(name)}</a></li>'
        for path in articles:
            fp = os.path.join(ROOT, lang, path, "index.html")
            html_s = open(fp, encoding="utf-8").read()
            if href in html_s and "g-more" in html_s[html_s.find("g-more"): html_s.find("g-more") + 800]:
                if f'href="{href}"' in re.search(r'<section class="card prose g-more">.*?</section>', html_s, re.S).group(0):
                    continue
            m = re.search(r'(<section class="card prose g-more">.*?<ul>)(.*?)(</ul></section>)', html_s, re.S)
            assert m, (lang, path)
            html_s = html_s[: m.start(3)] + li + html_s[m.start(3) :]
            open(fp, "w", encoding="utf-8").write(html_s)
        # index: append further-reading after g-list if missing
        fp = os.path.join(ROOT, lang, "guides", "index.html")
        html_s = open(fp, encoding="utf-8").read()
        if f'href="{href}"' not in html_s:
            more_label = META[lang]["more"]
            block = (
                f'<section class="card prose g-more"><h2>{more_label}</h2><ul>{li}</ul></section>'
            )
            html_s = html_s.replace("</main>", block + "</main>", 1)
            open(fp, "w", encoding="utf-8").write(html_s)


def main():
    docs = {
        "zh": open(os.path.join(SRC, ZH_MD), encoding="utf-8").read(),
        "en": open(os.path.join(SRC, EN_MD), encoding="utf-8").read(),
    }
    # sanity: key numbers present verbatim
    assert "17" in docs["zh"] and "34%" in docs["zh"] and "49" in docs["zh"] and "+40.4%" in docs["zh"]
    assert "17" in docs["en"] and "34%" in docs["en"] and "49" in docs["en"] and "+40.4%" in docs["en"]
    assert "3.2" in docs["zh"] and "3.2" in docs["en"]

    for lang in ("zh", "en"):
        m = META[lang]
        home = bs.T[lang]["home"]
        path = f"research/{SLUG}/"
        body = body_html(docs[lang])
        html_body = (
            f'<section class="ph"><p class="crumb"><a href="/{lang}/">{home}</a> / '
            f'<a href="/{lang}/research/">{m["name"]}</a> / {E(m["h1"])}</p>'
            f'<h1>{E(m["h1"])}</h1>'
            f'<p class="r-meta">{m["date_label"]} {PUBLISHED}</p></section>'
            f'<article class="card prose g-art r-art">{body}</article>'
            + further(lang)
        )
        art = {
            "@type": "Article",
            "headline": m["h1"],
            "description": m["desc"],
            "inLanguage": bs.T[lang]["html"],
            "datePublished": PUBLISHED,
            "dateModified": PUBLISHED,
            "url": f"{bs.SITE}/{lang}/{path}",
            "mainEntityOfPage": f"{bs.SITE}/{lang}/{path}",
            "author": {"@id": bs.SITE + "/#org"},
            "publisher": {"@id": bs.SITE + "/#org"},
        }
        cr = bs.crumbs(lang, [(m["name"], "research/"), (m["h1"], path)])
        s = bs.page(lang, path, "research", html_body, [art, cr], title=m["title"], desc=m["desc"])
        bs.write(f"{lang}/{path}index.html", finish(lang, path, s, article=True))

        # index
        href, name = RESEARCH_LINK[lang]
        # 索引卡 HTML 与 guides 索引对齐：ul.g-list > li > a.card.g-card > h2 + p + span.g-go
        cards = (
            f'<li><a class="card g-card" href="{href}"><h2>{E(name)}</h2>'
            f'<p>{E(m["desc"])}</p><span class="g-go">{m["read"]} →</span></a></li>'
        )
        ibody = (
            f'<section class="ph"><p class="crumb"><a href="/{lang}/">{home}</a> / {m["name"]}</p>'
            f'<h1>{m["index_h1"]}</h1><p class="lead">{m["index_lead"]}</p></section>'
            f'<ul class="g-list">{cards}</ul>'
        )
        col = {
            "@type": "CollectionPage",
            "name": m["index_h1"],
            "description": m["index_desc"],
            "url": f"{bs.SITE}/{lang}/research/",
            "inLanguage": bs.T[lang]["html"],
            "isPartOf": {"@id": bs.SITE + "/#website"},
            "mainEntity": {
                "@type": "ItemList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": m["h1"],
                        "url": f"{bs.SITE}/{lang}/research/{SLUG}/",
                    }
                ],
            },
        }
        s = bs.page(
            lang,
            "research/",
            "research-index",
            ibody,
            [col, bs.crumbs(lang, [(m["name"], "research/")])],
            title=m["index_title"],
            desc=m["index_desc"],
        )
        bs.write(f"{lang}/research/index.html", finish(lang, "research/", s))

    patch_guides_further()
    print("research pages written")


if __name__ == "__main__":
    main()
