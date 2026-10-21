#!/usr/bin/env python3
"""校验官网：每页 JSON-LD 可解析、无禁用类型、canonical/hreflang 正确、链接目标存在、无禁用词。"""
import os, re, json, glob, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); S = "https://www.wakeloom.com"
BAN_T = {"AggregateRating", "Review"}; BAN_W = ["稳赚", "保证收益", "保证盈利", "alpha", "盈利的", "guaranteed", "FIRED"]
err = []; n = 0
for f in sorted(glob.glob(f"{ROOT}/zh/**/index.html", recursive=True) + glob.glob(f"{ROOT}/en/**/index.html", recursive=True) + [f"{ROOT}/index.html"]):
    rel = os.path.relpath(f, ROOT); s = open(f, encoding="utf-8").read(); n += 1
    path = "/" + rel[:-len("index.html")]
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    if len(lds) != 1: err.append(f"{rel}: JSON-LD 块数 {len(lds)}")
    for b in lds:
        try: j = json.loads(b)
        except Exception as e: err.append(f"{rel}: JSON-LD 解析失败 {e}"); continue
        types = set(re.findall(r'"@type":\s*"(\w+)"', b))
        if types & BAN_T: err.append(f"{rel}: 禁用类型 {types & BAN_T}")
        need = {"Organization", "WebSite"} | ({"BreadcrumbList"} if rel != "index.html" else set())
        if "/leader/" in path: need |= {"ProfilePage", "Dataset"}
        if path.endswith("/leaderboard/"): need |= {"ItemList"}
        if path.endswith("/faq/"): need |= {"FAQPage"}
        if path in ("/zh/", "/en/") or path.endswith("/copy-trading/"): need |= {"SoftwareApplication"}
        if path.endswith("/how-it-works/"): need |= {"Article"}
        if need - types: err.append(f"{rel}: 缺 {need - types}")
    can = re.findall(r'<link rel="canonical" href="([^"]+)"', s)
    if can != [S + path]: err.append(f"{rel}: canonical {can} ≠ {S+path}")
    hl = dict((a, b) for a, b in re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', s))
    tail = path[4:] if path[:4] in ("/zh/", "/en/") else ""
    exp = {"zh-CN": f"{S}/zh/{tail}", "en": f"{S}/en/{tail}", "x-default": S + "/"}
    if hl != exp: err.append(f"{rel}: hreflang {hl}")
    for k, u in exp.items():
        p = u[len(S):]; t = os.path.join(ROOT, p.lstrip("/"), "index.html")
        if not os.path.exists(t): err.append(f"{rel}: hreflang 目标不存在 {p}")
    for h in re.findall(r'href="(/[^"#?]*)', s):
        t = os.path.join(ROOT, h.lstrip("/")); t = os.path.join(t, "index.html") if h.endswith("/") else t
        if not os.path.exists(t): err.append(f"{rel}: 死链 {h}")
    text = re.sub(r"<[^>]+>", " ", re.sub(r'<script type="application/ld\+json">.*?</script>', " ", s, flags=re.S))
    if "/leader/" in path: text = re.sub(r"@\S+", " ", text)   # leader 昵称是第三方数据
    for w in BAN_W:
        if w.lower() in text.lower(): err.append(f"{rel}: 禁用词 {w}")
    if re.search(r'(无数据|No data)[^<]{0,3}0', text): pass
sm = open(f"{ROOT}/sitemap.xml").read(); locs = re.findall(r"<loc>([^<]+)</loc>", sm)
for u in locs:
    t = os.path.join(ROOT, u[len(S):].lstrip("/"), "index.html")
    if not os.path.exists(t): err.append(f"sitemap 目标不存在 {u}")
if "Disallow: /app/" not in open(f"{ROOT}/robots.txt").read(): err.append("robots 未屏蔽 /app/")
print(f"检查 {n} 页，sitemap {len(locs)} 条，问题 {len(err)}")
for e in err[:60]: print(" -", e)
sys.exit(1 if err else 0)
