#!/usr/bin/env python3
"""Wakeloom 织迹 官网静态生成器。
用法：python3 tools/build_site.py   （在仓库根目录运行，输出写到 zh/ en/ 及根目录的 index.html、sitemap.xml、robots.txt）
数据：构建时读取 BFF 公开接口；接口不可用时生成占位页并写明。JSON-LD 静态写进 HTML。
"""
import json, os, re, sys, html, shutil, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.wakeloom.com"
API = os.environ.get("WAKELOOM_API", "https://api.wakeloom.com").rstrip("/")
MIN_RESOLVED = 20          # 详情页只收录已结算市场数 ≥ N 的地址
BUILT = dt.datetime.now(dt.timezone.utc)
E = html.escape

def get(path):
    req = urllib.request.Request(API + path, headers={"Accept": "application/json", "User-Agent": "wakeloom-site-build"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

# ---------------- 数据 ----------------
def load():
    data = {"ok": False, "as_of": None, "leaders": [], "wallets": {}, "source": None, "err": None}
    try:
        lb = get("/v1/public/leaderboard")
        b = lb.get("leaderboard") or {}
        data.update(ok=True, as_of=b.get("as_of"), leaders=b.get("leaders") or [], source="/v1/public/leaderboard", window=b.get("window"))
    except Exception as e:
        data["err"] = str(e); return data
    keep = [l for l in data["leaders"] if l.get("gate_pass") and ((l.get("metrics") or {}).get("resolved_markets") or 0) >= MIN_RESOLVED]
    def w(l):
        try: return l["address"], get("/v1/public/wallets/" + l["address"])
        except Exception: return l["address"], None
    with ThreadPoolExecutor(8) as ex:
        for a, j in ex.map(w, keep): data["wallets"][a] = j
    data["leaders"] = keep
    return data

# ---------------- 格式 ----------------
def pct(x, sign=False, d=1):
    if x is None or not isinstance(x, (int, float)): return None
    v = x * 100; s = "+" if sign and v > 0 else ("−" if v < 0 else "")
    return f"{s}{abs(v):.{d}f}%"
def usd(x, sign=False):
    if x is None or not isinstance(x, (int, float)): return None
    s = "+" if sign and x > 0 else ("−" if x < 0 else "")
    return f"{s}${abs(x):,.2f}" if abs(x) < 100 else f"{s}${abs(x):,.0f}"
def num(x):
    return None if x is None else f"{x:,}"
def short(a): return a[:6] + "…" + a[-4:]
def dname(w, a):
    n = (w or {}).get("user_name") or ""
    # Polymarket 默认昵称是「地址-时间戳」或随机串，不当名字显示
    if not n or n.lower().startswith("0x") or re.search(r"-\d{10,}$", n) or len(n) > 24 or n.lower() in a.lower(): return short(a)
    return "@" + n
CAT = {"politics": "政治", "geopolitics": "地缘政治", "tech": "科技", "sports": "体育", "crypto": "加密货币", "economy": "经济", "finance": "金融", "business": "商业", "culture": "文化", "pop-culture": "文化娱乐", "weather": "天气", "science": "科学", "world": "国际", "elections": "选举", "esports": "电竞", "mentions": "言论"}
def bj(iso_or_ts, lang):
    if iso_or_ts is None: return None
    try:
        d = dt.datetime.fromtimestamp(iso_or_ts, dt.timezone.utc) if isinstance(iso_or_ts, (int, float)) else dt.datetime.fromisoformat(str(iso_or_ts).replace("Z", "+00:00"))
    except Exception: return None
    d = d.astimezone(dt.timezone(dt.timedelta(hours=8)))
    return d.strftime("%Y-%m-%d %H:%M") + ("（北京时间）" if lang == "zh" else " (Beijing time, UTC+8)")
def iso(s):
    try: return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception: return None

# ---------------- 文案 ----------------
T = {
 "zh": dict(html="zh-CN", og="zh_CN", name="Wakeloom 织迹", tag="钱包分析 · 模拟盘",
   nav=[("leaderboard/","排行榜"),("how-it-works/","选人方法"),("copy-trading/","模拟盘跟单"),("faq/","常见问题")],
   cta="进入应用", cta2="看排行榜", other="English", home="首页", nd="无数据",
   indep="Wakeloom 是独立工具，用于 Polymarket，与 Polymarket 无隶属或合作关系。所有内容仅供研究，不构成投资建议。",
   foot=[("risk/","风险提示"),("privacy/","隐私"),("terms/","条款"),("about/","关于")]),
 "en": dict(html="en", og="en_US", name="Wakeloom", tag="Wallet analytics · Paper trading",
   nav=[("leaderboard/","Leaderboard"),("how-it-works/","How it works"),("copy-trading/","Paper copy trading"),("faq/","FAQ")],
   cta="Open the app", cta2="See the leaderboard", other="中文", home="Home", nd="No data",
   indep="Wakeloom is an independent tool for Polymarket. It is not affiliated with or endorsed by Polymarket. Nothing here is investment advice.",
   foot=[("risk/","Risk notice"),("privacy/","Privacy"),("terms/","Terms"),("about/","About")]),
}

ORG = {"@type": "Organization", "@id": SITE + "/#org", "name": "Wakeloom", "alternateName": "Wakeloom 织迹",
       "url": SITE + "/", "logo": SITE + "/icons/favicon-512.png"}
def website(lang):
    return {"@type": "WebSite", "@id": SITE + "/#website", "name": "Wakeloom", "alternateName": "Wakeloom 织迹",
            "url": SITE + "/", "inLanguage": ["zh-CN", "en"], "publisher": {"@id": SITE + "/#org"}}
def crumbs(lang, items):
    li = [{"@type": "ListItem", "position": 1, "name": T[lang]["home"], "item": f"{SITE}/{lang}/"}]
    for i, (n, p) in enumerate(items, 2): li.append({"@type": "ListItem", "position": i, "name": n, "item": f"{SITE}/{lang}/{p}"})
    return {"@type": "BreadcrumbList", "itemListElement": li}
def softapp(lang):
    return {"@type": "SoftwareApplication", "name": "Wakeloom", "alternateName": "Wakeloom 织迹",
            "applicationCategory": "FinanceApplication", "operatingSystem": "Web", "url": f"{SITE}/{lang}/",
            "inLanguage": T[lang]["html"], "publisher": {"@id": SITE + "/#org"},
            "description": DESC[lang]["home"][1]}

DESC = {
 "zh": {
  "home": ("Wakeloom 织迹 – 用于 Polymarket 的钱包分析与模拟盘跟单工具", "从链上历史筛出长期表现稳定的 Polymarket 交易者，看胜率、收益率和回撤，先用模拟盘跟单再决定。"),
  "leaderboard": ("Polymarket 交易者排行榜：长期稳定，而非单次重仓 | Wakeloom 织迹", "按链上近 90 天表现排序，排除单次重仓和刷量地址，定期刷新。"),
  "how": ("我们怎么挑值得跟的 Polymarket 交易者 | Wakeloom 织迹", "Wakeloom 的选人规则与统计口径：近 90 天窗口、已结算市场、回撤、集中度，以及排除单次重仓、刷量和做市地址的方法。"),
  "copy": ("用于 Polymarket 的模拟盘跟单 | Wakeloom 织迹", "按比例跟随目标钱包，设单笔和单市场上限、价格偏离阈值、跟随平仓和全局停止。第一期只有模拟盘，不动真钱。"),
  "faq": ("Polymarket 跟单常见问题 | Wakeloom 织迹", "关于 Polymarket 跟单、排行榜、延迟和滑点、私钥与数据来源的常见问题，每题第一句先给结论。"),
  "risk": ("风险提示 | Wakeloom 织迹", "预测市场交易与跟单的主要风险说明。"),
  "privacy": ("隐私说明 | Wakeloom 织迹", "Wakeloom 收集哪些数据、怎么使用。"),
  "terms": ("使用条款 | Wakeloom 织迹", "使用 Wakeloom 的条款。"),
  "about": ("关于 Wakeloom 织迹", "Wakeloom 是什么、谁在做、为什么做。"),
 },
 "en": {
  "home": ("Wakeloom – Wallet Analytics & Paper Copy Trading for Polymarket", "Find Polymarket traders with steady long-term results, see their win rate, ROI and drawdown, and paper-trade copying them before risking money."),
  "leaderboard": ("Leaderboard of Polymarket Traders: Consistent Traders, Not One-Off Whales | Wakeloom", "Ranked by 90-day on-chain results, excluding single big bets and wash volume. Updated regularly."),
  "how": ("How We Pick Polymarket Traders to Follow | Wakeloom", "Wakeloom's selection rules and stats: a 90-day window, resolved markets, drawdown, concentration, and how we exclude one-off bets, wash volume and market makers."),
  "copy": ("Paper-Trade Copy Trading for Polymarket | Wakeloom", "Mirror a wallet proportionally with per-trade and per-market caps, a price-deviation limit, follow-the-close and a global stop. Phase one is paper trading only."),
  "faq": ("Polymarket Copy Trading FAQ | Wakeloom", "Answers about copy trading on Polymarket, leaderboards, latency and slippage, private keys and data sources. Each answer leads with the conclusion."),
  "risk": ("Risk Notice | Wakeloom", "The main risks of prediction-market trading and copy trading."),
  "privacy": ("Privacy | Wakeloom", "What data Wakeloom collects and how it is used."),
  "terms": ("Terms of Use | Wakeloom", "The terms for using Wakeloom."),
  "about": ("About Wakeloom", "What Wakeloom is and why we build it."),
 }}

FAQ = {
 "zh": [
  ("Polymarket 能跟单吗？怎么跟？", "能，但 Polymarket 本身没有跟单功能，需要第三方工具盯住目标钱包的成交再按比例下单。Wakeloom 第一期只做模拟盘：选定钱包、设好比例和上限，它成交时我们按当时盘口模拟成交，并记录价差。"),
  ("怎么判断一个 Polymarket 交易者是不是长期表现稳定？", "看足够长的窗口和足够多的已结算市场，而不是单笔大赚。我们用近 90 天数据，同时看胜率、收益率、最大回撤和收益是否集中在一个事件上，样本太少或靠一次重仓的地址不进榜。"),
  ("Polymarket 排行榜第一名值得跟吗？", "不一定。按金额排的榜首常常是一次重仓押中，或者成交量里有大量刷量和做市对冲，这类表现很难复制。我们的排行榜先排除这些地址，再按长期表现排序，但上榜也不代表以后还会这样。"),
  ("跟单 Polymarket 会不会因为延迟和滑点亏钱？", "会。我们发现对方成交到自己下单之间有延迟，价格可能已经变了，薄盘口还会吃到更差的价。所以每一笔都记录和对方的成交价差，偏离超过阈值就放弃，先在模拟盘里算清楚扣掉成本后的结果。"),
  ("Wakeloom 会托管我的私钥吗？", "不会。第一期只有模拟盘，不需要也不接收你的私钥；登录用钱包签一段文字，这个签名不能用来转账或下单。"),
  ("胜率和收益率哪个更重要？", "单看哪个都不够，要结合买入价格和回撤一起看。在 90¢ 买入的高胜率可能一次失手就抹掉多次收益，低胜率但买得便宜的人也可能长期为正，所以我们同时展示胜率、收益率、最大回撤和平均买入价。"),
  ("对方平仓了我怎么办？", "跟着平。跟单规则里对方减仓或平仓时，我们按同样比例减仓或平仓；如果你设了全局停止，所有跟随会立刻暂停。"),
  ("数据从哪来？多久更新？", "来自 Polygon 链上成交记录和 Polymarket 的公开接口，官网页面每天重新生成一次。拿不到的数据显示「无数据」，不会用 0 填充；每页都写了数据截至时间（北京时间）。"),
  ("跟单有风险吗？会亏钱吗？", "有风险，也会亏钱。过去的表现不代表以后，对方可能改变风格或判断失误，延迟和手续费也会吃掉一部分结果。所以第一期只开放模拟盘，详见风险提示。"),
  ("Wakeloom 和 Polymarket 是什么关系？", "没有隶属或合作关系。Wakeloom 是用于 Polymarket 的独立分析工具，只读取公开的链上和接口数据。"),
 ],
 "en": [
  ("Can you copy trade on Polymarket, and how?", "Yes, but Polymarket has no built-in copy trading, so a third-party tool has to watch a wallet's fills and place proportional orders. Wakeloom's first phase is paper trading only: pick a wallet, set a ratio and caps, and each time it fills we simulate a fill at the live order book and record the price gap."),
  ("How can I tell whether a Polymarket trader has steady long-term results?", "Look at a long enough window and enough resolved markets, not one big win. We use 90 days of data and check win rate, ROI, max drawdown and whether results come from a single event; wallets with too few markets or one oversized bet are left out."),
  ("Is the #1 trader on a Polymarket leaderboard worth copying?", "Not necessarily. The top spot by dollars is often one large bet that paid off, or volume inflated by wash trades and market-making hedges, which you can't replicate. Our leaderboard removes those wallets first and then ranks by long-term results, but a ranking doesn't predict the future."),
  ("Will latency and slippage make copy trading on Polymarket lose money?", "They can. By the time we see a fill and place our own order the price may have moved, and thin books give worse prices. We log the price gap on every trade, skip trades that deviate past a threshold, and measure net results after costs in paper trading first."),
  ("Does Wakeloom hold my private key?", "No. Phase one is paper trading only, so we never need or accept your private key; you sign in by signing a text message with your wallet, and that signature cannot move funds or place orders."),
  ("Which matters more, win rate or ROI?", "Neither alone; read them with entry price and drawdown. A high win rate bought at 90¢ can be wiped out by one loss, while a lower win rate bought cheaply can still come out ahead, so we show win rate, ROI, max drawdown and average entry price together."),
  ("What happens when the trader I follow closes a position?", "We close too. When the followed wallet reduces or exits, we reduce or exit by the same proportion, and a global stop pauses all copying at once."),
  ("Where does the data come from, and how often is it updated?", "From Polygon on-chain fills and Polymarket's public APIs; the website pages are rebuilt daily. Missing data is shown as \"No data\", never filled with 0, and every page states its data time in Beijing time."),
  ("Is copy trading risky? Can I lose money?", "Yes, it is risky and you can lose money. Past results don't predict future ones, traders change style or make mistakes, and latency and fees eat into results. That's why phase one is paper trading only; see the risk notice."),
  ("How is Wakeloom related to Polymarket?", "It isn't affiliated. Wakeloom is an independent analytics tool for Polymarket that only reads public on-chain and API data."),
 ]}

# ---------------- 页面骨架 ----------------
CSS_V = "1"
def page(lang, path, key, body, ld, title=None, desc=None, alt=True, depth=None):
    t = T[lang]; tt, dd = DESC[lang].get(key, (title, desc))
    if title: tt = title
    if desc: dd = desc
    url = f"{SITE}/{lang}/{path}"
    other = "en" if lang == "zh" else "zh"
    hre = (f'<link rel="alternate" hreflang="zh-CN" href="{SITE}/zh/{path}">'
           f'<link rel="alternate" hreflang="en" href="{SITE}/en/{path}">'
           f'<link rel="alternate" hreflang="x-default" href="{SITE}/">')
    graph = {"@context": "https://schema.org", "@graph": [ORG, website(lang)] + ld}
    nav = "".join(f'<a href="/{lang}/{p}"{" class=on" if path.startswith(p) else ""}>{n}</a>' for p, n in t["nav"])
    foot = "".join(f'<a href="/{lang}/{p}">{n}</a>' for p, n in t["foot"])
    return f'''<!doctype html><html lang="{t["html"]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(tt)}</title><meta name="description" content="{E(dd)}"><link rel="canonical" href="{url}">{hre}
<meta property="og:type" content="website"><meta property="og:site_name" content="Wakeloom"><meta property="og:title" content="{E(tt)}"><meta property="og:description" content="{E(dd)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{SITE}/icons/favicon-512.png"><meta property="og:locale" content="{t["og"]}"><meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0d0d10"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icons/wakeloom.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/site.css?v={CSS_V}">
<script type="application/ld+json">{json.dumps(graph, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")}</script>
</head><body>
<header class="top"><a class="logo" href="/{lang}/"><img src="/icons/wakeloom.svg" width="28" height="28" alt=""><b>{t["name"]}</b></a>
<nav class="nv">{nav}</nav><div class="tr"><a class="lg" href="/{other}/{path}" hreflang="{"en" if other=="en" else "zh-CN"}">{t["other"]}</a><a class="btn pri sm" href="/app/">{t["cta"]}</a></div></header>
<main>{body}</main>
<footer class="ft"><div class="fl"><a class="logo" href="/{lang}/"><img src="/icons/wakeloom.svg" width="22" height="22" alt=""><b>{t["name"]}</b></a><span>{t["tag"]}</span></div><nav>{foot}</nav><p>{E(t["indep"])}</p></footer>
<script src="/site.js" defer></script></body></html>'''

def write(rel, s):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(s)

def stat(label, val, nd, cls=""):
    v = f'<b class="num {cls}">{E(val)}</b>' if val is not None else f'<b class="nd">{nd}</b>'
    return f'<div class="st"><span>{label}</span>{v}</div>'
def tone(x): return "" if x is None else ("up" if x > 0 else "dn" if x < 0 else "")

def spark(curve, lang):
    pts = [(c.get("t"), c.get("equity")) for c in (curve or []) if isinstance(c.get("equity"), (int, float))]
    if len(pts) < 2: return ""
    vs = [v for _, v in pts]; lo, hi = min(vs), max(vs); rng = (hi - lo) or 1
    W, H = 640, 160
    d = " ".join(f"{'M' if i==0 else 'L'}{i*(W/(len(pts)-1)):.1f},{H-8-(v-lo)/rng*(H-16):.1f}" for i, (_, v) in enumerate(pts))
    cap = ("全部历史收益曲线（已实现 + 浮动，美元）" if lang == "zh" else "All-time equity curve (realized + unrealized, USD)")
    rngt = f'{bj(pts[0][0], lang)[:10]} – {bj(pts[-1][0], lang)[:10]}' if bj(pts[0][0], lang) and bj(pts[-1][0], lang) else ""
    return f'''<figure class="card spark"><figcaption>{cap}<span class="mu">{E(rngt)}</span></figcaption><svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="{cap}"><path d="{d}" fill="none" stroke="#FF6A1F" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="sp-y num mu"><span>{E(usd(hi) or "")}</span><span>{E(usd(lo) or "")}</span></div></figure>'''

# ---------------- 各页 ----------------
def home(lang, D):
    zh = lang == "zh"; n = len(D["leaders"])
    top = D["leaders"][:3]
    rows = "".join(lrow(lang, i + 1, l, D) for i, l in enumerate(top))
    asof = bj(D["as_of"], lang)
    hero = (f'''<section class="hero"><div class="hx"><p class="eyebrow">{"用于 Polymarket 的钱包分析 · 模拟盘" if zh else "Wallet analytics & paper trading for Polymarket"}</p>
<h1>{"看清谁在长期稳定地交易，<br>先用模拟盘跟一跟" if zh else "See who trades consistently,<br>then paper-trade copying them"}</h1>
<p class="lead">{"从链上历史里筛掉单次重仓、刷量和做市地址，留下近 90 天表现稳定的交易者。看胜率、收益率和回撤，再用模拟盘记录真实的延迟和滑点。" if zh else "We filter out one-off bets, wash volume and market makers from on-chain history and keep traders with steady 90-day results. Read their win rate, ROI and drawdown, then paper-trade them while logging real latency and slippage."}</p>
<div class="ctas"><a class="btn pri mag" href="/app/">{T[lang]["cta"]} <i>→</i></a><a class="btn" href="/{lang}/leaderboard/">{T[lang]["cta2"]}</a></div>
<p class="mu sm">{"第一期只有模拟盘，不动真钱，不需要私钥。" if zh else "Phase one is paper trading only: no real money, no private key."}</p></div>
<div class="hv card rise"><div class="hd"><b>{"排行榜前 3" if zh else "Top 3 on the leaderboard"}</b>{f'<span class="mu sm">{"截至" if zh else "As of"} {E(asof)}</span>' if asof else ""}</div>
{f'<table class="lt"><thead>{lhead(lang, short=True)}</thead><tbody>{rows}</tbody></table>' if rows else f'<p class="nd pad">{T[lang]["nd"]}</p>'}
<a class="more" href="/{lang}/leaderboard/">{"看全部" if zh else "View all"}{f" {n} " if n else " "}{"位 →" if zh else "traders →"}</a></div></section>''')
    feats = [
     ("01", "排除单次重仓与刷量" if zh else "No one-off whales or wash volume", "收益集中在一个事件、成交量远大于收益、自成交或双边做市的地址不进榜。" if zh else "Wallets whose results hinge on one event, whose volume dwarfs their results, or that self-cross or make markets are excluded.", "how-it-works/"),
     ("02", "每个地址一页数据" if zh else "A data page for every wallet", "近 90 天胜率、收益率、最大回撤、已结算市场数和收益曲线，缺的数据直接写「无数据」。" if zh else "90-day win rate, ROI, max drawdown, resolved markets and equity curve. Missing values say \"No data\".", "leaderboard/"),
     ("03", "模拟盘先算清成本" if zh else "Paper trading counts the costs", "按比例跟随，设上限和偏离阈值，每笔记录和对方的价差与延迟。" if zh else "Proportional mirroring with caps and a deviation limit; every trade logs its price gap and delay.", "copy-trading/"),
    ]
    fh = "".join(f'<a class="feat card" href="/{lang}/{p}"><span class="fi num">{i}</span><h3>{E(a)}</h3><p>{E(b)}</p><i class="ar">↗</i></a>' for i, a, b, p in feats)
    steps = (["选一个地址：在排行榜里看长期数据", "设规则：比例、单笔上限、单市场上限、偏离阈值", "跑模拟盘：记录每笔的价差、延迟和扣费结果", "再决定：结果说得通，才考虑小额实盘"] if zh else
             ["Pick a wallet from the leaderboard's long-term data", "Set rules: ratio, per-trade cap, per-market cap, deviation limit", "Run paper trading: log price gap, delay and net result per trade", "Then decide: consider small live size only if the numbers hold up"])
    sh = "".join(f'<li><span class="num">{i}</span>{E(s)}</li>' for i, s in enumerate(steps, 1))
    body = hero + f'<section class="feats">{fh}</section><section class="card steps"><h2>{"怎么用" if zh else "How to use it"}</h2><ol>{sh}</ol><a class="btn pri" href="/app/">{T[lang]["cta"]} →</a></section>'
    write(f"{lang}/index.html", page(lang, "", "home", body, [softapp(lang), crumbs(lang, []), {"@type": "WebPage", "url": f"{SITE}/{lang}/", "name": DESC[lang]["home"][0], "inLanguage": T[lang]["html"], "isPartOf": {"@id": SITE + "/#website"}}]))

def lhead(lang, short=False):
    zh = lang == "zh"
    c = ["#", "地址" if zh else "Wallet", "胜率" if zh else "Win rate", "收益率" if zh else "ROI"]
    if not short: c += ["最大回撤" if zh else "Max drawdown", "已结算市场" if zh else "Resolved", "已实现" if zh else "Realized"]
    cls = ["num", "", "r", "r", "r hm", "r hm", "r hm"]
    return "<tr>" + "".join(f'<th class="{k}">{x}</th>' for x, k in zip(c, cls)) + "</tr>"
def lrow(lang, i, l, D, short=True):
    m = l.get("metrics") or {}; a = l["address"]; w = D["wallets"].get(a) or {}
    nm = dname(w, a)
    nd = f'<span class="nd">{T[lang]["nd"]}</span>'
    def c(v, cls=""): return f'<td class="r num {cls}">{E(v)}</td>' if v is not None else f'<td class="r">{nd}</td>'
    r = f'<tr><td class="num mu">{i}</td><td><a href="/{lang}/leader/{a}/"><b>{E(nm)}</b></a><div class="mu xs num">{E(short_(a))}</div></td>' + c(pct(m.get("win_rate"), d=0)) + c(pct(m.get("roi"), True), tone(m.get("roi")))
    return r + "</tr>"
def lrow_full(lang, i, l, D):
    m = l.get("metrics") or {}
    nd = f'<span class="nd">{T[lang]["nd"]}</span>'
    def c(v, cls=""): return f'<td class="r num hm {cls}">{E(v)}</td>' if v is not None else f'<td class="r hm">{nd}</td>'
    return lrow(lang, i, l, D)[:-5] + c(pct(m.get("max_drawdown"))) + c(num(m.get("resolved_markets"))) + c(usd(m.get("realized_pnl"), True), tone(m.get("realized_pnl"))) + "</tr>"
short_ = short

def leaderboard(lang, D):
    zh = lang == "zh"; asof = bj(D["as_of"], lang)
    rows = "".join(lrow_full(lang, i + 1, l, D) for i, l in enumerate(D["leaders"]))
    if not D["ok"]:
        tbl = f'<p class="nd pad">{T[lang]["nd"]}</p><p class="mu pad">{"构建时排行榜接口不可用，本页为占位，下次构建会自动补上。" if zh else "The leaderboard API was unavailable at build time; this is a placeholder until the next build."}</p>'
    else:
        tbl = f'<div class="tw"><table class="lt"><thead>{lhead(lang)}</thead><tbody>{rows}</tbody></table></div>'
    intro = ("按链上近 90 天表现排序。进榜前先排除单次重仓、刷量、自成交和做市地址，并且只收录已结算市场不少于 " + str(MIN_RESOLVED) + " 个的地址。排名不代表以后的表现。" if zh else
             f"Ranked by 90-day on-chain results. Before ranking we exclude one-off bets, wash volume, self-crossing and market makers, and we only list wallets with at least {MIN_RESOLVED} resolved markets. A ranking does not predict future results.")
    body = f'''<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / {"排行榜" if zh else "Leaderboard"}</p><h1>{"Polymarket 交易者排行榜" if zh else "Leaderboard of Polymarket traders"}</h1><p class="lead">{E(intro)}</p>
{f'<p class="mu sm">{"数据截至" if zh else "Data as of"} {E(asof)} · {"共" if zh else ""} {len(D["leaders"])} {"位" if zh else "traders"} · <a class="ln" href="/{lang}/how-it-works/">{"选人方法" if zh else "How we pick"} →</a></p>' if asof else ""}</section>
<section class="card">{tbl}</section>'''
    il = {"@type": "ItemList", "name": DESC[lang]["leaderboard"][0], "numberOfItems": len(D["leaders"]),
          "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/{lang}/leader/{l['address']}/", "name": dname(D["wallets"].get(l["address"]), l["address"])} for i, l in enumerate(D["leaders"])]}
    write(f"{lang}/leaderboard/index.html", page(lang, "leaderboard/", "leaderboard", body, [il, crumbs(lang, [("排行榜" if zh else "Leaderboard", "leaderboard/")])]))

def leader(lang, l, rank, D):
    zh = lang == "zh"; a = l["address"]; w = D["wallets"].get(a) or {}
    m = dict(l.get("metrics") or {}); m.update((w.get("metrics") or {}))
    nm = dname(w, a)
    asof_raw = w.get("as_of") or D["as_of"]; asof = bj(asof_raw, lang)
    wr, roi, dd_, rm = pct(m.get("win_rate"), d=1), pct(m.get("roi"), True), pct(m.get("max_drawdown")), num(m.get("resolved_markets"))
    # 描述：缺值整句删
    if zh:
        parts = [f"近90天胜率 {wr}" if wr else None, f"收益率 {roi}" if roi else None, f"最大回撤 {dd_}" if dd_ else None]
        parts = [p for p in parts if p]
        desc = ("、".join(parts) + "。" if parts else "") + (f"已结算市场 {rm} 个。" if rm else "") + "数据来自链上公开记录。"
        title = f"{short(a)} 的 Polymarket 交易数据：胜率、收益率、回撤 | Wakeloom 织迹"
    else:
        parts = [f"90-day win rate {wr}" if wr else None, f"ROI {roi}" if roi else None, f"max drawdown {dd_}" if dd_ else None]
        parts = [p for p in parts if p]
        desc = (", ".join(parts) + ". " if parts else "") + (f"{rm} resolved markets. " if rm else "") + "Data from public on-chain records."
        title = f"{short(a)} Polymarket Trader Stats: Win Rate, ROI, Drawdown | Wakeloom"
    N = T[lang]["nd"]
    L = (lambda z, e: z if zh else e)
    stats = [
      (L("胜率（近90天）", "Win rate (90d)"), wr, "", "win_rate"),
      (L("收益率（近90天）", "ROI (90d)"), roi, tone(m.get("roi")), "roi"),
      (L("最大回撤", "Max drawdown"), dd_, "", "max_drawdown"),
      (L("已结算市场", "Resolved markets"), rm, "", "resolved_markets"),
      (L("已实现盈亏", "Realized P&L"), usd(m.get("realized_pnl"), True), tone(m.get("realized_pnl")), "realized_pnl"),
      (L("近30天盈亏", "P&L (30d)"), usd(m.get("pnl_30d"), True), tone(m.get("pnl_30d")), "pnl_30d"),
      (L("成交额", "Volume"), usd(m.get("volume_usd")), "", "volume_usd"),
      (L("平均买入价", "Avg entry price"), (f"{m['avg_entry_price']*100:.0f}¢" if isinstance(m.get("avg_entry_price"), (int, float)) else None), "", "avg_entry_price"),
      (L("单笔中位金额", "Median trade"), usd(m.get("median_trade_usd")), "", "median_trade_usd"),
      (L("持仓中位时长", "Median hold"), ((f"{m['median_hold_minutes']/1440:.1f} 天" if zh else f"{m['median_hold_minutes']/1440:.1f} days") if isinstance(m.get("median_hold_minutes"), (int, float)) else None), "", "median_hold_minutes"),
    ]
    grid = "".join(stat(lab, v, N, c) for lab, v, c, _ in stats)
    cats = [(CAT.get(c, c) if zh else c) for c in (m.get("categories") or []) if c and c != "unknown"]
    lt = bj(m.get("last_trade_at"), lang)
    facts = []
    if cats: facts.append(L("主要市场类别：", "Main categories: ") + ("、" if zh else ", ").join(cats) + L("。", "."))
    if lt: facts.append(L(f"最近一次成交：{lt}。", f"Last trade: {lt}."))
    if w.get("x_username"): facts.append(L("X 账号：", "X account: ") + "@" + w["x_username"] + L("（自报，未核实）。", " (self-reported, unverified)."))
    fh = "".join(f"<li>{E(f)}</li>" for f in facts)
    body = f'''<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / <a href="/{lang}/leaderboard/">{L("排行榜", "Leaderboard")}</a> / {E(short(a))}</p>
<h1>{E(nm)} <span class="mu rk num">#{rank}</span></h1><p class="addr num" title="{a}">{a}</p><p class="lead">{E(desc)}</p>
{f'<p class="mu sm">{L("数据截至", "Data as of")} {E(asof)} · {L("统计窗口：近 90 天", "Window: last 90 days")}</p>' if asof else ""}</section>
<section class="card grid">{grid}</section>{spark(w.get("equity_curve"), lang)}
{f'<section class="card"><ul class="facts">{fh}</ul></section>' if fh else ""}
<section class="card cta-row"><div><b>{L("想看他每个市场的买卖点、近 20 笔输赢？", "Want per-market buy/sell points and the last 20 trades?")}</b><p class="mu">{L("在应用里打开这个地址，或用模拟盘跟一跟。上榜不代表以后的表现。", "Open this wallet in the app or paper-trade it. A ranking does not predict future results.")}</p></div><a class="btn pri" href="/app/leader.html?addr={a}">{L("在应用中查看", "Open in the app")} →</a></section>'''
    vm = [{"@type": "PropertyValue", "name": lab, "propertyID": key, **({"value": v} if v is not None else {})} for lab, v, _, key in stats if v is not None]
    url = f"{SITE}/{lang}/leader/{a}/"
    mod = iso(asof_raw)
    person = {"@type": "Person", "name": nm, "identifier": a, "url": url}
    if w.get("x_username"): person["sameAs"] = [f"https://x.com/{w['x_username']}"]
    pp = {"@type": "ProfilePage", "url": url, "name": title, "inLanguage": T[lang]["html"], "mainEntity": person, **({"dateModified": mod} if mod else {})}
    ds = {"@type": "Dataset", "name": L(f"{short(a)} 的近 90 天交易统计", f"90-day trading stats for {short(a)}"), "description": desc, "url": url,
          "creator": {"@id": SITE + "/#org"}, "isAccessibleForFree": True, "temporalCoverage": "P90D", "variableMeasured": vm,
          "license": f"{SITE}/{lang}/terms/", **({"dateModified": mod} if mod else {})}
    write(f"{lang}/leader/{a}/index.html", page(lang, f"leader/{a}/", "x", body, [pp, ds, crumbs(lang, [(L("排行榜", "Leaderboard"), "leaderboard/"), (short(a), f"leader/{a}/")])], title=title, desc=desc))

def article(lang, path, key, h1, secs, crumb):
    tt, dd = DESC[lang][key]
    inner = "".join(f'<section class="card prose"><h2>{E(h)}</h2>{"".join(f"<p>{E(p)}</p>" for p in ps)}</section>' for h, ps in secs)
    body = f'<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / {E(crumb)}</p><h1>{E(h1)}</h1><p class="lead">{E(dd)}</p></section>{inner}'
    ld = [{"@type": "Article", "headline": h1, "description": dd, "inLanguage": T[lang]["html"], "url": f"{SITE}/{lang}/{path}",
           "author": {"@id": SITE + "/#org"}, "publisher": {"@id": SITE + "/#org"}, "datePublished": "2026-10-21", "dateModified": "2026-10-21"},
          crumbs(lang, [(crumb, path)])]
    if key == "copy": ld.insert(0, softapp(lang))
    write(f"{lang}/{path}index.html", page(lang, path, key, body, ld))

def content(lang):
    zh = lang == "zh"; L = (lambda z, e: z if zh else e)
    article(lang, "how-it-works/", "how", L("我们怎么挑值得跟的 Polymarket 交易者", "How we pick Polymarket traders to follow"), [
      (L("统计口径", "What we measure"), [L("统计窗口是近 90 天，只算已经结算的市场。每个地址展示胜率、收益率（已实现加浮动，除以投入）、最大回撤、已结算市场数、平均买入价、单笔中位金额和持仓中位时长。", "The window is the last 90 days and only resolved markets count. For each wallet we show win rate, ROI (realized plus unrealized over capital invested), max drawdown, resolved markets, average entry price, median trade size and median holding time."),
        L(f"已结算市场少于 {MIN_RESOLVED} 个的地址样本太小，不生成详情页。", f"Wallets with fewer than {MIN_RESOLVED} resolved markets are too small a sample and get no detail page.")]),
      (L("先排除，再排序", "Exclude first, then rank"), [L("单次重仓：收益大部分来自同一个事件的地址会被排除，这种结果靠运气的成分太大。", "One-off bets: wallets whose results mostly come from a single event are excluded; too much of that is luck."),
        L("刷量与自成交：成交量远大于收益、或者出现自己和自己成交的地址会被排除。", "Wash volume and self-crossing: wallets whose volume dwarfs their results, or that trade against themselves, are excluded."),
        L("做市：双边挂单比例高的地址赚的是价差，跟着它的方向下单复制不了，也会被排除。", "Market makers: wallets that quote both sides earn the spread, which copying their direction can't replicate, so they are excluded."),
        L("通过筛选的地址再按长期表现综合排序。排序用的综合分是内部指标，不对外公布。", "Wallets that pass are ranked by long-term results. The composite used for ranking is internal and not published.")]),
      (L("数据来源与更新", "Sources and updates"), [L("成交来自 Polygon 链上记录和 Polymarket 公开接口。官网页面每天重新生成，每页写明数据截至时间（北京时间）。拿不到的数值显示「无数据」，不用 0 填充。", "Fills come from Polygon on-chain records and Polymarket's public APIs. Website pages are rebuilt daily and show their data time in Beijing time. Values we can't get show \"No data\" and are never filled with 0.")]),
      (L("限制", "Limitations"), [L("过去 90 天的表现不代表以后。筛选规则能去掉明显的噪音，但去不掉所有运气，也看不到地址背后的人是否改变了策略。", "Past 90-day results don't predict the future. The filters remove obvious noise but not all luck, and they can't see whether the person behind a wallet has changed strategy.")]),
    ], L("选人方法", "How it works"))
    article(lang, "copy-trading/", "copy", L("用于 Polymarket 的模拟盘跟单", "Paper-trade copy trading for Polymarket"), [
      (L("适用场景", "Who it's for"), [L("想研究某个 Polymarket 地址值不值得跟，又不想直接拿真钱试的人。", "People who want to test whether a Polymarket wallet is worth following without putting real money in first.")]),
      (L("规则", "Rules you set"), [L("按比例：对方下多少，我们按你设的比例下。", "Ratio: we size each order as a proportion of theirs."),
        L("上限：单笔上限和单个市场上限，超过就截断。", "Caps: a per-trade cap and a per-market cap; anything above is cut."),
        L("偏离阈值：我们的价格和对方成交价差得太多就放弃这一笔。", "Deviation limit: if our price is too far from their fill, we skip the trade."),
        L("跟随平仓：对方减仓或平仓，我们按比例跟着做。", "Follow the close: when they reduce or exit, we do the same proportionally."),
        L("全局停止：一键暂停所有跟随。", "Global stop: pause all copying at once.")]),
      (L("流程", "How it runs"), [L("发现对方成交后，按当时的盘口模拟成交，记录我们和对方的价差、延迟和手续费。跑 1–2 周后看扣掉成本后的结果，再决定要不要考虑小额实盘。", "When we see their fill, we simulate ours against the live order book and log the price gap, delay and fees. After one to two weeks we look at the net result after costs before considering any small live size.")]),
      (L("限制", "Limitations"), [L("第一期只有模拟盘，不下真实订单。模拟成交按盘口估算，实盘的成交价可能更差。", "Phase one is paper trading only; no real orders are placed. Simulated fills are estimated from the book and live fills may be worse.")]),
    ], L("模拟盘跟单", "Paper copy trading"))
    simple = {
     "risk": (L("风险提示", "Risk notice"), [L("预测市场交易可能损失全部本金。跟单不能消除风险：过去的表现不代表以后，延迟、滑点和手续费会让你的结果比被跟随的地址更差。", "Prediction-market trading can lose all of your stake. Copying doesn't remove risk: past results don't predict future ones, and latency, slippage and fees can make your results worse than the wallet you follow."),
        L("Wakeloom 第一期只提供模拟盘，展示的跟单结果都是模拟结果，不是真实成交。请遵守你所在地区关于预测市场的法律。", "Wakeloom's phase one offers paper trading only; any copy results shown are simulated, not real fills. Follow the laws on prediction markets where you live."),
        L("本站内容仅供研究，不构成投资建议。", "Nothing on this site is investment advice.")]),
     "privacy": (L("隐私说明", "Privacy"), [L("官网页面只展示公开的链上地址数据。使用应用时，我们保存你的钱包地址、登录会话和你设置的模拟盘规则，用来提供服务。", "Website pages show only public on-chain wallet data. When you use the app we store your wallet address, sign-in session and the paper-trading rules you set, to provide the service."),
        L("我们不收集也不保存你的私钥。不出售个人数据。如需删除数据，请联系我们。", "We never collect or store your private key, and we don't sell personal data. Contact us to delete your data.")]),
     "terms": (L("使用条款", "Terms of use"), [L("Wakeloom 按现状提供，数据可能延迟、缺失或有误。你对自己的交易决定负责。", "Wakeloom is provided as is; data may be delayed, missing or wrong. You are responsible for your own trading decisions."),
        L("Wakeloom 是独立工具，与 Polymarket 无隶属或合作关系。页面上的地址统计来自公开数据，可在注明来源的前提下引用。", "Wakeloom is independent and not affiliated with Polymarket. Wallet stats come from public data and may be cited with attribution.")]),
     "about": (L("关于 Wakeloom 织迹", "About Wakeloom"), [L("Wakeloom 织迹是一个用于 Polymarket 的钱包分析和模拟盘工具。名字来自船行留下的尾迹：交易者在链上留下的痕迹，被我们织成可以读懂的数据。", "Wakeloom is a wallet analytics and paper-trading tool for Polymarket. The name comes from a ship's wake: the traces traders leave on-chain, woven into data you can read."),
        L("第一期做钱包分析和模拟盘跟单，以后会加入更多策略类型。", "Phase one covers wallet analytics and paper copy trading; more strategy types will follow.")]),
    }
    for k, (h, ps) in simple.items():
        body = f'<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / {E(h)}</p><h1>{E(h)}</h1></section><section class="card prose">{"".join(f"<p>{E(p)}</p>" for p in ps)}</section>'
        write(f"{lang}/{k}/index.html", page(lang, f"{k}/", k, body, [crumbs(lang, [(h, f"{k}/")])]))
    # FAQ
    qs = FAQ[lang]
    items = "".join(f'<details class="card qa"{" open" if i == 0 else ""}><summary><h2>{E(q)}</h2><i>+</i></summary><p>{E(a)}</p></details>' for i, (q, a) in enumerate(qs))
    body = f'<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / {L("常见问题", "FAQ")}</p><h1>{L("Polymarket 跟单常见问题", "Polymarket copy trading FAQ")}</h1></section><section class="faq">{items}</section>'
    fp = {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qs]}
    write(f"{lang}/faq/index.html", page(lang, "faq/", "faq", body, [fp, crumbs(lang, [(L("常见问题", "FAQ"), "faq/")])]))

def root(D):
    graph = {"@context": "https://schema.org", "@graph": [ORG, website("zh")]}
    s = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wakeloom 织迹 – 用于 Polymarket 的钱包分析与模拟盘 | Wallet analytics for Polymarket</title>
<meta name="description" content="从链上历史筛出长期表现稳定的 Polymarket 交易者，先用模拟盘跟单再决定。Find Polymarket traders with steady long-term results and paper-trade them first.">
<link rel="canonical" href="{SITE}/"><link rel="alternate" hreflang="zh-CN" href="{SITE}/zh/"><link rel="alternate" hreflang="en" href="{SITE}/en/"><link rel="alternate" hreflang="x-default" href="{SITE}/">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icons/wakeloom.svg" type="image/svg+xml"><link rel="stylesheet" href="/site.css?v={CSS_V}"><meta name="theme-color" content="#0d0d10">
<script type="application/ld+json">{json.dumps(graph, ensure_ascii=False, separators=(",", ":"))}</script>
<script>try{{var s=localStorage.getItem("wl_lang");var l=s||((navigator.language||"").toLowerCase().indexOf("zh")===0?"zh":"en");location.replace("/"+l+"/")}}catch(e){{}}</script></head>
<body class="pick"><main class="pk"><img src="/icons/wakeloom.svg" width="72" height="72" alt="Wakeloom 织迹"><h1>Wakeloom 织迹</h1><p class="mu">用于 Polymarket 的钱包分析 · 模拟盘<br>Wallet analytics &amp; paper trading for Polymarket</p><div class="ctas"><a class="btn pri" href="/zh/" hreflang="zh-CN">中文</a><a class="btn" href="/en/" hreflang="en">English</a></div></main></body></html>'''
    write("index.html", s)

def sitemap(D):
    lm_data = iso(D["as_of"]) if D["as_of"] else None
    static_lm = "2026-10-21"
    urls = [("", lm_data or static_lm), ("leaderboard/", lm_data or static_lm)]
    for k in ["how-it-works/", "copy-trading/", "faq/", "risk/", "privacy/", "terms/", "about/"]: urls.append((k, static_lm))
    for l in D["leaders"]:
        w = D["wallets"].get(l["address"]) or {}
        urls.append((f"leader/{l['address']}/", iso(w.get("as_of") or D["as_of"]) or static_lm))
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
           f'<url><loc>{SITE}/</loc><lastmod>{static_lm}</lastmod><xhtml:link rel="alternate" hreflang="zh-CN" href="{SITE}/zh/"/><xhtml:link rel="alternate" hreflang="en" href="{SITE}/en/"/><xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/"/></url>']
    for p, lm in urls:
        alt = f'<xhtml:link rel="alternate" hreflang="zh-CN" href="{SITE}/zh/{p}"/><xhtml:link rel="alternate" hreflang="en" href="{SITE}/en/{p}"/><xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/"/>'
        for lang in ("zh", "en"): out.append(f"<url><loc>{SITE}/{lang}/{p}</loc><lastmod>{lm}</lastmod>{alt}</url>")
    out.append("</urlset>")
    write("sitemap.xml", "\n".join(out) + "\n")
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: {SITE}/sitemap.xml\n")

def main():
    D = load()
    print("data ok" if D["ok"] else "data FAILED: " + str(D["err"]), "| as_of", D["as_of"], "| leaders", len(D["leaders"]), "| wallets ok", sum(1 for v in D["wallets"].values() if v))
    for lang in ("zh", "en"):
        shutil.rmtree(os.path.join(ROOT, lang, "leader"), ignore_errors=True)
        home(lang, D); leaderboard(lang, D); content(lang)
        for i, l in enumerate(D["leaders"]): leader(lang, l, i + 1, D)
    root(D); sitemap(D)
    json.dump({"built_at": BUILT.strftime("%Y-%m-%dT%H:%M:%SZ"), "data_as_of": D["as_of"], "source": API + (D["source"] or ""), "leaders": len(D["leaders"]), "min_resolved": MIN_RESOLVED, "error": D["err"]},
              open(os.path.join(ROOT, "build-info.json"), "w"), indent=1)

if __name__ == "__main__": main()
