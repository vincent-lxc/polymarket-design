"""/research/ 页面测试。先起本地预览再跑：python3 tools/test_research.py [http://127.0.0.1:8947]
覆盖：路由 200、Article/CollectionPage + BreadcrumbList、无价格/评分、canonical+hreflang、
sitemap、llms.txt、禁词、数字原文、guides↔research 互链、无 Research 导航项、页脚研究入口、索引卡对齐 guides、无 CTA、无个人地址。
"""
import json, os, re, subprocess, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8947"
OFFLINE = BASE == "--offline"
SITE = "https://www.wakeloom.com"
SLUG = "leaderboard-data-quality"
PATHS = [f"/{L}/research/{s}" for L in ("zh", "en") for s in ("", f"{SLUG}/")]
BANNED = [
    "待建", "校准中", "S0", "未命名", "示意", "PolymarketScan", "接口暂不可用", "推荐",
    "值得跟", "值不值得", "worth copying", "worth following", "traders to follow",
    "Worth copying", "Worth following", "第一期", "phase one", "Phase one", "DRAFT",
    "多数地址",
]
INTERNAL = [
    "初稿", "口径已过", "上线待", "Emily", "Casey", "Avery", "Morgan",
    "/workspace/", "原 P0", "联调",
]
# 数字保留原文（Avery）：不得被四舍五入或改写
NUMS = {
    "zh": ["17", "34%", "9", "18%", "20,000+", "49", "22", "15", "81", "26", "+40.4%", "3.2"],
    "en": ["17", "34%", "9", "18%", "20,000+", "49", "22", "15", "81", "26", "+40.4%", "3.2"],
}
n = 0


def ok(c, m):
    global n
    if not c:
        raise SystemExit("FAIL: " + m)
    n += 1


def get(p):
    if OFFLINE:
        fp = os.path.join(ROOT, p.lstrip("/"), "index.html") if p.endswith("/") else os.path.join(ROOT, p.lstrip("/"))
        with open(fp, encoding="utf-8") as f:
            return 200, f.read()
    with urllib.request.urlopen(BASE + p) as r:
        return r.status, r.read().decode()


def status(p):
    if OFFLINE:
        fp = os.path.join(ROOT, p.lstrip("/"), "index.html") if p.endswith("/") else os.path.join(ROOT, p.lstrip("/"))
        return 200 if os.path.isfile(fp) else 404
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + p, method="GET")) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def keys(x):
    if isinstance(x, dict):
        for k, v in x.items():
            yield k
            yield from keys(v)
    elif isinstance(x, list):
        for v in x:
            yield from keys(v)


def types(x):
    if isinstance(x, dict):
        if "@type" in x:
            yield x["@type"]
        for v in x.values():
            yield from types(v)
    elif isinstance(x, list):
        for v in x:
            yield from types(v)


pages = {}
for p in PATHS:
    st, h = get(p)
    ok(st == 200, f"{p} {st}")
    pages[p] = h
    L = p[1:3]
    other = "en" if L == "zh" else "zh"
    rest = p[3:]
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)
    ok(len(lds) == 1, f"{p} one JSON-LD block")
    ld = json.loads(lds[0])
    ts = set(types(ld))
    if p.endswith(f"/{SLUG}/"):
        need = {"Article", "BreadcrumbList"}
    else:
        need = {"CollectionPage", "ItemList", "BreadcrumbList"}
    ok(need <= ts, f"{p} types {ts}")
    bad = {k for k in keys(ld) if re.search(r"price|rating|review|offers", k, re.I)}
    ok(not bad, f"{p} banned LD keys {bad}")
    ok(f'<link rel="canonical" href="{SITE}{p}">' in h, f"{p} canonical")
    for hl, u in (("zh-CN", f"{SITE}/zh{rest}"), ("en", f"{SITE}/en{rest}"), ("x-default", f"{SITE}/")):
        ok(f'<link rel="alternate" hreflang="{hl}" href="{u}">' in h, f"{p} hreflang {hl}")
    ok(f'href="/{other}{rest}"' in h, f"{p} language switch")
    # 不加 Research 导航项；guides 仍在
    ok(not re.search(r">研究<|>Research<", re.search(r'<nav class="nv">.*?</nav>', h).group(0)), f"{p} no Research nav")
    ok(f'href="/{L}/guides/"' in h, f"{p} guides still in nav")
    ft = re.search(r'<footer class="ft">.*?</footer>', h, re.S).group(0)
    foot_label = "研究" if L == "zh" else "Research"
    ok(f'href="/{L}/research/">{foot_label}</a>' in ft, f"{p} footer research")
    ok(f'href="/{L}/guides/"' in ft, f"{p} footer guides")
    main = re.search(r"<main>(.*)</main>", h, re.S).group(1)
    vis = re.sub(r"<[^>]+>", " ", re.sub(r"<script.*?</script>", " ", h, flags=re.S))
    for w in BANNED:
        ok(w not in vis and w not in lds[0], f"{p} banned {w}")
    for w in INTERNAL:
        ok(w not in vis and w not in lds[0], f"{p} internal {w}")
    ok('data-waitlist="on"' in h, f"{p} waitlist on")
    ok(not re.search(r'href="/[a-z]{2}/leader/0x', h), f"{p} no leader href")
    ok(not re.findall(r'<form class="wl-form', main), f"{p} no CTA form")
    if p.endswith(f"/{SLUG}/"):
        ok(f'<a href="/{L}/leaderboard/">/{L}/leader/0x…/</a>' in main, f"{p} leader pattern links to leaderboard")
        ok(f'<a href="/{L}/leaderboard/">www.wakeloom.com/{L}/leaderboard/</a>' in main, f"{p} leaderboard source linked")
        for num in NUMS[L]:
            ok(num in main, f"{p} verbatim {num}")
        ok(f'href="/{L}/guides/how-to-pick-polymarket-traders/"' in main, f"{p} link pick guide")
        ok(f'href="/{L}/guides/polymarket-trader-data-checklist/"' in main, f"{p} link checklist")
        ok(f'href="/{L}/guides/polymarket-leaderboard-copy-pitfalls/"' in main, f"{p} link pitfalls")
        ok(f'href="/{L}/leaderboard/"' in main, f"{p} link leaderboard")
        ok("<table" in main and "r-table" in main, f"{p} has tables")
        ok("/assets/research/research.css" in h, f"{p} research.css")
    else:
        ok(f'href="/{L}/research/{SLUG}/"' in main, f"{p} index card")
        # 索引卡结构对齐 guides：ul.g-list > li > a.card.g-card > h2 + p + span.g-go
        ok(re.search(
            r'<ul class="g-list"><li><a class="card g-card" href="/[^"]+/research/[^"]+/"><h2>.+?</h2><p>.+?</p><span class="g-go">.+?</span></a></li></ul>',
            main, re.S,
        ), f"{p} g-card structure")
        ok("/assets/guides/guides.css" in h, f"{p} guides.css for cards")
        ok("/assets/research/research.css" not in h, f"{p} index no research.css")
    for href in set(re.findall(r'href="(/[^"#?]*)', h)):
        st = status(href)
        ok(st == 200, f"{p} link {href} {st}")

# guides → research 互链
for L in ("zh", "en"):
    for path in (
        f"/{L}/guides/",
        f"/{L}/guides/how-to-pick-polymarket-traders/",
        f"/{L}/guides/polymarket-trader-data-checklist/",
        f"/{L}/guides/polymarket-leaderboard-copy-pitfalls/",
    ):
        h = get(path)[1]
        ok(f'href="/{L}/research/{SLUG}/"' in h, f"{path} → research")

locs = json.loads(
    subprocess.check_output(
        [
            "node",
            "--input-type=module",
            "-e",
            f"import {{STATIC_PAGES}} from '{ROOT}/workers/sitemap-bff.mjs'; console.log(JSON.stringify(STATIC_PAGES.map(p=>p.loc)))",
        ],
        text=True,
    )
)
for p in PATHS:
    ok(SITE + p in locs, f"sitemap {p}")
sm = subprocess.check_output(
    [
        "node",
        "--input-type=module",
        "-e",
        f"import {{renderSitemap}} from '{ROOT}/workers/sitemap-bff.mjs'; console.log(renderSitemap([]))",
    ],
    text=True,
)
for p in PATHS:
    ok(f"<loc>{SITE}{p}</loc>" in sm, f"rendered sitemap {p}")

src = open(os.path.join(ROOT, "tools", "build_site.py"), encoding="utf-8").read()
built = open(os.path.join(ROOT, "llms.txt"), encoding="utf-8").read()
served = get("/llms.txt")[1]
for p in PATHS:
    ok(f'(f"{{SITE}}{p}"' in src, f"llms source {p}")
    ok(f"]({SITE}{p})" in built and f"]({SITE}{p})" in served, f"llms.txt {p}")

print(f"research tests ok ({n} checks)")
