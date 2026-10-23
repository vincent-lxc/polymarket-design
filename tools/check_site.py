#!/usr/bin/env python3
"""校验官网：每页 JSON-LD 可解析、无禁用类型、canonical/hreflang 正确、链接目标存在、无禁用词。"""
import os, re, json, glob, sys, struct
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
robots = open(f"{ROOT}/robots.txt").read()
if "Disallow: /app/" not in robots: err.append("robots 未屏蔽 /app/")
if re.search(r"(?im)^disallow:\s*/\s*$", robots): err.append("robots Disallow: / 会挡住 llms.txt")
if re.search(r"(?im)^disallow:\s*/llms", robots): err.append("robots 屏蔽了 llms.txt")

def meta(html, key):
    m = re.search(rf'<meta (?:property|name)="{re.escape(key)}" content="([^"]*)"', html)
    return m.group(1) if m else None
root_html = open(f"{ROOT}/index.html", encoding="utf-8").read()
for key in ("og:title", "og:description", "og:url", "og:image", "twitter:card", "twitter:title", "twitter:description", "twitter:image"):
    if not meta(root_html, key): err.append(f"根路径缺少 {key}")
if meta(root_html, "og:url") != S + "/": err.append(f"根路径 og:url {meta(root_html, 'og:url')}")
if meta(root_html, "twitter:card") != "summary_large_image": err.append(f"twitter:card {meta(root_html, 'twitter:card')}")
img = meta(root_html, "og:image") or ""
if "favicon" in img or img != S + "/assets/og-home.png": err.append(f"og:image {img}")
if meta(root_html, "twitter:image") != img: err.append("twitter:image 与 og:image 不一致")
if 'rel="canonical" href="' + S + '/en/"' in root_html: err.append("根路径 canonical 指向了 /en/")
og_path = os.path.join(ROOT, "assets", "og-home.png")
if not os.path.exists(og_path):
    err.append("缺少分享图 assets/og-home.png")
else:
    with open(og_path, "rb") as f:
        sig = f.read(8)
        if sig != b"\x89PNG\r\n\x1a\n": err.append("分享图不是 PNG")
        else:
            f.read(4); chunk = f.read(4)
            if chunk != b"IHDR": err.append("分享图缺少 IHDR")
            else:
                w, h = struct.unpack(">II", f.read(8))
                if w < 1200 or h < 630: err.append(f"分享图尺寸 {w}x{h}")
en_html = open(f"{ROOT}/en/index.html", encoding="utf-8").read()
if 'rel="canonical" href="' + S + '/en/"' not in en_html: err.append("/en/ canonical 不再自指")

llms_path = os.path.join(ROOT, "llms.txt")
if not os.path.exists(llms_path):
    err.append("缺少 llms.txt")
else:
    llms = open(llms_path, encoding="utf-8").read()
    for bit in ("公测前预览，尚未正式上线", "即将推出", "用于 Polymarket 的钱包分析与模拟盘跟单",
                S + "/", S + "/zh/", S + "/en/", S + "/zh/leaderboard/", S + "/en/leaderboard/",
                S + "/zh/how-it-works/", S + "/en/how-it-works/", S + "/zh/copy-trading/",
                S + "/en/copy-trading/", S + "/zh/faq/", S + "/en/faq/"):
        if bit not in llms: err.append(f"llms.txt 缺少 {bit}")
    low = llms.lower()
    for w in ("稳赚", "保证收益", "保证盈利", "guaranteed", "app.wakeloom.com", "收费", "评分", "价格", "price", "rating"):
        if w.lower() in low: err.append(f"llms.txt 红线 {w}")
    if "$" in llms or "¥" in llms: err.append("llms.txt 含价格符号")

keys = [n for n in os.listdir(ROOT) if re.fullmatch(r"[0-9a-f]{32}\.txt", n)]
if len(keys) != 1:
    err.append(f"IndexNow 密钥文件数量 {keys}")
else:
    key = keys[0][:-4]
    raw = open(os.path.join(ROOT, keys[0]), "rb").read()
    if raw != key.encode("ascii"): err.append(f"IndexNow 文件内容 {raw!r}")
    wjs = open(os.path.join(ROOT, "workers", "www.mjs"), encoding="utf-8").read()
    if f'export const INDEXNOW_KEY = "{key}"' not in wjs: err.append("Worker 密钥与文件名不一致")

print(f"检查 {n} 页，sitemap {len(locs)} 条，问题 {len(err)}")
for e in err[:60]: print(" -", e)
sys.exit(1 if err else 0)
