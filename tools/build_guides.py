"""生成 /zh/guides/、/en/guides/ 索引页和 3 篇指南（只写这 8 个页面和配图，不跑全站构建）。

正文取自 市场/guides/ 的稿件（中文 *.md、英文 en/*-en.md），不改字：
- 「## 正文 / ## Body」到下一个「---」是正文；「## 常见问题 / ## FAQ」是 FAQPage。
- 配图中英各 3 张（img/zh、img/en，1440×900），缩到 1200 宽 webp；图注按语言统一输出。
- 文末「延伸阅读」取稿件内链表里「文末「延伸阅读」」几行。
- 英文稿正文若 /en/faq/ 尚无锚点，按中文稿同一位置补上（中英 FAQ 题目同序、同 id）；稿件已带锚点则原样保留。
- 上线通知 CTA：文案取稿件「上线通知 CTA」一节（en 02/03 写的是 same as zh，用 en 01 的文案），
  表单沿用 main 上首页 #notify 的 waitlist 表单结构，source 为 guide-pick-traders / guide-data-checklist / guide-copy-pitfalls（中英同名，靠 lang 区分）。
- 文末「看几个真实地址」改为链排行榜：中文「去排行榜看看真实地址」→ /zh/leaderboard/，英文 "See real addresses on the leaderboard" → /en/leaderboard/。
用法：python3 tools/build_guides.py [稿件目录]
"""
import html, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_site as bs  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else "/workspace/projects/wakeloom/市场/guides"
E = html.escape
PUBLISHED = "2026-10-30"
SLUGS = [("how-to-pick-polymarket-traders", "01"), ("polymarket-trader-data-checklist", "02"), ("polymarket-leaderboard-copy-pitfalls", "03")]
IMG = {"01": "01-leaderboard", "02": "02-leader-detail", "03": "03-leader-ledger"}
CAPTION = {"zh": "产品原型，上线后界面可能不同", "en": "Product prototype. The live interface may differ."}
G = {"zh": dict(name="指南", h1="Polymarket 跟单指南", lead="怎么挑交易者、跟单前看哪些数据、照抄排行榜会踩哪些坑。只讲方法和怎么看数据。",
                title="Polymarket 跟单指南 | Wakeloom 织迹", desc="怎么判断 Polymarket 交易者、跟单前该看哪些数据、照抄排行榜的常见坑。",
                more="延伸阅读", faq="常见问题", read="阅读"),
     "en": dict(name="Guides", h1="Polymarket copy trading guides", lead="How to pick traders, what to check before copying, and the traps in copying a leaderboard. Methods and how to read the data.",
                title="Polymarket Copy Trading Guides | Wakeloom", desc="How to judge a Polymarket trader, what data to check before copying, and common pitfalls of copying the leaderboard.",
                more="Further reading", faq="FAQ", read="Read")}
OTHER = {L: dict(bs.T[L]["nav"] + bs.T[L]["foot"]) for L in ("zh", "en")}


def src_path(lang, num, slug):
    return os.path.join(SRC, f"{num}-{slug}.md") if lang == "zh" else os.path.join(SRC, "en", f"{num}-{slug}-en.md")


def field(md, key):
    m = re.search(r"^\| *" + re.escape(key) + r" *\| *(.*?) *\|$", md, re.M)
    return m.group(1).replace("\\|", "|").strip() if m else None


def inline(t):
    out, pos = [], 0
    for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|`([^`]+)`", t):
        out.append(E(t[pos:m.start()]))
        if m.group(1): out.append(f'<a href="{E(m.group(2))}">{E(m.group(1))}</a>')
        elif m.group(3): out.append(f"<strong>{inline(m.group(3))}</strong>")
        else: out.append(f"<code>{E(m.group(4))}</code>")
        pos = m.end()
    out.append(E(t[pos:]))
    return "".join(out)


def figure(lang, num, alt):
    from PIL import Image
    name = f"{IMG[num]}-{lang}.webp"
    dst = os.path.join(ROOT, "assets", "guides", name)
    im = Image.open(os.path.join(SRC, "img", lang, f"{IMG[num]}.png")).convert("RGB")
    if im.width > 1200: im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=82, method=6)
    return (f'<figure class="g-fig"><img src="/assets/guides/{name}" width="{im.width}" height="{im.height}" alt="{E(alt)}" loading="lazy" decoding="async">'
            f'<figcaption>{E(CAPTION[lang])}</figcaption></figure>')


def faq_anchors(lang, num, slug, block):
    """英文稿里不带锚点的 /en/faq/ 按中文稿正文里 FAQ 链接的顺序补锚点；已有锚点则不动。"""
    if lang != "en": return block
    bare = len(re.findall(r"\]\(/en/faq/\)", block))
    if bare == 0: return block
    zh = section(open(src_path("zh", num, slug), encoding="utf-8").read(), "正文")
    ids = re.findall(r"\]\(/zh/faq/#([a-z0-9-]+)\)", zh)
    assert bare == len(ids), (slug, bare, ids)
    it = iter(ids)
    return re.sub(r"\]\(/en/faq/\)", lambda m: f"](/en/faq/#{next(it)})", block)


CTA_SRC = {"01": "guide-pick-traders", "02": "guide-data-checklist", "03": "guide-copy-pitfalls"}
CTA_UI = {"zh": dict(lab="上线通知我", btn="通知我"), "en": dict(lab="Notify me at launch", btn="Notify me")}


def cta_copy(lang, md):
    if lang == "zh":
        sec = section(md, "上线通知 CTA")
        q = re.findall(r"「([^」]+)」", "\n".join(l for l in sec.split("\n") if not l.startswith(">")))
        return q[0], q[1]
    m = re.search(r'^CTA: "([^"]+)".*?small print "([^"]+)"', md, re.M)
    if not m:  # en 02/03：Same as the Chinese draft，文案同 en 01
        m = re.search(r'^CTA: "([^"]+)".*?small print "([^"]+)"', open(src_path("en", "01", SLUGS[0][0]), encoding="utf-8").read(), re.M)
    return m.group(1), m.group(2)


def cta(lang, num, md):
    text, small = cta_copy(lang, md); u = CTA_UI[lang]; fid = f"wl-g{num}"
    return (f'<section class="card wl-card wl-gate g-cta" id="notify" hidden><p>{E(text)}</p>'
            f'<form class="wl-form wl-guide" data-endpoint="https://api.wakeloom.com/v1/waitlist" data-lang="{lang}" data-source="{CTA_SRC[num]}" novalidate>'
            f'<label class="wl-lab" for="{fid}">{u["lab"]}</label>'
            f'<div class="wl-hp" aria-hidden="true"><label for="{fid}-web">Website</label><input id="{fid}-web" name="website" type="text" tabindex="-1" autocomplete="off" value=""></div>'
            f'<div class="wl-row"><input id="{fid}" name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"><button class="btn pri" type="submit">{u["btn"]}</button></div>'
            f'<p class="wl-msg" role="status" aria-live="polite"></p><p class="wl-pv">{E(small)}</p></form></section>')


def body_html(lang, num, block):
    parts, para = [], []
    lines = block.split("\n"); i = 0
    def flush():
        if para: parts.append(f"<p>{inline(' '.join(para))}</p>"); para.clear()
    while i < len(lines):
        ln = lines[i].strip()
        m = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", ln)
        if not ln: flush()
        elif ln.startswith("### "): flush(); parts.append(f"<h2>{inline(ln[4:])}</h2>")
        elif m:
            flush()
            parts.append(figure(lang, num, m.group(1)))
            if i + 1 < len(lines) and re.match(r"^\*[^*].*\*$", lines[i + 1].strip()): i += 1  # 稿件里的斜体图注由 CAPTION 统一输出
        elif ln.startswith("- "): flush(); parts.append(f"<ul><li>{inline(ln[2:])}</li></ul>")
        else: para.append(ln)
        i += 1
    flush()
    return "".join(parts).replace("</ul><ul>", "")


def faq_items(block):
    qs, q, a = [], None, []
    for ln in block.split("\n"):
        ln = ln.strip()
        m = re.match(r"^\*\*(.+)\*\*$", ln)
        if m:
            if q: qs.append((q, " ".join(a)))
            q, a = m.group(1), []
        elif ln and q and not ln.startswith("---"): a.append(ln)
    if q: qs.append((q, " ".join(a)))
    return qs


def section(md, starts):
    m = re.search(r"^## (?:" + starts + r").*$", md, re.M)
    rest = md[m.end():]
    end = re.search(r"^(?:---|## )", rest, re.M)
    return rest[:end.start()] if end else rest


def strip_md(t):
    return re.sub(r"\*\*(.+?)\*\*", r"\1", re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t))


def further(lang, md, titles):
    zh = open(src_path("zh", *[(n, s) for s, n in SLUGS if s in md_slug(md)][0]), encoding="utf-8").read() if lang == "en" else md
    rows = re.findall(r"^\| 文末「延伸阅读」 \| .*? \| (.*?) \|$", zh, re.M)
    links = []
    for cell in rows:
        for p in re.findall(r"`/zh/([^`]+)`", cell):
            slug = p.split("guides/")[-1].strip("/") if p.startswith("guides/") else None
            name = titles[lang][slug][0] if slug else OTHER[lang][p]
            links.append(f'<li><a href="/{lang}/{p}">{E(name)}</a></li>')
    return f'<section class="card prose g-more"><h2>{G[lang]["more"]}</h2><ul>{"".join(links)}</ul></section>'



def see_leaders(lang, md):
    """文末「去排行榜看看真实地址」/ See real addresses on the leaderboard。"""
    if lang == "zh":
        m = re.search(r"文末区块文字：「(\[去排行榜看看真实地址\]\(/zh/leaderboard/\))」", md)
        if not m:
            m = re.search(r"^\| 文末「去排行榜看看真实地址」 \| 去排行榜看看真实地址 \| `/zh/leaderboard/` \|$", md, re.M)
            link_md = "[去排行榜看看真实地址](/zh/leaderboard/)" if m else None
        else:
            link_md = m.group(1)
    else:
        m = re.search(r'End-of-page block: "(\[See real addresses on the leaderboard\]\(/en/leaderboard/\))"', md)
        if not m:
            m = re.search(r'End-of-page block: "(\[See real addresses on the leaderboard\]\(/en/leaderboard/\))"', open(src_path("en", "01", SLUGS[0][0]), encoding="utf-8").read())
        link_md = m.group(1) if m else None
    assert link_md, (lang, "missing leaderboard end-of-page link")
    return f'<section class="card prose g-see"><p>{inline(link_md)}</p></section>'


def md_slug(md):
    return field(md, "URL") or ""


def shell_lines(lang, path):
    """沿用现网已发布页面的提示条、页头和页脚（build_site.page() 的页头 CTA 链接已落后于线上手改版本）。"""
    ref = open(os.path.join(ROOT, lang, "faq", "index.html"), encoding="utf-8").read().split("\n")
    banner = next(l for l in ref if l.startswith('<div class="pv"'))
    header = next(l for l in ref if l.startswith('<header class="top">'))
    nav = next(l for l in ref if l.startswith('<nav class="nv">'))
    foot = next(l for l in ref if l.startswith('<footer class="ft">'))
    other = "en" if lang == "zh" else "zh"
    nav = nav.replace(' class=on', '').replace(f'href="/{lang}/guides/"', f'href="/{lang}/guides/" class=on')
    nav = nav.replace(f'href="/{other}/faq/"', f'href="/{other}/{path}"')
    return banner, header, nav, foot


def finish(lang, path, s):
    banner, header, nav, foot = shell_lines(lang, path)
    L = s.split("\n")
    for i, l in enumerate(L):
        if l.startswith('<div class="pv"'): L[i] = banner
        elif l.startswith('<header class="top">'): L[i] = header
        elif l.startswith('<nav class="nv">'): L[i] = nav
        elif l.startswith('<footer class="ft">'): L[i] = foot
        elif l.startswith('<link rel="stylesheet" href="/site.css'): L[i] = l + '<link rel="stylesheet" href="/assets/guides/guides.css?v=3">'
    return "\n".join(L).replace('data-waitlist="off"', 'data-waitlist="on"', 1)


def main():
    titles = {"zh": {}, "en": {}}
    docs = {}
    for lang in ("zh", "en"):
        for slug, num in SLUGS:
            md = open(src_path(lang, num, slug), encoding="utf-8").read()
            assert md_slug(md).strip("`") == f"/{lang}/guides/{slug}/", (lang, slug)
            titles[lang][slug] = (field(md, "H1"), field(md, "meta description"), field(md, "title"))
            docs[(lang, slug)] = (num, md)
    for lang in ("zh", "en"):
        g = G[lang]; home = bs.T[lang]["home"]
        for slug, num in SLUGS:
            n, md = docs[(lang, slug)]
            h1, desc, title = titles[lang][slug]
            path = f"guides/{slug}/"
            body = body_html(lang, num, faq_anchors(lang, num, slug, section(md, "正文|Body")))
            qs = faq_items(section(md, "常见问题|FAQ"))
            qa = "".join(f'<details class="card qa"><summary><h2>{inline(q)}</h2><i>+</i></summary><p>{inline(a)}</p></details>' for q, a in qs)
            html_body = (f'<section class="ph"><p class="crumb"><a href="/{lang}/">{home}</a> / <a href="/{lang}/guides/">{g["name"]}</a> / {E(h1)}</p><h1>{E(h1)}</h1></section>'
                         f'<article class="card prose g-art">{body}</article>'
                         f'<section class="faq g-faq"><h2 class="g-h">{g["faq"]}</h2>{qa}</section>' + further(lang, md, titles) + see_leaders(lang, md) + cta(lang, num, md))
            art = {"@type": "Article", "headline": h1, "description": desc, "inLanguage": bs.T[lang]["html"],
                   "datePublished": PUBLISHED, "dateModified": PUBLISHED, "url": f"{bs.SITE}/{lang}/{path}",
                   "mainEntityOfPage": f"{bs.SITE}/{lang}/{path}",
                   "author": {"@id": bs.SITE + "/#org"}, "publisher": {"@id": bs.SITE + "/#org"}}
            art["image"] = f"{bs.SITE}/assets/guides/{IMG[num]}-{lang}.webp"
            fp = {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": strip_md(q), "acceptedAnswer": {"@type": "Answer", "text": strip_md(a)}} for q, a in qs]}
            cr = bs.crumbs(lang, [(g["name"], "guides/"), (h1, path)])
            s = bs.page(lang, path, "guide", html_body, [art, fp, cr], title=title, desc=desc)
            bs.write(f"{lang}/{path}index.html", finish(lang, path, s))
        cards = "".join(f'<li><a class="card g-card" href="/{lang}/guides/{slug}/"><h2>{E(titles[lang][slug][0])}</h2><p>{E(titles[lang][slug][1])}</p><span class="g-go">{g["read"]} →</span></a></li>' for slug, _ in SLUGS)
        body = (f'<section class="ph"><p class="crumb"><a href="/{lang}/">{home}</a> / {g["name"]}</p><h1>{g["h1"]}</h1><p class="lead">{g["lead"]}</p></section>'
                f'<ul class="g-list">{cards}</ul>')
        col = {"@type": "CollectionPage", "name": g["h1"], "description": g["desc"], "url": f"{bs.SITE}/{lang}/guides/", "inLanguage": bs.T[lang]["html"],
               "isPartOf": {"@id": bs.SITE + "/#website"},
               "mainEntity": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": i, "name": titles[lang][slug][0], "url": f"{bs.SITE}/{lang}/guides/{slug}/"} for i, (slug, _) in enumerate(SLUGS, 1)]}}
        s = bs.page(lang, "guides/", "guides", body, [col, bs.crumbs(lang, [(g["name"], "guides/")])], title=g["title"], desc=g["desc"])
        bs.write(f"{lang}/guides/index.html", finish(lang, "guides/", s))


if __name__ == "__main__":
    main()
