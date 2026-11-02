"""/guides/ 页面测试。先起本地预览：BFF_ORIGIN=http://127.0.0.1:8948 PORT=8947 node tools/preview-www.mjs
再跑：python3 tools/test_guides.py [http://127.0.0.1:8947]
覆盖：路由 200、JSON-LD 可解析且类型齐全、无价格/评分字段、canonical + hreflang、sitemap STATIC_PAGES、
llms.txt（源和成品）、站内链接和 FAQ 锚点不死链、禁用词、中英配图属性（1200×750）和对应语言图注、每篇的上线通知表单（source=guide-pick-traders|guide-data-checklist|guide-copy-pitfalls）、文末链排行榜、
en FAQ 链接带锚点、稿件内部用语不上页面、白名单外的 leader 地址不出现、导航/页脚入口。
"""
import json, os, re, subprocess, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8947"
SITE = "https://www.wakeloom.com"
SLUGS = ["how-to-pick-polymarket-traders", "polymarket-trader-data-checklist", "polymarket-leaderboard-copy-pitfalls"]
PATHS = [f"/{L}/guides/{s}" for L in ("zh", "en") for s in [""] + [x + "/" for x in SLUGS]]
BANNED = ["待建", "校准中", "S0", "未命名", "示意", "PolymarketScan", "接口暂不可用", "推荐",
          "值得跟", "值不值得", "worth copying", "worth following", "traders to follow", "Worth copying", "Worth following"]
# 稿件里的状态行、DRAFT 标记、内部备注不能出现在页面上（大小写敏感的词另列）
INTERNAL = ["DRAFT", "初稿", "口径已过", "上线待", "Emily", "Casey", "Avery", "Morgan", "pending", "原 P0", "联调", "{leader_link", "{as_of}", "构建时取"]
n = 0
def ok(c, m):
    global n
    if not c: raise SystemExit("FAIL: " + m)
    n += 1
def get(p):
    with urllib.request.urlopen(BASE + p) as r: return r.status, r.read().decode()
def status(p):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + p, method="GET")) as r: return r.status
    except urllib.error.HTTPError as e: return e.code
def keys(x):
    if isinstance(x, dict):
        for k, v in x.items(): yield k; yield from keys(v)
    elif isinstance(x, list):
        for v in x: yield from keys(v)
def types(x):
    if isinstance(x, dict):
        if "@type" in x: yield x["@type"]
        for v in x.values(): yield from types(v)
    elif isinstance(x, list):
        for v in x: yield from types(v)

PINNED = set(json.loads(subprocess.check_output(["node", "--input-type=module", "-e",
    f"import {{LEADER_INDEX_PINNED}} from '{ROOT}/workers/leader-pin.mjs'; console.log(JSON.stringify(Object.keys(LEADER_INDEX_PINNED)))"], text=True)))
pages = {}
for p in PATHS:
    st, h = get(p); ok(st == 200, f"{p} {st}"); pages[p] = h
    L = p[1:3]; other = "en" if L == "zh" else "zh"; rest = p[3:]
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)
    ok(len(lds) == 1, f"{p} one JSON-LD block")
    ld = json.loads(lds[0]); ts = set(types(ld))
    need = {"Article", "FAQPage", "BreadcrumbList", "Question", "Answer"} if p.count("/") > 3 else {"CollectionPage", "ItemList", "BreadcrumbList"}
    ok(need <= ts, f"{p} types {ts}")
    bad = {k for k in keys(ld) if re.search(r"price|rating|review|offers", k, re.I)}
    ok(not bad, f"{p} banned LD keys {bad}")
    ok(f'<link rel="canonical" href="{SITE}{p}">' in h, f"{p} canonical")
    for hl, u in (("zh-CN", f"{SITE}/zh{rest}"), ("en", f"{SITE}/en{rest}"), ("x-default", f"{SITE}/en{rest}")):
        ok(f'<link rel="alternate" hreflang="{hl}" href="{u}">' in h, f"{p} hreflang {hl}")
    ok(f'href="/{other}{rest}"' in h, f"{p} language switch")
    ok(h.count(f'href="/{L}/guides/"') >= 2, f"{p} nav + footer entry")
    if "FAQPage" in ts:
        fq = [e for e in ld["@graph"] if e.get("@type") == "FAQPage"][0]["mainEntity"]
        ok(len(fq) == len(re.findall(r'<details class="card qa">', h)), f"{p} FAQ LD = visible")
    main = re.search(r"<main>(.*)</main>", h, re.S).group(1)
    vis = re.sub(r"<[^>]+>", " ", re.sub(r'<script.*?</script>', " ", h, flags=re.S))
    for w in BANNED: ok(w not in vis and w not in lds[0], f"{p} banned word {w}")
    ok("尚未正式上线" in h or L == "en", f"{p} 尚未正式上线")
    for w in INTERNAL: ok(w not in vis and w not in lds[0], f"{p} internal wording {w}")
    ok('data-waitlist="on"' in h, f"{p} waitlist switch on")
    for a in re.findall(r'href="/[a-z]{2}/leader/(0x[0-9a-fA-F]{40})', h): ok(a.lower() in PINNED, f"{p} leader {a} not pinned")
    imgs = re.findall(r"<img [^>]*>", main)
    CAP = {"zh": "产品原型，上线后界面可能不同", "en": "Product prototype. The live interface may differ."}
    if p.count("/") > 3:
        ok(len(imgs) == 1, f"{p} one figure")
        im = imgs[0]
        for a in ("width=", "height=", 'loading="lazy"', 'alt="'): ok(a in im, f"{p} img {a}")
        ok(re.search(r'alt="[^"]+"', im), f"{p} alt non-empty")
        src = re.search(r'src="([^"]+)"', im).group(1)
        ok(src.endswith(f"-{L}.webp"), f"{p} img language {src}")
        ok(status(src) == 200, f"{p} img {src}")
        ok(f"<figcaption>{CAP[L]}</figcaption>" in main, f"{p} caption")
        ok(CAP["en" if L == "zh" else "zh"] not in h, f"{p} no other-language caption")
        ok('width="1200" height="750"' in im, f"{p} img 1200x750")
        SRC = {"how-to-pick-polymarket-traders": "guide-pick-traders", "polymarket-trader-data-checklist": "guide-data-checklist", "polymarket-leaderboard-copy-pitfalls": "guide-copy-pitfalls"}
        slug = p.split("/")[3]
        forms = re.findall(r'<form class="wl-form[^"]*"[^>]*>', main)
        ok(len(forms) == 1 and f'data-source="{SRC[slug]}"' in forms[0] and f'data-lang="{L}"' in forms[0], f"{p} CTA form {forms}")
        see = "去排行榜看看真实地址" if L == "zh" else "See real addresses on the leaderboard"
        ok(f'<a href="/{L}/leaderboard/">{see}</a>' in main, f"{p} see-leaders link")
        ok(not re.search(r'href="/[a-z]{2}/leader/0x', main), f"{p} no individual leader href")
        ok('data-endpoint="https://api.wakeloom.com/v1/waitlist"' in forms[0], f"{p} CTA endpoint")
        ok(re.search(r'<input id="(wl-g0\d)" name="email" type="email"[^>]*required', main) and 'name="website"' in main, f"{p} CTA inputs")
        ok(("可随时退订" if L == "zh" else "Unsubscribe anytime") in main, f"{p} CTA small print")
        ok(not re.search(r'href="/en/faq/"', re.search(r'<article.*?</article>', main, re.S).group(0)), f"{p} body FAQ link without anchor")
    else:
        ok(not re.findall(r'<form class="wl-form[^"]*"', main), f"{p} index no CTA form")
    for href in set(re.findall(r'href="(/[^"]*)"', h)):
        path, _, frag = href.partition("#")
        st = status(path); ok(st == 200, f"{p} link {href} {st}")
        if frag: ok(f'id="{frag}"' in get(path)[1], f"{p} anchor {href}")

# en 稿不能把 img/en 拷进站点
ok(not [f for f in os.listdir(os.path.join(ROOT, "assets", "guides")) if f.endswith((".png",))], "no png copied")

# sitemap STATIC_PAGES
locs = json.loads(subprocess.check_output(["node", "--input-type=module", "-e",
    f"import {{STATIC_PAGES}} from '{ROOT}/workers/sitemap-bff.mjs'; console.log(JSON.stringify(STATIC_PAGES.map(p=>p.loc)))"], text=True))
for p in PATHS: ok(SITE + p in locs, f"sitemap {p}")
sm = subprocess.check_output(["node", "--input-type=module", "-e",
    f"import {{renderSitemap}} from '{ROOT}/workers/sitemap-bff.mjs'; console.log(renderSitemap([]))"], text=True)
for p in PATHS: ok(f"<loc>{SITE}{p}</loc>" in sm, f"rendered sitemap {p}")

# llms.txt：源（build_site.write_llms）、成品、线上路由
src = open(os.path.join(ROOT, "tools", "build_site.py"), encoding="utf-8").read()
built = open(os.path.join(ROOT, "llms.txt"), encoding="utf-8").read()
served = get("/llms.txt")[1]
for p in PATHS:
    ok(f'(f"{{SITE}}{p}"' in src, f"llms source {p}")
    ok(f"]({SITE}{p})" in built and f"]({SITE}{p})" in served, f"llms.txt {p}")

print(f"guides tests ok ({n} checks)")
