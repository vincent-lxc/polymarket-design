#!/usr/bin/env python3
"""Wakeloom 织迹 官网静态生成器。
用法：python3 tools/build_site.py   （在仓库根目录运行，输出写到 zh/ en/ 及根目录的 index.html、sitemap.xml、robots.txt、llms.txt）
     python3 tools/build_site.py --refresh-snapshot
         只刷新爬虫看到的数据快照：排行榜页、首页前 3 的表格（含综合评分列）、排行榜 ItemList，以及 zh/en/leader/<地址>/ 静态快照里的收益曲线；
         其余手改过的 HTML 原样保留。全量重建会把多次手改（等候名单开关、App 链接、壳页文案等）冲掉，不要用全量重建刷数据。
数据：构建时读公开接口生成 SEO 快照（排行榜 + 前 50 详情 + JSON-LD）；页面打开后由 site-live.js 再请求接口刷新数字。其余 leader 走 _shell + _redirects。
"""
import json, os, re, sys, html, shutil, time, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.wakeloom.com"
# 根路径分享图。不能用 favicon；尺寸 1200×630，由 tools/render_og_home.py 生成。
OG_IMAGE = SITE + "/assets/og-home.png"
API = os.environ.get("WAKELOOM_API", "https://api.wakeloom.com").rstrip("/")
MIN_RESOLVED = 20          # 详情页只收录已结算市场数 ≥ N 的地址
BUILT = dt.datetime.now(dt.timezone.utc)
E = html.escape

# 与 site-live.js、App 公开榜同一口径：综合评分榜，本地再按综合评分降序排一次（没有分的排最后，同分保持接口顺序）。
LB_PATH = "/v1/public/leaderboard?window=90d&metric=smart_score&limit=50"
def fnum(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) and x == x and x not in (float("inf"), float("-inf")) else None
def sort_by_smart_score(leaders):
    idx = list(enumerate(leaders or []))
    return [l for _, l in sorted(idx, key=lambda t: (fnum(t[1].get("smart_score")) is None, -(fnum(t[1].get("smart_score")) or 0), t[0]))]

def get(path):
    req = urllib.request.Request(API + path, headers={"Accept": "application/json", "User-Agent": "wakeloom-site-build"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

# ---------------- 数据 ----------------
def load():
    data = {"ok": False, "as_of": None, "leaders": [], "wallets": {}, "pages": [], "details": {}, "source": None, "err": None, "sitemap_ok": False}
    try:
        lb = get(LB_PATH)
        b = lb.get("leaderboard") or {}
        for l in b.get("leaders") or []: l["address"] = l["address"].lower()
        data.update(ok=True, as_of=b.get("as_of"), leaders=sort_by_smart_score(b.get("leaders") or []), source=LB_PATH, window=b.get("window"))
    except Exception as e:
        data["err"] = "leaderboard: " + str(e)
    # 详情页清单：/v1/public/sitemap（服务端已按成交笔数过滤），分页拉全
    addrs, off = [], 0
    try:
        while off is not None:
            sm = get(f"/v1/public/sitemap?offset={off}&limit=1000").get("sitemap") or {}
            ls = sm.get("leaders") or []
            addrs += [(x["address"].lower(), x.get("updated_at")) for x in ls if x.get("address")]
            if not ls: break
            off = sm.get("next_offset")
        data["sitemap_ok"] = True
    except Exception as e:
        data["err"] = (data["err"] or "") + " sitemap: " + str(e)
        addrs = [(l["address"].lower(), data["as_of"]) for l in data["leaders"]]   # 退回：只用排行榜地址
    seen = set(); data["pages"] = [(a, u) for a, u in addrs if not (a in seen or seen.add(a))]
    # 方案 2：构建只拉排行榜前 N 的详情作 SEO 快照；其余地址由客户端读接口。
    # sitemap 仍收录全部公开地址，部署体积不再提交数千 HTML。
    SNAP = int(os.environ.get("WAKELOOM_SEO_LEADERS", "50"))
    snap_addrs = [l["address"].lower() for l in data["leaders"][:SNAP]]
    # 详情页清单仍用 sitemap（给 sitemap.xml），但静态 HTML 只生成 snap
    def det(a):
        try: return a, (get("/v1/public/leaders/" + a) or {}).get("leader")
        except Exception: return a, None
    def wal(a):
        try: return a, get("/v1/public/wallets/" + a)     # 只为收益曲线
        except Exception: return a, None
    with ThreadPoolExecutor(16) as ex:
        for a, j in ex.map(det, snap_addrs): data["details"][a] = j
        for a, j in ex.map(wal, snap_addrs): data["wallets"][a] = j
    data["snap_pages"] = [(a, data["as_of"]) for a in snap_addrs if data["details"].get(a)]
    # 榜单保留接口原样（客户端会再刷）；构建时不过滤掉无详情的
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
CAPPED_COUNT = "20,000+"  # *_capped 为 true 时一律固定写这个，不用原始数（Blake 2026-10-28），与 workers/leader-page.mjs basisCount 一致
def basis_count(x, capped):
    if capped is True: return CAPPED_COUNT
    v = fnum(x)
    return None if v is None else f"{int(v):,}" if float(v).is_integer() else f"{v:,}"
def short(a): return a[:6] + "…" + a[-4:]
def dname(w, a):
    n = (w or {}).get("user_name") or ""
    # Polymarket 默认昵称是「地址-时间戳」或随机串，不当名字显示
    if not n or n.lower().startswith("0x") or re.search(r"-\d{10,}$", n) or len(n) > 24 or n.lower() in a.lower(): return short(a)
    return "@" + n
CAT = {"politics": "政治", "geopolitics": "地缘政治", "tech": "科技", "sports": "体育", "crypto": "加密货币", "economy": "经济", "finance": "金融", "business": "商业", "culture": "文化", "pop-culture": "文化娱乐", "weather": "天气", "science": "科学", "world": "国际", "elections": "选举", "esports": "电竞", "mentions": "言论"}
def bj(iso_or_ts, lang):
    """Parse API times as UTC; SEO snapshot shows UTC (no city name). Browser site-live.js rewrites to local TZ."""
    if iso_or_ts is None: return None
    try:
        if isinstance(iso_or_ts, (int, float)):
            d = dt.datetime.fromtimestamp(iso_or_ts, dt.timezone.utc)
        else:
            s = str(iso_or_ts).strip().replace(" ", "T")
            if not (s.endswith("Z") or re.search(r"[+-]\d{2}:?\d{2}$", s)):
                if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
                    s = s + "T00:00:00+00:00"
                elif re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", s):
                    s = s + "+00:00"
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=dt.timezone.utc)
    except Exception:
        return None
    d = d.astimezone(dt.timezone.utc)
    return d.strftime("%Y-%m-%d %H:%M") + " UTC"
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

ORG = {"@type": "Organization", "@id": SITE + "/#org", "name": "Wakeloom", "alternateName": ["织迹", "Wakeloom 织迹"],
       "description": 'Wakeloom (织迹) is a wallet analytics and paper copy-trading tool for Polymarket. Not yet launched.',
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
  "leaderboard": ("Polymarket 交易者排行榜：按综合评分排序 | Wakeloom 织迹", "按综合评分排序。胜率和收益率只作展示。"),
  "how": ("我们怎么给 Polymarket 交易者打分 | Wakeloom 织迹", "Wakeloom 的选人规则与统计口径：近 90 天窗口、已结算市场、回撤、集中度，按综合评分排序。"),
  "copy": ("用于 Polymarket 的模拟盘跟单 | Wakeloom 织迹", "按比例跟随目标钱包，设单笔和单市场上限、价格偏离阈值、跟随平仓；全局停止即将推出。目前只有模拟盘，不动真钱。"),
  "faq": ("Polymarket 跟单常见问题 | Wakeloom 织迹", "关于 Polymarket 跟单、排行榜、延迟和滑点、私钥与数据来源的常见问题，每题第一句先给结论。"),
  "risk": ("风险提示 | Wakeloom 织迹", "预测市场交易与跟单的主要风险说明。"),
  "privacy": ("隐私说明 | Wakeloom 织迹", "Wakeloom 收集哪些数据、怎么使用。"),
  "terms": ("使用条款 | Wakeloom 织迹", "使用 Wakeloom 的条款。"),
  "about": ("关于 Wakeloom 织迹", "Wakeloom 是什么、谁在做、为什么做。"),
 },
 "en": {
  "home": ("Wakeloom – Wallet Analytics & Paper Copy Trading for Polymarket", "Find Polymarket traders with steady long-term results, see their win rate, ROI and drawdown, and paper-trade copying them before risking money."),
  "leaderboard": ("Polymarket Trader Leaderboard: Ranked by Composite Score | Wakeloom", "Ranked by composite score. Win rate and ROI are display columns."),
  "how": ("How We Score Polymarket Traders | Wakeloom", "Wakeloom's selection rules and stats: a 90-day window, resolved markets, drawdown and concentration, with wallets ranked by composite score."),
  "copy": ("Paper-Trade Copy Trading for Polymarket | Wakeloom", "Mirror a wallet proportionally with per-trade and per-market caps, a price-deviation limit, and follow-the-close; a global stop is coming soon. Currently paper trading only."),
  "faq": ("Polymarket Copy Trading FAQ | Wakeloom", "Answers about copy trading on Polymarket, leaderboards, latency and slippage, private keys and data sources. Each answer leads with the conclusion."),
  "risk": ("Risk Notice | Wakeloom", "The main risks of prediction-market trading and copy trading."),
  "privacy": ("Privacy | Wakeloom", "What data Wakeloom collects and how it is used."),
  "terms": ("Terms of Use | Wakeloom", "The terms for using Wakeloom."),
  "about": ("About Wakeloom", "What Wakeloom is and why we build it."),
 }}

FAQ = {
 "zh": [
  ("Polymarket 能跟单吗？怎么跟？", "能，但 Polymarket 本身没有跟单功能，需要第三方工具盯住目标钱包的成交再按比例下单。Wakeloom 目前只做模拟盘：选定钱包、设好比例和上限，它成交时我们按当时盘口模拟成交，并记录价差。"),
  ("怎么判断一个 Polymarket 交易者是不是长期表现稳定？", "看足够长的窗口和足够多的已结算市场，而不是单笔大赚。我们用近 90 天数据，同时看胜率、收益率、最大回撤和收益是否集中在一个事件上。被识别为疑似做市的地址不参与排名。部分地址的数据来自第三方，页面会标出来源。"),
  ("Polymarket 排行榜第一名可以直接参考吗？", "不一定。按金额排的榜首常常是一次重仓押中，或者成交量里有大量刷量和做市对冲，这类表现很难复制。Wakeloom 用收益集中度、刷量等门槛给地址打分，没通过的地址没有综合评分；被识别为疑似做市的地址不参与排名。部分地址的数据来自第三方，页面会标出来源，请自己再看一下。上榜也不代表以后还会这样。"),
  ("跟单 Polymarket 会不会因为延迟和滑点亏钱？", "会。我们发现对方成交到自己下单之间有延迟，价格可能已经变了，薄盘口还会吃到更差的价。所以每一笔都记录和对方的成交价差，偏离超过阈值就放弃，先在模拟盘里算清楚扣掉成本后的结果。"),
  ("Wakeloom 会托管我的私钥吗？", "目前只有模拟盘。Wakeloom 不接收、不托管用户私钥。钱包登录只签署登录接口返回的那段文案（例如 Sign in to Wakeloom.），该签名不能用来转账，也不能授权交易。"),
  ("胜率和收益率哪个更重要？", "单看哪个都不够，要结合买入价格和回撤一起看。在 90¢ 买入的高胜率可能一次失手就抹掉多次收益，低胜率但买得便宜的人也可能长期为正，所以我们同时展示胜率、收益率、最大回撤和平均买入价。"),
  ("对方平仓了我怎么办？", "跟着平。跟单规则里对方减仓或平仓时，我们按同样比例减仓或平仓。一键暂停所有跟随的全局停止即将推出。"),
  ("数据从哪来？多久更新？", "来自 Polygon 链上成交记录和 Polymarket 的公开接口。排行榜和详情页打开时会向公开接口拉取最新数字；构建进仓库的是 SEO 用的快照。拿不到的数据显示「无数据」，不会用 0 填充；页面会写明数据截至时间（按你浏览器的本地时区显示）。"),
  ("跟单有风险吗？会亏钱吗？", "有风险，也会亏钱。过去的表现不代表以后，对方可能改变风格或判断失误，延迟和手续费也会吃掉一部分结果。所以目前只开放模拟盘，详见风险提示。"),
  ("Wakeloom 和 Polymarket 是什么关系？", "没有隶属或合作关系。Wakeloom 是用于 Polymarket 的独立分析工具，只读取公开的链上和接口数据。"),
 ],
 "en": [
  ("Can you copy trade on Polymarket, and how?", "Yes, but Polymarket has no built-in copy trading, so a third-party tool has to watch a wallet's fills and place proportional orders. Wakeloom's first phase is paper trading only: pick a wallet, set a ratio and caps, and each time it fills we simulate a fill at the live order book and record the price gap."),
  ("How can I tell whether a Polymarket trader has steady long-term results?", "Look at a long enough window and enough resolved markets, not one big win. We use 90 days of data and check win rate, ROI, max drawdown and whether results come from a single event. Addresses flagged as likely market makers are not ranked. Some addresses use third-party data, and the page shows the source."),
  ("Can you rely on the #1 trader on a Polymarket leaderboard?", "Not necessarily. The top spot by dollars is often one large bet that paid off, or volume inflated by wash trades and market-making hedges, which you can't replicate. Wakeloom scores addresses using checks such as single-event concentration and wash trading; addresses that fail get no score, and likely market makers are not ranked. Some addresses use third-party data, and the page shows the source, so please review them yourself. A ranking doesn't predict the future."),
  ("Will latency and slippage make copy trading on Polymarket lose money?", "They can. By the time we see a fill and place our own order the price may have moved, and thin books give worse prices. We log the price gap on every trade, skip trades that deviate past a threshold, and measure net results after costs in paper trading first."),
  ("Does Wakeloom hold my private key?", "Currently paper trading only. Wakeloom never receives or custodied your private key. Wallet login only signs the nonce text returned by the API (e.g. Sign in to Wakeloom.); that signature cannot transfer funds or approve trades."),
  ("Which matters more, win rate or ROI?", "Neither alone; read them with entry price and drawdown. A high win rate bought at 90¢ can be wiped out by one loss, while a lower win rate bought cheaply can still come out ahead, so we show win rate, ROI, max drawdown and average entry price together."),
  ("What happens when the trader I follow closes a position?", "We close too. When the followed wallet reduces or exits, we reduce or exit by the same proportion. A global stop that pauses all copying at once is coming soon."),
  ("Where does the data come from, and how often is it updated?", "From Polygon on-chain fills and Polymarket's public APIs; the website pages are rebuilt daily. Missing data is shown as \"No data\", never filled with 0, and every page states its data time in your local timezone."),
  ("Is copy trading risky? Can I lose money?", "Yes, it is risky and you can lose money. Past results don't predict future ones, traders change style or make mistakes, and latency and fees eat into results. That's why it's currently paper trading only; see the risk notice."),
  ("How is Wakeloom related to Polymarket?", "It isn't affiliated. Wakeloom is an independent analytics tool for Polymarket that only reads public on-chain and API data."),
 ]}

# 「上线通知我」登记接口。暂定，以后端实际给出的为准；构建时可用 WAKELOOM_WAITLIST_API 覆盖。
WAITLIST_API = os.environ.get("WAKELOOM_WAITLIST_API", API + "/v1/waitlist")
# 开关：2026-10-22 探测 POST /v1/waitlist 返回 401「需要登录」，还没按约定（免登录）上线，默认关。
# 关时表单照常输出但带 hidden，site-waitlist.js 只在 WAKELOOM_WAITLIST=on（写到 <html data-waitlist>）时显示。
WAITLIST_ON = os.environ.get("WAKELOOM_WAITLIST", "off").lower() in ("1", "on", "true")
def wl_form(where, lang, source=None):
    zh = lang == "zh"
    src = source or ("banner" if where == "bar" else "footer")
    return (f'<form class="wl-form wl-{where}" data-endpoint="{E(WAITLIST_API)}" data-lang="{lang}" data-source="{src}" novalidate>'
            f'<label class="wl-lab" for="wl-{where}">{"上线通知我" if zh else "Notify me at launch"}<span class="wl-sub"> / {"Notify me at launch" if zh else "上线通知我"}</span></label>'
            f'<div class="wl-hp" aria-hidden="true"><label for="wl-{where}-web">Website</label><input id="wl-{where}-web" name="website" type="text" tabindex="-1" autocomplete="off" value=""></div>'
            f'<div class="wl-row"><input id="wl-{where}" name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254" placeholder="you@example.com">'
            f'<button class="btn pri" type="submit">{"通知我" if zh else "Notify me"}</button></div>'
            f'<p class="wl-msg" role="status" aria-live="polite"></p>'
            f'<p class="wl-pv">邮箱仅用于上线通知，可随时退订 · Email used only for launch notice; unsubscribe anytime</p></form>')
def banner(lang="zh"):
    return ('<div class="pv" role="note"><span class="pv-dot" aria-hidden="true"></span>'
            '<span lang="zh-CN">公测前预览：目前仅支持模拟盘跟单分析，尚未正式上线</span>'
            '<span class="pv-sep" aria-hidden="true">/</span>'
            '<span lang="en">Preview: simulated copy-trading only, not yet launched</span>'
            f'<button type="button" class="pv-cta wl-gate" hidden aria-expanded="false" aria-controls="pv-wl">{"上线通知我" if lang == "zh" else "Notify me" if lang == "en" else "上线通知我 / Notify me"} <i aria-hidden="true">↓</i></button>'
            f'<div class="pv-wl" id="pv-wl" hidden>{wl_form("bar", lang)}</div></div>'
            '<script src="/site-waitlist.js?v=1" defer></script>')

# JSON-LD 不输出价格、报价和评分：公测前没有售卖，也没有真实评价。
LD_BANNED = {"offers", "price", "priceCurrency", "priceSpecification", "aggregateRating", "review", "reviewRating", "ratingValue", "ratingCount", "reviewCount"}
def ld_clean(x):
    if isinstance(x, dict): return {k: ld_clean(v) for k, v in x.items() if k not in LD_BANNED}
    if isinstance(x, list): return [ld_clean(v) for v in x]
    return x

# ---------------- 页面骨架 ----------------
CSS_V = "2"
def page(lang, path, key, body, ld, title=None, desc=None, alt=True, depth=None):
    t = T[lang]; tt, dd = DESC[lang].get(key, (title, desc))
    if title: tt = title
    if desc: dd = desc
    url = f"{SITE}/{lang}/{path}"
    other = "en" if lang == "zh" else "zh"
    hre = (f'<link rel="alternate" hreflang="zh-CN" href="{SITE}/zh/{path}">'
           f'<link rel="alternate" hreflang="en" href="{SITE}/en/{path}">'
           f'<link rel="alternate" hreflang="x-default" href="{SITE}/">')
    graph = ld_clean({"@context": "https://schema.org", "@graph": [ORG, website(lang)] + ld})
    nav = "".join(f'<a href="/{lang}/{p}"{" class=on" if path.startswith(p) else ""}>{n}</a>' for p, n in t["nav"])
    foot = "".join(f'<a href="/{lang}/{p}">{n}</a>' for p, n in t["foot"])
    return f'''<!doctype html><html lang="{t["html"]}" data-waitlist="{"on" if WAITLIST_ON else "off"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(tt)}</title><meta name="description" content="{E(dd)}"><link rel="canonical" href="{url}">{hre}
<meta property="og:type" content="website"><meta property="og:site_name" content="Wakeloom"><meta property="og:title" content="{E(tt)}"><meta property="og:description" content="{E(dd)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{SITE}/icons/favicon-512.png"><meta property="og:locale" content="{t["og"]}"><meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0d0d10"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icons/wakeloom.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/site.css?v={CSS_V}">{'<link rel="stylesheet" href="/assets/app-run.css?v=1">' if key == 'home' else ''}
<script type="application/ld+json">{json.dumps(graph, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")}</script>
</head><body>
{banner(lang)}
<header class="top"><a class="logo" href="/{lang}/"><img src="/icons/wakeloom.svg" width="28" height="28" alt=""><b>{t["name"]}</b></a>
<nav class="nv">{nav}</nav><div class="tr"><a class="lg" href="/{other}/{path}" hreflang="{"en" if other=="en" else "zh-CN"}">{t["other"]}</a><a class="btn pri sm" href="https://app.wakeloom.com/board">{t["cta"]}</a></div></header>
<main>{body}</main>
<footer class="ft"><div class="fl"><a class="logo" href="/{lang}/"><img src="/icons/wakeloom.svg" width="22" height="22" alt=""><b>{t["name"]}</b></a><span>{t["tag"]}</span></div><nav>{foot}</nav><p>{E(t["indep"])}</p></footer>
<script src="/site.js" defer></script><script src="/site-live.js" defer></script>{'<script src="/assets/app-run.js?v=1" defer></script>' if key == 'home' else ''}</body></html>'''

def write(rel, s):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(s)

def stat(label, val, nd, cls=""):
    v = f'<b class="num {cls}">{E(val)}</b>' if val is not None else f'<b class="nd">{nd}</b>'
    return f'<div class="st"><span>{label}</span>{v}</div>'
def tone(x): return "" if x is None else ("up" if x > 0 else "dn" if x < 0 else "")

def curve_pts(curve):
    """与 site-live.js curvePts 相同：画累计已实现盈亏；没有 realized_pnl 时只在浮动为 0 时退回 equity。"""
    out = []
    for c in curve or []:
        if not isinstance(c, dict): continue
        v = fnum(c.get("realized_pnl"))
        if v is None and c.get("unrealized_pnl") == 0: v = fnum(c.get("equity"))
        if v is not None: out.append((c.get("t"), v))
    return out
def spark(curve, lang):
    pts = curve_pts(curve)
    # 0 个点、1 个点、或全部相等：不画（与 site-live.js curveFlat 一致）
    if len(pts) < 2 or all(v == pts[0][1] for _, v in pts): return ""
    vs = [v for _, v in pts]; lo, hi = min(vs), max(vs); rng = (hi - lo) or 1
    W, H = 640, 160
    d = " ".join(f"{'M' if i==0 else 'L'}{i*(W/(len(pts)-1)):.1f},{H-8-(v-lo)/rng*(H-16):.1f}" for i, (_, v) in enumerate(pts))
    cap = ("累计已实现盈亏（美元）" if lang == "zh" else "Cumulative realized P&L (USD)")
    rngt = f'{bj(pts[0][0], lang)[:10]} – {bj(pts[-1][0], lang)[:10]}' if bj(pts[0][0], lang) and bj(pts[-1][0], lang) else ""
    return f'''<figure class="card spark"><figcaption>{E(cap)}<span class="mu">{E(rngt)}</span></figcaption><svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="{E(cap)}"><path d="{d}" fill="none" stroke="#FF6A1F" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="sp-y num mu"><span>{E(usd(hi) or "")}</span><span>{E(usd(lo) or "")}</span></div></figure>'''

# ---------------- 各页 ----------------
def L2(zh, a, b): return a if zh else b
def home(lang, D):
    from app_run import app_run_html
    zh = lang == "zh"; n = len(D["leaders"])
    top = D["leaders"][:3]
    rows = "".join(lrow(lang, i + 1, l, D) for i, l in enumerate(top))
    asof = bj(D["as_of"], lang)
    hero = (f'''<section class="hero"><div class="hx"><p class="eyebrow">{"用于 Polymarket 的钱包分析 · 模拟盘" if zh else "Wallet analytics & paper trading for Polymarket"}</p>
<h1>{"Polymarket 跟单前，先看清谁靠实力、谁靠运气" if zh else "Before you copy a Polymarket trader, see if it's skill or luck"}</h1>
<p class="lead">{"按综合评分排序，看近 90 天胜率、回撤与收益；先用模拟盘跟单，零资金看真实滑点（公测中）" if zh else "Ranked by composite score. See 90-day win rate, drawdown, and returns — then paper-copy with zero capital to feel real slippage (public beta)."}</p>
<p class="brand-line">{'Wakeloom（织迹）是用于 Polymarket 的钱包分析和模拟盘跟单工具，尚未正式上线。' if zh else 'Wakeloom is a wallet analytics and paper copy-trading tool for Polymarket. It has not launched yet.'}</p>
<div class="ctas"><a class="btn pri mag" href="https://app.wakeloom.com/board">{T[lang]["cta"]} <i>→</i></a><a class="btn" href="/{lang}/leaderboard/">{T[lang]["cta2"]}</a></div>
<p class="mu sm">{"目前只有模拟盘，不动真钱，不需要私钥。" if zh else "Currently paper trading only: no real money, no private key."}</p></div>
<div class="hv card rise" data-live="home-top"><div class="hd"><b>{"排行榜前 3" if zh else "Top 3 on the leaderboard"}</b><span class="live-badge" data-live-badge="home-top"></span>{f'<span class="mu sm" data-live-meta="home-top">{"截至" if zh else "As of"} {E(asof)}</span>' if asof else '<span class="mu sm" data-live-meta="home-top"></span>'}</div>
{f'<table class="lt"><thead>{lhead(lang, short=True)}</thead><tbody>{rows}</tbody></table>' if rows else f'<p class="nd pad">{T[lang]["nd"]}</p>'}
<a class="more" data-live-more="home-top" href="/{lang}/leaderboard/">{"看全部" if zh else "View all"}{f" {n} " if n else " "}{"位 →" if zh else "traders →"}</a></div></section>''')
    feats = [
     ("01", "先筛掉靠运气和刷量的地址" if zh else "Filter out luck and wash trading", "收益集中在一两个事件、或刷量的地址拿不到综合评分；疑似做市的地址不参与排名。目前多数地址的检查还在补。" if zh else "Addresses whose profit comes from one or two events, or from wash trading, get no score; likely market makers are not ranked. Checks for most addresses are still in progress.", "how-it-works/"),
     ("02", "每个地址一页数据" if zh else "A data page for every wallet", "近 90 天胜率、收益率、最大回撤、已结算市场数和收益曲线，缺的数据直接写「无数据」。" if zh else "90-day win rate, ROI, max drawdown, resolved markets and equity curve. Missing values say \"No data\".", "leaderboard/"),
     ("03", "模拟盘先算清成本" if zh else "Paper trading counts the costs", "按比例跟随，设上限和偏离阈值，每笔记录和对方的价差与延迟。" if zh else "Proportional mirroring with caps and a deviation limit; every trade logs its price gap and delay.", "copy-trading/"),
    ]
    fh = "".join(f'<a class="feat card" href="/{lang}/{p}"><span class="fi num">{i}</span><h3>{E(a)}</h3><p>{E(b)}</p><i class="ar">↗</i></a>' for i, a, b, p in feats)
    steps = (["选一个地址：在排行榜里看长期数据", "设规则：比例、单笔上限、单市场上限、偏离阈值", "跑模拟盘：记录每笔的价差、延迟和扣费结果", "再决定：结果说得通再考虑实盘（实盘跟单即将推出）"] if zh else
             ["Pick a wallet from the leaderboard's long-term data", "Set rules: ratio, per-trade cap, per-market cap, deviation limit", "Run paper trading: log price gap, delay and net result per trade", "Then decide: consider live trading only if the numbers hold up (live copy trading is coming soon)"])
    sh = "".join(f'<li><span class="num">{i}</span>{E(s)}</li>' for i, s in enumerate(steps, 1))
    body = hero + f'<section class="feats">{fh}</section>' + app_run_html(lang) + f'<section class="card steps"><h2>{"怎么用" if zh else "How to use it"}</h2><ol>{sh}</ol><a class="btn pri" href="https://app.wakeloom.com/board">{T[lang]["cta"]} →</a></section><section class="card wl-card wl-gate" id="notify" hidden><h2>{"正式上线时通知你" if zh else "Get notified when we launch"}</h2><p class="mu sm">{"实盘跟单等功能即将推出。留下邮箱，上线时发一封通知。" if zh else "Live copy trading and more are coming soon. Leave your email and we'll send one launch notice."}</p>{wl_form("home", lang)}</section>'
    write(f"{lang}/index.html", page(lang, "", "home", body, [softapp(lang), crumbs(lang, []), {"@type": "WebPage", "url": f"{SITE}/{lang}/", "name": DESC[lang]["home"][0], "inLanguage": T[lang]["html"], "isPartOf": {"@id": SITE + "/#website"}}]))

# 排行榜表格：和 site-live.js rowFull / rowShort / fillHead 输出同一套 HTML，爬虫看到的就是浏览器刷新后的样子。
LBT = {
    "zh": {"third": "第三方口径", "checks": "部分检查未完成", "checksNote": "该地址数据来自第三方，尚未完成集中度、做市、刷量检查。",
           "roiNote": "自算地址的收益率 = 已实现盈亏 ÷ 投入，不含浮动。", "ibCol": "已结算（全部历史）", "capNote": "第三方只统计到这个数"},
    "en": {"third": "third-party basis", "checks": "Some checks pending", "checksNote": "This address uses third-party data; concentration, market-making and wash-trading checks are not done yet.",
           "roiNote": "For addresses we compute ourselves, ROI = realized P&L ÷ capital invested, excluding unrealized P&L.", "ibCol": "Resolved (all time)", "capNote": "Third-party data stops counting here"},
}
def lb_flags(l):
    src = l.get("source").strip().lower() if isinstance(l.get("source"), str) else ""
    return {"third": src in ("polymarketscan", "third_party"), "checks": l.get("checks_incomplete") is True, "mm": l.get("suspected_market_maker") is True}
def lb_basis(l):
    ib = l.get("index_basis")
    return ib if isinstance(ib, dict) else None
def lb_score(l):
    """综合评分：与 site-live.js scoreText 一致，有限数值保留 1 位（JS toFixed 同为四舍五入到 1 位）。"""
    v = fnum(l.get("smart_score"))
    return None if v is None else f"{v:.1f}"
def lb_roi_missing(f, m):
    if not f["third"]: return False
    r = fnum(m.get("roi"))
    if r is None: return True
    if r != 0: return False
    rp = fnum(m.get("realized_pnl"))
    return rp is not None and rp != 0
def lb_name(l, w=None):
    """与 site-live.js dname 一致。"""
    a = (l.get("address") or "").lower()
    n = (l.get("user_name") or l.get("name") or (w or {}).get("user_name") or "")
    if not n or n.lower().startswith("0x") or re.search(r"-\d{10,}$", n) or len(n) > 24 or (a and a[2:8] in n.lower()): return short(a)
    return "@" + n
def lb_tag(text, title=None):
    return f'<span class="ck"{f' title="{E(title)}"' if title else ""}>{E(text)}</span>'
def lhead(lang, short=False, basis=False):
    zh = lang == "zh"
    c = [("#", "num"), ("地址" if zh else "Wallet", ""), ("综合评分" if zh else "Score", "r"), ("胜率" if zh else "Win rate", "r"), ("收益率" if zh else "ROI", "r")]
    if not short:
        c += [("最大回撤" if zh else "Max drawdown", "r hm"), (LBT[lang]["ibCol"] if basis else ("已结算" if zh else "Resolved"), "r hm"), ("已实现" if zh else "Realized", "r hm")]
    return "<tr>" + "".join(f'<th class="{k}">{E(x)}</th>' for x, k in c) + "</tr>"
def lrow(lang, i, l, D, short=True):
    m = l.get("metrics") or {}; a = l["address"].lower(); w = (D or {}).get("wallets", {}).get(a) or {}
    X = LBT[lang]; f = lb_flags(l)
    nd = f'<span class="nd">{T[lang]["nd"]}</span>'
    def c(v, cls=""): return f'<td class="r num {cls}">{E(v)}</td>' if v is not None else f'<td class="r">{nd}</td>'
    def tc(v, cls, t):
        if not t: return c(v, cls)
        body = f'<span class="num {cls}">{E(v)}</span>' if v is not None else nd
        return f'<td class="r">{body}{t}</td>'
    mt = []
    if f["checks"]: mt.append(lb_tag(X["checks"], X["checksNote"] if f["third"] else None))
    if f["third"]: mt.append(lb_tag(X["third"]))
    mobile = f'<div class="ck-m">{"".join(mt)}</div>' if mt else ""
    sc = lb_score(l)
    sc_t = lb_tag(X["checks"], X["checksNote"] if f["third"] else None) if f["checks"] else ""
    # 与 site-live.js scoreCell 一致：没有综合评分写「—」（只用在这一列），不写「无数据」或 0
    score = tc(sc, "", sc_t) if sc is not None else f'<td class="r"><span class="num mu" data-nd="score">—</span>{sc_t}</td>'

    roi = None if lb_roi_missing(f, m) else pct(m.get("roi"), True)
    r = (f'<tr><td class="num mu">{i}</td><td><a href="/{lang}/leader/{a}/"><b>{E(lb_name(l, w))}</b></a><div class="mu xs num">{E(short_(a))}</div>{mobile}</td>'
         + score + c(pct(m.get("win_rate"), d=0)) + tc(roi, tone(m.get("roi")), lb_tag(X["third"], None if f["checks"] else X["checksNote"]) if f["third"] else ""))
    return r + "</tr>"
def lrow_full(lang, i, l, D):
    m = l.get("metrics") or {}
    nd = f'<span class="nd">{T[lang]["nd"]}</span>'
    def c(v, cls=""): return f'<td class="r num hm {cls}">{E(v)}</td>' if v is not None else f'<td class="r hm">{nd}</td>'
    ib = lb_basis(l)
    if ib is None:
        settled = c(basis_count(m.get("resolved_markets"), m.get("settled_capped")))
    else:
        capped = ib.get("settled_capped") is True
        v = basis_count(ib.get("settled"), capped)
        settled = c(None) if v is None else f'<td class="r num hm"{f' title="{E(LBT[lang]["capNote"])}"' if capped else ""}>{E(v)}</td>'
    return lrow(lang, i, l, D)[:-5] + c(pct(m.get("max_drawdown"))) + settled + c(usd(m.get("realized_pnl"), True), tone(m.get("realized_pnl"))) + "</tr>"
short_ = short

def leaderboard(lang, D):
    zh = lang == "zh"; asof = bj(D["as_of"], lang)
    rows = "".join(lrow_full(lang, i + 1, l, D) for i, l in enumerate(D["leaders"]))
    if not D["ok"]:
        tbl = f'<p class="nd pad">{T[lang]["nd"]}</p><p class="mu pad">{"构建时排行榜接口不可用，本页为占位，下次构建会自动补上。" if zh else "The leaderboard API was unavailable at build time; this is a placeholder until the next build."}</p>'
    else:
        tbl = f'<div class="tw"><table class="lt"><thead>{lhead(lang, basis=any(lb_basis(l) for l in D["leaders"]))}</thead><tbody>{rows}</tbody></table></div>'
    intro = ("按综合评分排序。胜率和收益率只作展示，不是排序依据。Wakeloom 用收益集中度、刷量等门槛给地址打分，没通过的地址没有综合评分；被识别为疑似做市的地址不参与排名。部分地址的数据来自第三方，页面会标出来源，请自己再看一下。只收录成交笔数足够多的地址。排名不代表以后的表现。" if zh else
             "Ranked by composite score. Win rate and ROI are display columns, not the sort key. Wakeloom scores addresses using checks such as single-event concentration and wash trading; addresses that fail get no score, and likely market makers are not ranked. Some addresses use third-party data, and the page shows the source, so please review them yourself. We only list wallets with enough trades. A ranking does not predict future results.")
    meta = f'<p class="mu sm"><span data-live-meta="leaderboard">{"数据截至" if zh else "Data as of"} {E(asof)} · {"共" if zh else ""} {len(D["leaders"])} {"位" if zh else "traders"}</span> · <span class="live-badge" data-live-badge="leaderboard"></span> · <a class="ln" href="/{lang}/how-it-works/">{"选人方法" if zh else "How we pick"} →</a></p>' if asof else '<p class="mu sm"><span data-live-meta="leaderboard"></span> <span class="live-badge" data-live-badge="leaderboard"></span></p>'
    body = f'''<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / {"排行榜" if zh else "Leaderboard"}</p><h1>{"Polymarket 交易者排行榜" if zh else "Leaderboard of Polymarket traders"}</h1><p class="lead">{E(intro)}</p>
{meta}</section>
<section class="card" data-live="leaderboard">{tbl}</section>'''
    il = {"@type": "ItemList", "name": DESC[lang]["leaderboard"][0], "numberOfItems": len(D["leaders"]),
          "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/{lang}/leader/{l['address']}/", "name": dname(D["wallets"].get(l["address"]), l["address"])} for i, l in enumerate(D["leaders"])]}
    write(f"{lang}/leaderboard/index.html", page(lang, "leaderboard/", "leaderboard", body, [il, crumbs(lang, [("排行榜" if zh else "Leaderboard", "leaderboard/")])]))

def leader(lang, a, upd, rank, D):
    zh = lang == "zh"; d = D["details"].get(a) or {}; w = dict(D["wallets"].get(a) or {}); w.update({k: v for k, v in d.items() if k in ("user_name", "x_username")})
    w["as_of"] = d.get("updated_at") or upd
    m = dict(d.get("metrics") or {})
    for k in ("win_rate", "roi", "max_drawdown"):
        if d.get(k) is not None: m[k] = d[k]
    nm = dname(w, a)
    asof_raw = w.get("as_of") or D["as_of"]; asof = bj(asof_raw, lang)
    wr, roi, dd_, rm = pct(m.get("win_rate"), d=1), pct(m.get("roi"), True), pct(m.get("max_drawdown")), basis_count(m.get("resolved_markets"), m.get("settled_capped"))
    # 描述：缺值整句删
    if zh:
        parts = [f"近90天胜率 {wr}" if wr else None, f"收益率 {roi}" if roi else None, f"最大回撤 {dd_}" if dd_ else None]
        parts = [p for p in parts if p]
        desc = ("、".join(parts) + "。" if parts else "") + (f"已结算市场 {rm} 个。" if rm else "") + "数据来自链上公开记录。"
        title = f"{short(a)} 的 Polymarket 交易数据：胜率、回撤 | Wakeloom 织迹"
    else:
        parts = [f"90-day win rate {wr}" if wr else None, f"ROI {roi}" if roi else None, f"max drawdown {dd_}" if dd_ else None]
        parts = [p for p in parts if p]
        desc = (", ".join(parts) + ". " if parts else "") + (f"{rm} resolved markets. " if rm else "") + "Data from public on-chain records."
        title = f"{short(a)} Polymarket Trader Stats: Win Rate, Drawdown | Wakeloom"
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
    cats = [x.get("category") if isinstance(x, dict) else x for x in (d.get("categories") or m.get("categories") or [])]
    cats = [(CAT.get(c, c) if zh else c) for c in cats if c and c != "unknown"][:5]
    lt = bj(m.get("last_trade_at"), lang)
    facts = []
    if cats: facts.append(L("主要市场类别：", "Main categories: ") + ("、" if zh else ", ").join(cats) + L("。", "."))
    if lt: facts.append(L(f"最近一次成交：{lt}。", f"Last trade: {lt}."))
    if w.get("x_username"): facts.append(L("X 账号：", "X account: ") + "@" + w["x_username"] + L("（自报，未核实）。", " (self-reported, unverified)."))
    fh = "".join(f"<li>{E(f)}</li>" for f in facts)
    spark_html = spark(w.get("equity_curve"), lang)
    # recent_results 公开接口目前恒为 null → 显示「无数据」；K 线买卖点未上线，CTA 继续引导进 App
    rr_html = f'<section class="card" data-f="recent"><div class="hd"><b>{L("近 20 笔输赢", "Last 20 results")}</b></div><p class="nd pad">{N}</p></section>'
    body = f'''<div data-live="leader" data-addr="{a}">
<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / <a href="/{lang}/leaderboard/">{L("排行榜", "Leaderboard")}</a> / {E(short(a))}</p>
<h1 data-f="name">{E(nm)}{f' <span class="mu rk num">#{rank}</span>' if rank else ""}</h1><p class="addr num" title="{a}">{a}</p><p class="lead" data-f="desc">{E(desc)}</p>
<p class="mu sm" data-f="asof">{(L("数据截至", "Data as of") + " " + E(asof) + " · " + L("统计窗口：近 90 天", "Window: last 90 days")) if asof else ""}</p>
<span class="live-badge" data-live-badge="leader"></span></section>
<section class="card grid" data-f="grid">{grid}</section>
<div data-f="spark">{spark_html}</div>
<section class="card" data-f="facts"{"" if fh else " style=\"display:none\""}>{f"<ul class=\"facts\">{fh}</ul>" if fh else ""}</section>
{rr_html}
<section class="card cta-row"><div><b>{L("想看他每个市场的买卖点、近 20 笔输赢？", "Want per-market buy/sell points and the last 20 trades?")}</b><p class="mu">{L("在应用里打开这个地址，或用模拟盘跟一跟。上榜不代表以后的表现。", "Open this wallet in the app or paper-trade it. A ranking does not predict future results.")}</p></div><a class="btn pri" href="https://app.wakeloom.com/leader?addr={a}">{L("在应用中查看", "Open in the app")} →</a></section>
</div>'''
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

# copy-trading 首屏直接回答 + 上线通知（source=copy-trading）+「为什么先用模拟盘」。文案待 Casey 定字。
COPY_FIRST = {
  "zh": ('Polymarket 本身没有跟单功能。Wakeloom 目前只做模拟盘（paper trading）跟单：按你的规则模拟跟随一个地址，记下价差和延迟，不下真实订单。产品尚未正式上线。', ('上线时通知你', '留个邮箱，Wakeloom 正式上线时发一封通知。'), ('为什么先用模拟盘', '跟单的结果通常比被跟的地址差一些。发现对方成交要时间，这段时间价格会动，还要付手续费。先用模拟盘跑一段，看扣掉这些成本后还剩多少，再决定下一步。')),
  "en": ("Polymarket has no built-in copy trading. Wakeloom currently offers paper trading only: it simulates following a wallet under your rules and logs the price gap and delay, with no real orders. Wakeloom has not launched yet.", ('Get notified at launch', "Leave your email and we'll send one notice when Wakeloom launches."), ('Why paper trading first', 'Copying usually lands a little behind the wallet you follow: spotting their fill takes time, the price moves meanwhile, and fees come on top. Paper trading for a while shows what is left after those costs before you decide anything else.')),
}
def article(lang, path, key, h1, secs, crumb):
    tt, dd = DESC[lang][key]
    inner = "".join(f'<section class="card prose"><h2>{E(h)}</h2>{"".join(f"<p>{E(p)}</p>" for p in ps)}</section>' for h, ps in secs)
    body = f'<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / {E(crumb)}</p><h1>{E(h1)}</h1><p class="lead">{E(dd)}</p></section>{inner}'
    if key == "copy":
        ans, cta, why = COPY_FIRST[lang]
        body = (f'<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / {E(crumb)}</p><h1>{E(h1)}</h1><p class="lead answer">{E(ans)}</p><p class="mu sm">{E(dd)}</p></section>'
                f'<section class="card wl-card wl-gate" id="notify" hidden><h2>{E(cta[0])}</h2><p class="mu sm">{E(cta[1])}</p>{wl_form("copy", lang, "copy-trading")}</section>'
                f'<section class="card prose"><h2>{E(why[0])}</h2><p>{E(why[1])}</p></section>{inner}')
    ld = [{"@type": "Article", "headline": h1, "description": dd, "inLanguage": T[lang]["html"], "url": f"{SITE}/{lang}/{path}",
           "author": {"@id": SITE + "/#org"}, "publisher": {"@id": SITE + "/#org"}, "datePublished": "2026-10-21", "dateModified": "2026-10-21"},
          crumbs(lang, [(crumb, path)])]
    if key == "copy": ld.insert(0, softapp(lang))
    write(f"{lang}/{path}index.html", page(lang, path, key, body, ld))

def content(lang):
    zh = lang == "zh"; L = (lambda z, e: z if zh else e)
    article(lang, "how-it-works/", "how", L("我们怎么给 Polymarket 交易者打分", "How we score Polymarket traders"), [
      (L("统计口径", "What we measure"), [L("统计窗口是近 90 天，只算已经结算的市场。每个地址展示胜率、收益率、最大回撤、已结算市场数、平均买入价、单笔中位金额和持仓中位时长。", "The window is the last 90 days and only resolved markets count. For each wallet we show win rate, ROI, max drawdown, resolved markets, average entry price, median trade size and median holding time."),
        L("收益率 = 已实现盈亏 ÷ 投入，不含未结算持仓的浮动盈亏。部分地址的数据来自第三方，页面会标出来源。这些地址的收益率用对方给的数字，口径可能不同。", "ROI = realized P&L ÷ capital invested, excluding unrealized P&L on open positions. Some addresses use third-party data, and the page shows the source. For those, ROI is the provider's figure and may be calculated differently."),
        L("成交笔数太少的地址样本太小，不生成详情页。", "Wallets with too few trades are too small a sample and get no detail page.")]),
      (L("先打分，再排序", "Score first, then rank"), [L("Wakeloom 用收益集中度、刷量等门槛给地址打分，没通过的地址没有综合评分；被识别为疑似做市的地址不参与排名。部分地址的数据来自第三方，页面会标出来源，请自己再看一下。", "Wakeloom scores addresses using checks such as single-event concentration and wash trading; addresses that fail get no score, and likely market makers are not ranked. Some addresses use third-party data, and the page shows the source, so please review them yourself."),
        L("通过筛选的地址再按长期表现综合排序。排序用的综合分是内部指标，不对外公布。", "Wallets that pass are ranked by long-term results. The composite used for ranking is internal and not published.")]),
      (L("数据来源与更新", "Sources and updates"), [L("成交来自 Polygon 链上记录和 Polymarket 公开接口。排行榜和详情页由浏览器请求公开接口刷新数字；仓库里的 HTML 是 SEO 快照。每页写明数据截至时间（按你浏览器的本地时区显示）。拿不到的数值显示「无数据」，不用 0 填充。", "Fills come from Polygon on-chain records and Polymarket's public APIs. Website pages are rebuilt daily and show their data time in your local timezone. Values we can't get show \"No data\" and are never filled with 0.")]),
      (L("限制", "Limitations"), [L("过去 90 天的表现不代表以后。筛选规则能去掉明显的噪音，但去不掉所有运气，也看不到地址背后的人是否改变了策略。", "Past 90-day results don't predict the future. The filters remove obvious noise but not all luck, and they can't see whether the person behind a wallet has changed strategy.")]),
    ], L("选人方法", "How it works"))
    article(lang, "copy-trading/", "copy", L("用于 Polymarket 的模拟盘跟单", "Paper-trade copy trading for Polymarket"), [
      (L("适用场景", "Who it's for"), [L("想先用模拟盘看看某个 Polymarket 地址跟下来是什么结果、又不想直接拿真钱试的人。", "People who want to see how copying a Polymarket wallet would play out in paper trading before putting real money in.")]),
      (L("规则", "Rules you set"), [L("按比例：对方下多少，我们按你设的比例下。", "Ratio: we size each order as a proportion of theirs."),
        L("上限：单笔上限和单个市场上限，超过就截断。", "Caps: a per-trade cap and a per-market cap; anything above is cut."),
        L("偏离阈值：我们的价格和对方成交价差得太多就放弃这一笔。", "Deviation limit: if our price is too far from their fill, we skip the trade."),
        L("跟随平仓：对方减仓或平仓，我们按比例跟着做。", "Follow the close: when they reduce or exit, we do the same proportionally."),
        L("全局停止（即将推出）：一键暂停所有跟随。", "Global stop (coming soon): pause all copying at once.")]),
      (L("流程", "How it runs"), [L("发现对方成交后，按当时的盘口模拟成交，记录我们和对方的价差、延迟和手续费。跑 1–2 周后看扣掉成本后的结果，再决定要不要考虑实盘。实盘跟单即将推出。", "When we see their fill, we simulate ours against the live order book and log the price gap, delay and fees. After one to two weeks we look at the net result after costs before considering live trading. Live copy trading is coming soon.")]),
      (L("限制", "Limitations"), [L("目前只有模拟盘，不下真实订单。模拟成交按盘口估算，实盘的成交价可能更差。", "Currently paper trading only; no real orders are placed. Simulated fills are estimated from the book and live fills may be worse.")]),
    ], L("模拟盘跟单", "Paper copy trading"))
    simple = {
     "risk": (L("风险提示", "Risk notice"), [L("预测市场交易可能损失全部本金。跟单不能消除风险：过去的表现不代表以后，延迟、滑点和手续费会让你的结果比被跟随的地址更差。", "Prediction-market trading can lose all of your stake. Copying doesn't remove risk: past results don't predict future ones, and latency, slippage and fees can make your results worse than the wallet you follow."),
        L("Wakeloom 目前只提供模拟盘，展示的跟单结果都是模拟结果，不是真实成交。请遵守你所在地区关于预测市场的法律。", "Wakeloom currently offers paper trading only; any copy results shown are simulated, not real fills. Follow the laws on prediction markets where you live."),
        L("本站内容仅供研究，不构成投资建议。", "Nothing on this site is investment advice.")]),
     "privacy": (L("隐私说明", "Privacy"), [L("官网页面只展示公开的链上地址数据。使用应用时，我们保存你的钱包地址、登录会话和你设置的模拟盘规则，用来提供服务。", "Website pages show only public on-chain wallet data. When you use the app we store your wallet address, sign-in session and the paper-trading rules you set, to provide the service."),
        L("用 Google 或邮箱登录时，我们会收集你的邮箱。登录信息由 Privy 托管。", "When you sign in with Google or email, we collect your email address. Sign-in information is hosted by Privy."),
        L("我们不收集也不保存你的私钥。不出售个人数据。如需删除数据，请联系我们。", "We never collect or store your private key, and we don't sell personal data. Contact us to delete your data.")]),
     "terms": (L("使用条款", "Terms of use"), [L("Wakeloom 按现状提供，数据可能延迟、缺失或有误。你对自己的交易决定负责。", "Wakeloom is provided as is; data may be delayed, missing or wrong. You are responsible for your own trading decisions."),
        L("Wakeloom 是独立工具，与 Polymarket 无隶属或合作关系。页面上的地址统计来自公开数据，可在注明来源的前提下引用。", "Wakeloom is independent and not affiliated with Polymarket. Wallet stats come from public data and may be cited with attribution.")]),
     "about": (L("关于 Wakeloom 织迹", "About Wakeloom"), [L("Wakeloom 织迹是一个用于 Polymarket 的钱包分析和模拟盘工具。名字来自船行留下的尾迹：交易者在链上留下的痕迹，被我们织成可以读懂的数据。", "Wakeloom is a wallet analytics and paper-trading tool for Polymarket. The name comes from a ship's wake: the traces traders leave on-chain, woven into data you can read."),
        L("目前做钱包分析和模拟盘跟单，以后会加入更多策略类型。", "Wakeloom currently covers wallet analytics and paper copy trading; more strategy types will follow.")]),
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

ROOT_TITLE = "Wakeloom 织迹 – 用于 Polymarket 的钱包分析与模拟盘 | Wallet analytics for Polymarket"
ROOT_DESC = "从链上历史筛出长期表现稳定的 Polymarket 交易者，先用模拟盘跟单再决定。Find Polymarket traders with steady long-term results and paper-trade them first."

def root_social():
    """根路径 / 的 OG / Twitter。og:url 与 canonical 同为站点根，不用 favicon。"""
    title, desc = E(ROOT_TITLE), E(ROOT_DESC)
    alt = E("Wakeloom 织迹，用于 Polymarket 的钱包分析与模拟盘")
    return (
        f'<meta property="og:type" content="website"><meta property="og:site_name" content="Wakeloom">'
        f'<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">'
        f'<meta property="og:url" content="{SITE}/"><meta property="og:image" content="{OG_IMAGE}">'
        f'<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
        f'<meta property="og:image:alt" content="{alt}">'
        f'<meta property="og:locale" content="zh_CN"><meta property="og:locale:alternate" content="en_US">'
        f'<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}">'
        f'<meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{OG_IMAGE}">'
        f'<meta name="twitter:image:alt" content="{alt}">'
    )

def root(D):
    graph = ld_clean({"@context": "https://schema.org", "@graph": [ORG, website("zh")]})
    s = f'''<!doctype html><html lang="zh-CN" data-waitlist="{"on" if WAITLIST_ON else "off"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(ROOT_TITLE)}</title>
<meta name="description" content="{E(ROOT_DESC)}">
<link rel="canonical" href="{SITE}/"><link rel="alternate" hreflang="zh-CN" href="{SITE}/zh/"><link rel="alternate" hreflang="en" href="{SITE}/en/"><link rel="alternate" hreflang="x-default" href="{SITE}/">
{root_social()}
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icons/wakeloom.svg" type="image/svg+xml"><link rel="stylesheet" href="/site.css?v={CSS_V}"><meta name="theme-color" content="#0d0d10">
<script type="application/ld+json">{json.dumps(graph, ensure_ascii=False, separators=(",", ":"))}</script>
<script>/* 只在根路径（x-default 选语言页）跳转一次：手动选过的优先，其次 navigator.languages 第一项，zh 开头去中文，其余英文。/zh/ /en/ 页面本身不跳转。 */
try{{var s=localStorage.getItem("wl_lang");if(s!=="zh"&&s!=="en")s="";var n=(navigator.languages&&navigator.languages[0])||navigator.language||"";var l=s||(n.toLowerCase().indexOf("zh")===0?"zh":"en");location.replace("/"+l+"/")}}catch(e){{}}</script></head>
<body class="pick">{banner("auto")}<main class="pk"><img src="/icons/wakeloom.svg" width="72" height="72" alt="Wakeloom 织迹"><h1>Wakeloom 织迹</h1><p class="mu">用于 Polymarket 的钱包分析 · 模拟盘<br>Wallet analytics &amp; paper trading for Polymarket</p><div class="ctas"><a class="btn pri" href="/zh/" hreflang="zh-CN" onclick="try{{localStorage.setItem('wl_lang','zh')}}catch(e){{}}">中文</a><a class="btn" href="/en/" hreflang="en" onclick="try{{localStorage.setItem('wl_lang','en')}}catch(e){{}}">English</a></div></main></body></html>'''
    write("index.html", s)

def sitemap(D):
    lm_data = iso(D["as_of"]) if D["as_of"] else None
    static_lm = "2026-10-21"
    urls = [("", lm_data or static_lm), ("leaderboard/", lm_data or static_lm)]
    for k in ["how-it-works/", "copy-trading/", "faq/", "risk/", "privacy/", "terms/", "about/"]: urls.append((k, static_lm))
    for a, u in D["pages"]:
        d = D["details"].get(a) or {}
        urls.append((f"leader/{a}/", iso(d.get("updated_at") or u) or static_lm))
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
           f'<url><loc>{SITE}/</loc><lastmod>{static_lm}</lastmod><xhtml:link rel="alternate" hreflang="zh-CN" href="{SITE}/zh/"/><xhtml:link rel="alternate" hreflang="en" href="{SITE}/en/"/><xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/"/></url>']
    for p, lm in urls:
        alt = f'<xhtml:link rel="alternate" hreflang="zh-CN" href="{SITE}/zh/{p}"/><xhtml:link rel="alternate" hreflang="en" href="{SITE}/en/{p}"/><xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/"/>'
        for lang in ("zh", "en"): out.append(f"<url><loc>{SITE}/{lang}/{p}</loc><lastmod>{lm}</lastmod>{alt}</url>")
    out.append("</urlset>")
    write("sitemap.xml", "\n".join(out) + "\n")
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: {SITE}/sitemap.xml\n")

def leader_shell(lang):
    """非前 50 地址的通用壳：路径或 ?addr= 解析地址，由 site-live.js 拉公开接口。"""
    zh = lang == "zh"; L = (lambda z, e: z if zh else e)
    N = T[lang]["nd"]
    title = L("Polymarket 交易者数据 | Wakeloom 织迹", "Polymarket Trader Stats | Wakeloom")
    desc = L("打开后从公开接口加载该地址的胜率、收益率与回撤。", "Loads win rate, ROI and drawdown for this wallet from the public API.")
    body = f'''<div data-live="leader" data-addr="">
<section class="ph"><p class="crumb"><a href="/{lang}/">{T[lang]["home"]}</a> / <a href="/{lang}/leaderboard/">{L("排行榜", "Leaderboard")}</a> / …</p>
<h1 data-f="name">{L("加载中…", "Loading…")}</h1><p class="addr num" data-f="addr"></p><p class="lead" data-f="desc">{E(desc)}</p>
<p class="mu sm" data-f="asof"></p><span class="live-badge" data-live-badge="leader"></span>
<p class="nd pad" data-f="missing" hidden>{L("没有这个地址的公开数据，或接口暂不可用。", "No public data for this wallet, or the API is unavailable.")}</p></section>
<section class="card grid" data-f="grid">{"".join(stat(lab, None, N) for lab in ([L("胜率（近90天）","Win rate (90d)"), L("收益率（近90天）","ROI (90d)"), L("最大回撤","Max drawdown"), L("已结算市场","Resolved markets")] ))}</section>
<div data-f="spark"></div>
<section class="card" data-f="facts" style="display:none"></section>
<section class="card" data-f="recent"><div class="hd"><b>{L("近 20 笔输赢", "Last 20 results")}</b></div><p class="nd pad">{N}</p></section>
<section class="card cta-row"><div><b>{L("在应用里打开这个地址", "Open this wallet in the app")}</b><p class="mu">{L("上榜不代表以后的表现。", "A ranking does not predict future results.")}</p></div><a class="btn pri" data-f="app" href="https://app.wakeloom.com/board">{L("进入应用", "Open the app")} →</a></section>
</div>
<script>
(function(){{
  var m=location.pathname.match(new RegExp("/leader/(0x[a-fA-F0-9]{{40}})/?"));
  var a=(m&&m[1]||new URLSearchParams(location.search).get("addr")||"").toLowerCase();
  var root=document.querySelector("[data-live=leader]");
  if(root&&a){{root.setAttribute("data-addr",a);var el=document.querySelector("[data-f=addr]");if(el){{el.textContent=a;el.title=a;}}
  var app=document.querySelector("[data-f=app]");if(app)app.href="https://app.wakeloom.com/leader?addr="+a;
  var can=document.querySelector('link[rel=canonical]');if(can)can.href="https://www.wakeloom.com/{lang}/leader/"+a+"/";
  }}
}})();
</script>'''
    # 壳页 path 用 leader/_shell/，JSON-LD 仅面包屑（具体 Person 由客户端刷新后不改 LD——SEO 依赖前 50 快照）
    write(f"{lang}/leader/_shell/index.html", page(lang, "leader/_shell/", "x", body, [crumbs(lang, [(L("排行榜", "Leaderboard"), "leaderboard/")])], title=title, desc=desc, alt=False))

def write_redirects():
    app = "https://app.wakeloom.com"
    # 旧的根路径和 /app 前缀都送到 App 子域，路径原样保留。query 由 workers/www.mjs 附上。
    lines = [
        f"/account.html {app}/account.html 301",
        f"/board.html {app}/board.html 301",
        f"/config.html {app}/config.html 301",
        f"/health.html {app}/health.html 301",
        f"/leader-5c1e.html {app}/leader-5c1e.html 301",
        f"/leader-91d4.html {app}/leader-91d4.html 301",
        f"/leader-avalon.html {app}/leader-avalon.html 301",
        f"/leader-lunadegen.html {app}/leader-lunadegen.html 301",
        f"/leader.html {app}/leader.html 301",
        f"/leaders.html {app}/leaders.html 301",
        f"/login.html {app}/login.html 301",
        f"/overview.html {app}/overview.html 301",
        f"/strategies.html {app}/strategies.html 301",
        f"/app {app}/ 301",
        f"/app/ {app}/ 301",
        f"/app/* {app}/:splat 301",
        # 无静态文件时回落到壳页（已有 /zh/leader/0x…/index.html 的仍优先）
        "/zh/leader/:addr /zh/leader/_shell/index.html 200",
        "/en/leader/:addr /en/leader/_shell/index.html 200",
        "/zh/leader/:addr/ /zh/leader/_shell/index.html 200",
        "/en/leader/:addr/ /en/leader/_shell/index.html 200",
    ]
    write("_redirects", "\n".join(lines) + "\n")

# llms.txt 的结论摘要。问题原文必须和 FAQ 一致；这里不写收费、价格、评分，也不链到 app 子域。
LLMS_SUMMARY = {
 "zh": [
  ("Polymarket 能跟单吗？怎么跟？", "能，但 Polymarket 本身没有跟单功能，需要第三方工具盯住目标钱包的成交再按比例跟随。Wakeloom 目前只做模拟盘，实盘跟单即将推出。"),
  ("怎么判断一个 Polymarket 交易者是不是长期表现稳定？", "看足够长的窗口和足够多的已结算市场，而不是单笔大赚。近 90 天同时看胜率、收益率、最大回撤，以及收益是否集中在一个事件上。"),
  ("Polymarket 排行榜第一名可以直接参考吗？", "不一定。按金额排的榜首常常是一次重仓押中，或成交里有刷量和做市对冲，这类表现很难复制。上榜也不代表以后还会这样。"),
  ("跟单 Polymarket 会不会因为延迟和滑点亏钱？", "会。发现对方成交到自己下单之间有延迟，薄盘口还会更差。偏离过大就放弃，先在模拟盘里看扣掉成本后的结果。"),
  ("Wakeloom 会托管我的私钥吗？", "目前只有模拟盘。Wakeloom 不接收、不托管用户私钥。登录时的签名不能用来转账，也不能授权交易。"),
  ("胜率和收益率哪个更重要？", "单看哪个都不够，要和回撤一起看。高胜率也可能一次失手就抹掉多次结果。"),
  ("对方平仓了我怎么办？", "跟着平。对方减仓或平仓时，按同样比例减仓或平仓。一键暂停所有跟随的全局停止即将推出。"),
  ("数据从哪来？多久更新？", "来自 Polygon 链上成交记录和 Polymarket 的公开接口。拿不到的数据显示「无数据」，不会用 0 填充，页面会写明数据截至时间。"),
  ("跟单有风险吗？会亏钱吗？", "有风险，也会亏钱。过去的表现不代表以后。目前只开放模拟盘。"),
  ("Wakeloom 和 Polymarket 是什么关系？", "没有隶属或合作关系。Wakeloom 是用于 Polymarket 的独立分析工具，只读取公开的链上和接口数据。"),
 ],
 "en": [
  ("Can you copy trade on Polymarket, and how?", "Yes, but Polymarket has no built-in copy trading, so a third-party tool has to watch a wallet and mirror it proportionally. Wakeloom's first phase is paper trading only. Live copy trading is coming soon (即将推出)."),
  ("How can I tell whether a Polymarket trader has steady long-term results?", "Look at a long enough window and enough resolved markets, not one big win. We use 90 days and check win rate, ROI, max drawdown, and whether results come from a single event."),
  ("Can you rely on the #1 trader on a Polymarket leaderboard?", "Not necessarily. The top spot by dollars is often one large bet, or volume inflated by wash trades and market-making. A ranking does not predict the future."),
  ("Will latency and slippage make copy trading on Polymarket lose money?", "They can. The market can move before the next order, and thin books are worse. Trades that deviate too far are skipped. Net results are measured in paper trading first."),
  ("Does Wakeloom hold my private key?", "Currently paper trading only. Wakeloom never receives or holds your private key. The login signature cannot transfer funds or approve trades."),
  ("Which matters more, win rate or ROI?", "Neither alone. Read them together with drawdown. A high win rate can still be wiped out by one loss."),
  ("What happens when the trader I follow closes a position?", "We close too, by the same proportion. A global stop that pauses all copying at once is coming soon (即将推出)."),
  ("Where does the data come from, and how often is it updated?", 'From Polygon on-chain fills and Polymarket\'s public APIs. Missing values are shown as "No data", never filled with 0, and each page states its data time.'),
  ("Is copy trading risky? Can I lose money?", "Yes. It is risky and you can lose money. Past results do not predict future ones. Currently paper trading only."),
  ("How is Wakeloom related to Polymarket?", "It is not affiliated. Wakeloom is an independent analytics tool for Polymarket and only reads public on-chain and API data."),
 ],
}
LLMS_BAN = ("稳赚", "保证收益", "保证盈利", "guaranteed", "app.wakeloom.com", "收费", "评分", "价格", "price", "rating", "$", "¥")

def write_llms():
    for lang in ("zh", "en"):
        if [q for q, _ in FAQ[lang]] != [q for q, _ in LLMS_SUMMARY[lang]]:
            raise SystemExit(f"llms.txt 的{lang}问题列表和 FAQ 不一致")
    pages = [
        (f"{SITE}/", "首页（语言选择，中英）", "双语入口。公测前预览，尚未正式上线。"),
        (f"{SITE}/zh/", "首页（中文）", "用于 Polymarket 的钱包分析与模拟盘跟单。"),
        (f"{SITE}/en/", "Home (English)", "Wallet analytics and paper copy trading for Polymarket."),
        (f"{SITE}/zh/leaderboard/", "排行榜", "按综合评分排序。部分地址的数据来自第三方，页面会标出来源。"),
        (f"{SITE}/en/leaderboard/", "Leaderboard", "Ranked by composite score. Some addresses use third-party data, and the page shows the source."),
        (f"{SITE}/zh/how-it-works/", "选人方法", "近 90 天窗口、回撤和选人规则。"),
        (f"{SITE}/en/how-it-works/", "How it works", "How wallets are selected and which stats are shown."),
        (f"{SITE}/zh/copy-trading/", "模拟盘跟单", "目前只有模拟盘。实盘跟单即将推出。"),
        (f"{SITE}/en/copy-trading/", "Paper copy trading", "Currently paper trading only. Live copy trading is coming soon (即将推出)."),
        (f"{SITE}/zh/faq/", "常见问题", "每题先给结论。"),
        (f"{SITE}/en/faq/", "FAQ", "Each answer leads with the conclusion."),
        (f"{SITE}/zh/risk/", "风险提示", "跟单会亏钱；目前只有模拟盘。"),
        (f"{SITE}/en/risk/", "Risk notice", "Copy trading can lose money. Paper trading only for now."),
        (f"{SITE}/zh/about/", "关于", "Wakeloom 织迹是什么。"),
        (f"{SITE}/en/about/", "About", "What Wakeloom is."),
        (f"{SITE}/zh/privacy/", "隐私", "收集哪些数据、怎么使用。"),
        (f"{SITE}/en/privacy/", "Privacy", "What data is collected and how it is used."),
        (f"{SITE}/zh/terms/", "条款", "使用 Wakeloom 的条款。"),
        (f"{SITE}/en/terms/", "Terms", "The terms for using Wakeloom."),
    ]
    lines = [
        "# Wakeloom 织迹",
        "",
        "> 公测前预览，尚未正式上线。Wakeloom 织迹是用于 Polymarket 的钱包分析与模拟盘跟单工具。实盘跟单即将推出。",
        "",
        "Wakeloom (织迹) reads public Polymarket wallet history and lets you paper-trade copying a wallet before using money. This site is a pre-launch preview and is not yet launched. Live copy trading is coming soon (即将推出). Copy trading can lose money. Past results are not future results.",
        "",
        "## 主要页面 / Pages",
        "",
    ]
    lines += [f"- [{name}]({url}): {note}" for url, name, note in pages]
    lines += ["", "## FAQ 结论摘要 / FAQ conclusions", "", "### 中文", ""]
    lines += [f"- **{q}** {a}" for q, a in LLMS_SUMMARY["zh"]]
    lines += ["", "### English", ""]
    lines += [f"- **{q}** {a}" for q, a in LLMS_SUMMARY["en"]]
    lines += [""]
    text = "\n".join(lines)
    # 「综合评分排序」是 Casey 定的排序口径（2026-10-28），不是星级/用户评分；只放行这个词组，其余「评分」仍拦。
    low = text.lower().replace("综合评分", "")
    for w in LLMS_BAN:
        if w.lower() in low:
            raise SystemExit(f"llms.txt 含红线用词 {w}")
    write("llms.txt", text)

def main():
    D = load()
    snaps = D.get("snap_pages") or []
    print("data ok" if D["ok"] else "data FAILED: " + str(D["err"]), "| as_of", D["as_of"], "| leaders", len(D["leaders"]), "| seo_snap", len(snaps), "| sitemap_addrs", len(D["pages"]), "| sitemap api", D["sitemap_ok"])
    for lang in ("zh", "en"):
        shutil.rmtree(os.path.join(ROOT, lang, "leader"), ignore_errors=True)
        home(lang, D); leaderboard(lang, D); content(lang); leader_shell(lang)
        rk = {l["address"].lower(): i + 1 for i, l in enumerate(D["leaders"])}
        for a, u in snaps: leader(lang, a, u, rk.get(a), D)
    root(D); sitemap(D); write_redirects(); write_llms()
    json.dump({"built_at": BUILT.strftime("%Y-%m-%dT%H:%M:%SZ"), "data_as_of": D["as_of"], "source": API + (D["source"] or ""), "leaders": len(D["leaders"]), "leader_pages_seo": len(snaps), "sitemap_addrs": len(D["pages"]), "mode": "client-live+seo-snap-50", "sitemap_api": D["sitemap_ok"], "error": D["err"]},
              open(os.path.join(ROOT, "build-info.json"), "w"), indent=1)

# ---------------- 只刷新数据快照（--refresh-snapshot） ----------------
def utc_stamp(iso, lang):
    b = bj(iso, lang)
    if not b: return None
    b = b.replace(" UTC", "")
    return b + ("（UTC）" if lang == "zh" else " (UTC)")
def _sub1(pat, repl, html, what):
    out, n = re.subn(pat, lambda _m: repl, html, count=1, flags=re.S)
    if n != 1: raise SystemExit(f"refresh-snapshot: {what} not found")
    return out
def refresh_tables(D):
    leaders = D["leaders"]; n = len(leaders); asof = D["as_of"]
    basis = any(lb_basis(l) for l in leaders)
    for lang in ("zh", "en"):
        zh = lang == "zh"; st = utc_stamp(asof, lang) or T[lang]["nd"]
        # 排行榜页
        f = os.path.join(ROOT, lang, "leaderboard", "index.html"); h = open(f, encoding="utf-8").read()
        body = "".join(lrow_full(lang, i + 1, l, D) for i, l in enumerate(leaders))
        h, k = re.subn(r'(<section class="card" data-live="leaderboard"[^>]*><div class="tw"><table class="lt">)<thead>.*?</tbody>',
                   lambda m_: m_.group(1) + f"<thead>{lhead(lang, basis=basis)}</thead><tbody>{body}</tbody>", h, count=1, flags=re.S)
        if k != 1: raise SystemExit("refresh-snapshot: leaderboard table not found")
        meta = (f"数据截至 {st} · 按综合评分 · 共 {n} 位" if zh else f"Data as of {st} · Ranked by score · {n} traders")
        h = _sub1(r'<span data-live-meta="leaderboard"[^>]*>[^<]*</span>', f'<span data-live-meta="leaderboard" data-asof-iso="{E(asof or "")}" data-sort="smart_score">{E(meta)}</span>', h, "leaderboard meta")
        h = re.sub(r'<p class="mu xs ck-foot" data-f="roi-note">[^<]*</p>', "", h)
        if any(lb_flags(l)["third"] for l in leaders):
            h = re.sub(r'(<section class="card" data-live="leaderboard".*?</table></div>)', lambda m_: m_.group(1) + f'<p class="mu xs ck-foot" data-f="roi-note">{E(LBT[lang]["roiNote"])}</p>', h, count=1, flags=re.S)
        items = [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/{lang}/leader/{l['address']}/", "name": lb_name(l)} for i, l in enumerate(leaders)]
        def fix_ld(m_):
            g = json.loads(m_.group(1))
            for node in (g.get("@graph") or [g]):
                if node.get("@type") == "ItemList":
                    node["numberOfItems"] = n; node["itemListElement"] = items
                if node.get("@type") in ("CollectionPage", "WebPage", "Dataset") and "dateModified" in node and asof:
                    node["dateModified"] = asof
            return '<script type="application/ld+json">' + json.dumps(g, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>"
        h = re.sub(r'<script type="application/ld\+json">(.*?)</script>', fix_ld, h, count=1, flags=re.S)
        open(f, "w", encoding="utf-8").write(h)
        # 首页前 3
        f = os.path.join(ROOT, lang, "index.html"); h = open(f, encoding="utf-8").read()
        top = "".join(lrow(lang, i + 1, l, D) for i, l in enumerate(leaders[:3]))
        h, k = re.subn(r'(data-live="home-top".*?<table class="lt">)<thead>.*?</tbody>', lambda m_: m_.group(1) + f"<thead>{lhead(lang, short=True)}</thead><tbody>{top}</tbody>", h, count=1, flags=re.S)
        if k != 1: raise SystemExit("refresh-snapshot: home-top table not found")
        hm = (f"数据截至 {st} · 按综合评分" if zh else f"Data as of {st} · Ranked by score")
        h = _sub1(r'<span class="mu sm" data-live-meta="home-top"[^>]*>[^<]*</span>', f'<span class="mu sm" data-live-meta="home-top" data-asof-iso="{E(asof or "")}" data-sort="smart_score">{E(hm)}</span>', h, "home-top meta")
        h, k = re.subn(r'(<a class="more" data-live-more="home-top"[^>]*>)[^<]*(</a>)', lambda m_: m_.group(1) + (f"看全部 {n} 位 →" if zh else f"View all {n} traders →") + m_.group(2), h, count=1)
        if k != 1: raise SystemExit("refresh-snapshot: home more link not found")
        open(f, "w", encoding="utf-8").write(h)
def refresh_snapshot_curves():
    """zh/en/leader/<地址>/ 静态快照（线上不提供，由 Worker 服务端渲染）里的曲线改成「累计已实现盈亏」，曲线截到快照时间，其余不动。"""
    done = 0; failed = []
    for lang in ("zh", "en"):
        base = os.path.join(ROOT, lang, "leader")
        for a in sorted(os.listdir(base)):
            f = os.path.join(base, a, "index.html")
            if not re.match(r"^0x[0-9a-f]{40}$", a) or not os.path.exists(f): continue
            h = open(f, encoding="utf-8").read()
            if 'data-f="spark"' not in h: continue
            mod = re.search(r'"dateModified":"([^"]+)"', h)
            cut = mod.group(1) if mod else None
            w = None
            for attempt in range(4):
                try: w = get("/v1/public/wallets/" + a) or {}; break
                except Exception as e:
                    print(f"refresh-snapshot: wallets {a} attempt {attempt + 1}: {e}"); time.sleep(2 * (attempt + 1))
            if w is None:
                # 拉不到曲线：去掉旧曲线（旧标题配的是旧口径的数），留空和线上没有曲线时一样
                failed.append(f"{lang}/{a}"); w = {}
            curve = [c for c in (w.get("equity_curve") or []) if not cut or str((c or {}).get("t") or "")[:10] <= cut[:10]]
            h2 = re.sub(r'<div data-f="spark">(?:<figure class="card spark">.*?</figure>)?</div>', lambda m_: f'<div data-f="spark">{spark(curve, lang)}</div>', h, count=1, flags=re.S)
            if h2 != h: open(f, "w", encoding="utf-8").write(h2); done += 1
    print(f"refresh-snapshot: {done} leader snapshot curves updated; no curve (API failed): {failed or 'none'}")

if __name__ == "__main__":
    if "--refresh-snapshot" in sys.argv:
        D = {"wallets": {}, "err": None}
        try:
            b = get(LB_PATH).get("leaderboard") or {}
            for l in b.get("leaders") or []: l["address"] = l["address"].lower()
            D.update(ok=True, as_of=b.get("as_of"), leaders=sort_by_smart_score(b.get("leaders") or []))
        except Exception as e:
            D.update(ok=False, err=str(e))
        if not D.get("ok") or not D.get("leaders"): raise SystemExit(f"refresh-snapshot: leaderboard API failed: {D.get('err')}")
        refresh_tables(D); refresh_snapshot_curves()
        print(f"refresh-snapshot: {len(D['leaders'])} leaders, as_of {D['as_of']}")
    else:
        main()
