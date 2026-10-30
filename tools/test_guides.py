"""/guides/ 页面测试。先起本地预览：BFF_ORIGIN=http://127.0.0.1:8948 PORT=8947 node tools/preview-www.mjs
再跑：python3 tools/test_guides.py [http://127.0.0.1:8947]
覆盖：路由 200、JSON-LD 可解析且类型齐全、无价格/评分字段、canonical + hreflang、sitemap STATIC_PAGES、
llms.txt（源和成品）、站内链接和 FAQ 锚点不死链、禁用词、中文配图属性和图注、英文页无配图和图注、导航/页脚入口。
"""
import json, os, re, subprocess, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8947"
SITE = "https://www.wakeloom.com"
SLUGS = ["how-to-pick-polymarket-traders", "polymarket-trader-data-checklist", "polymarket-leaderboard-copy-pitfalls"]
PATHS = [f"/{L}/guides/{s}" for L in ("zh", "en") for s in [""] + [x + "/" for x in SLUGS]]
BANNED = ["待建", "校准中", "S0", "未命名", "示意", "PolymarketScan", "接口暂不可用", "推荐"]
# 稿件原文里的「值得跟」/ "worth copying" 按要求不改，单独计数上报，不算本页面实现的问题。
DRAFT_KNOWN = ["值得跟", "worth copying"]
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

known = {}
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
    for hl, u in (("zh-CN", f"{SITE}/zh{rest}"), ("en", f"{SITE}/en{rest}"), ("x-default", f"{SITE}/")):
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
    for w in DRAFT_KNOWN:
        c = vis.count(w) + lds[0].count(w)
        if c: known[(p, w)] = c
    imgs = re.findall(r"<img [^>]*>", main)
    if L == "en":
        ok(not imgs, f"{p} en no <img> in main")
        ok("Product prototype" not in h and "<figcaption" not in h and "<figure" not in h, f"{p} en no caption")
        ok(not re.search(r"/assets/guides/[^\"]*\.(webp|png|jpe?g)", h), f"{p} en no guide image ref")
    elif p.count("/") > 3:
        ok(len(imgs) == 1, f"{p} zh one figure")
        im = imgs[0]
        for a in ("width=", "height=", 'loading="lazy"', 'alt="'): ok(a in im, f"{p} img {a}")
        ok(re.search(r'alt="[^"]+"', im), f"{p} alt non-empty")
        src = re.search(r'src="([^"]+)"', im).group(1)
        ok(status(src) == 200, f"{p} img {src}")
        ok("<figcaption>产品原型，上线后界面可能不同</figcaption>" in main, f"{p} caption")
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

for (p, w), c in sorted(known.items()): print(f"DRAFT-KNOWN {p} 「{w}」 x{c}")
print(f"guides tests ok ({n} checks)")
