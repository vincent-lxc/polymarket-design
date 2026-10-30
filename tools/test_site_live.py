"""site-live.js 浏览器测试（Playwright，无头 Chromium）。

先起 mock 接口和本地预览：
  python3 tools/mock_public_api.py 8891 &
  BFF_ORIGIN=http://127.0.0.1:8891 PORT=8876 node tools/preview-www.mjs &
再跑：python3 tools/test_site_live.py [http://127.0.0.1:8876] [http://127.0.0.1:8891]
覆盖：成功后角标隐藏、加载失败/超时文案、10 秒超时、标注、收益率缺数据、曲线隐藏、时区标签、
copy-engine #89 index_basis（有/无、封顶、第三方缺数、indexable=false、最近成交为 null），服务端渲染（关 JS）和客户端刷新各查一遍。
"""
import os
import json
import re
import sys
import time

from playwright.sync_api import sync_playwright

SITE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8876"
API = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8891"
A = lambda c: "0x" + c * 40
FAIL = {"zh": "暂时无法刷新，显示的是截至上次更新的数据", "en": "Couldn't refresh; showing data from the last update"}
BAD = re.compile(r"数据更新中|Data updating|接口暂不可用|API unavailable|build snapshot|PolymarketScan|polymarketscan|third_party|待建|校准中|未命名|示意|\bS0\b")
n = 0
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 构建快照里的数据时间（--refresh-snapshot 会更新），失败时页面应把它换成本地时区
SNAP_ISO = re.search(r'data-live-meta="leaderboard" data-asof-iso="([^"]+)"', open(os.path.join(ROOT, "zh/leaderboard/index.html"), encoding="utf-8").read()).group(1)


# 静态构建（JS 关闭 / 爬虫看到的排行榜）：与客户端同口径。无综合评分写「—」，胜率/收益率 null 写「无数据」，不出 0 / NaN / None
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build_site as _bs  # noqa: E402
for _L in ("zh", "en"):
    _nd = "无数据" if _L == "zh" else "No data"
    _row = _bs.lrow_full(_L, 8, {"address": "0x" + "e" * 40, "source": "local", "smart_score": None,
                                 "metrics": {"win_rate": None, "roi": None, "max_drawdown": 0.071, "resolved_markets": 0, "realized_pnl": 48211}}, {"wallets": {}})
    _tds = re.findall(r"<td[^>]*>(.*?)</td>", _row)
    assert '<span class="num mu" data-nd="score">—</span>' == _tds[2], ("static score dash", _L, _tds[2])
    assert _nd in _tds[3] and _nd in _tds[4], ("static wr/roi ND", _L, _tds)
    assert not re.search(r"NaN|None|null|undefined|(?<![\d.])0\.0%", _row), ("static fake number", _L, _row)
    _row2 = _bs.lrow_full(_L, 1, {"address": "0x" + "1" * 40, "source": "local", "smart_score": 66, "metrics": {"win_rate": 0.62}}, {"wallets": {}})
    assert ">66.0<" in _row2 and "—" not in _row2, ("static score kept", _L, _row2)
    # 封顶（*_capped=true）一律固定写「20,000+」，不露原始数 19,991（Blake 2026-10-28）：metrics 路径与 index_basis 路径
    _row3 = _bs.lrow_full(_L, 5, {"address": "0x" + "b" * 40, "source": "polymarketscan", "smart_score": 66,
                                  "metrics": {"resolved_markets": 19991, "settled_capped": True, "trade_count": 20000, "trades_capped": True}}, {"wallets": {}})
    assert re.findall(r"<td[^>]*>(.*?)</td>", _row3)[6] == "20,000+" and "19,991" not in _row3, ("static metrics capped", _L, _row3)
    _row4 = _bs.lrow_full(_L, 9, {"address": "0x" + "7" * 40, "source": "polymarketscan", "smart_score": 56.9, "metrics": {},
                                  "index_basis": {"source": "polymarketscan", "settled": 19991, "settled_capped": True, "trades": 19998, "trades_capped": True}}, {"wallets": {}})
    assert '<td class="r num hm" title="%s">20,000+</td>' % _bs.LBT[_L]["capNote"] in _row4 and "19,991" not in _row4, ("static ib capped", _L, _row4)
    assert _bs.basis_count(19991, True) == "20,000+" and _bs.basis_count(19991, False) == "19,991" and _bs.basis_count(None, False) is None


def snap_local(iso):
    import datetime as _dt
    d = _dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(_dt.timezone(_dt.timedelta(hours=8)))
    return d.strftime("%Y-%m-%d %H:%M") + "（UTC+8）"


def ok(cond, msg):
    global n
    assert cond, msg
    n += 1


def open_page(b, path, api=API, tz="Asia/Shanghai", timeout_ms=None, width=1280):
    ctx = b.new_context(viewport={"width": width, "height": 900}, timezone_id=tz)
    js = "window.WL_API=%r;" % api
    if timeout_ms is not None:
        js += "window.WL_API_TIMEOUT_MS=%d;" % timeout_ms
    ctx.add_init_script(js)
    p = ctx.new_page()
    p.goto(SITE + path, wait_until="domcontentloaded")
    return ctx, p


def badge_done(p, sel):
    p.wait_for_function(
        "s=>{const b=document.querySelector(s);return b&&!b.classList.contains('load')}", arg=sel, timeout=20000)


def text(p):
    return p.inner_text("body")


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # 排行榜：成功
    for lang in ("zh", "en"):
        ctx, p = open_page(b, "/%s/leaderboard/" % lang)
        badge_done(p, "[data-live-badge=leaderboard]")
        bd = p.locator("[data-live-badge=leaderboard]")
        ok(bd.get_attribute("hidden") is not None and bd.inner_text() == "", "leaderboard badge hidden after success " + lang)
        ok(not bd.is_visible(), "badge not visible " + lang)
        t = text(p)
        ok(not BAD.search(t), "no forbidden words leaderboard %s: %s" % (lang, BAD.search(t)))
        meta = p.inner_text("[data-live-meta=leaderboard]")
        ok(re.search(r"2026-10-28 15:09(（UTC\+8）| \(UTC\+8\))", meta), "local tz label in meta: " + meta)
        rows = p.locator("[data-live=leaderboard] tbody tr")
        ok(rows.count() == 11, "11 rows")
        third = "第三方口径" if lang == "zh" else "third-party basis"
        chk = "部分检查未完成" if lang == "zh" else "Some checks pending"
        nd = "无数据" if lang == "zh" else "No data"
        r0, r1, r2, r3 = (rows.nth(i).inner_text() for i in range(4))
        ok(third not in r0 and chk not in r0, "local row has no tags")
        ok(third in r1 and chk in r1, "third-party row has both tags")
        ok(third not in r2 and chk not in r2, "row without fields unchanged")
        ok(nd in r3 and "0.0%" not in r3, "third-party roi 0 with realized pnl -> ND")
        # copy-engine #90：封顶行胜率/收益率为 null → 无数据，分数照常；未评分行分数列写「—」，排最后
        cells = lambda i: [td.inner_text().split("\n")[0].strip() for td in rows.nth(i).locator("td").all()]
        r5, r7 = cells(5), cells(10)
        ok(r5[2] == "66.0" and r5[3] == nd and r5[4] == nd, "capped row: score kept, wr/roi ND " + str(r5))
        ok(r7[2] == "—" and r7[3] == nd, "unscored row: score dash, wr ND " + str(r7))
        allt = p.inner_text("[data-live=leaderboard] tbody")
        ok(not re.search(r"NaN|undefined|null|(?<![\d.])0\.0%", allt), "no fake numbers in leaderboard")
        ok(sum(1 for i in range(11) if "—" in rows.nth(i).inner_text()) == 1, "dash only in the unscored score cell")
        tip = rows.nth(1).locator(".ck").first.get_attribute("title") or ""
        ok("集中度" in tip or "concentration" in tip, "checks tag tooltip")
        foot = p.locator("[data-f=roi-note]")
        ok(foot.count() == 1, "roi footnote once")
        ok(("不含浮动" in foot.inner_text()) if lang == "zh" else ("excluding unrealized" in foot.inner_text()), "footnote text")
        # index_basis：有任一行带 index_basis → 第 7 列表头「已结算（全部历史）」；封顶「20,000+」带悬停；第三方缺数「无数据」
        ths = p.locator("[data-live=leaderboard] thead th")
        ok(ths.nth(6).inner_text() == ("已结算（全部历史）" if lang == "zh" else "Resolved (all time)"), "ib column header " + ths.nth(6).inner_text())
        cell = lambda i: rows.nth(i).locator("td").nth(6)
        ok(cell(7).inner_text() == "1,842", "ib local settled " + cell(7).inner_text())
        ok(cell(8).inner_text() == "20,000+" and cell(8).get_attribute("title") == ("第三方只统计到这个数" if lang == "zh" else "Third-party data stops counting here"), "capped settled")
        ok(cell(9).inner_text() == nd, "third_party_missing settled ND " + cell(9).inner_text())
        ok(cell(0).inner_text() == "120" or re.match(r"^[\d,]+$", cell(0).inner_text()), "row without ib keeps resolved_markets " + cell(0).inner_text())
        ok("—" not in "".join(rows.nth(i).locator("td").nth(6).inner_text() for i in range(11)), "no dash in settled column")
        # 封顶：#90 metrics.settled_capped（b 行，原始 19,991）与 #89 index_basis（7 行，原始 19,991/19,998）都只写「20,000+」
        ok(cell(5).inner_text() == "20,000+", "metrics capped settled " + cell(5).inner_text())
        ok(not re.search(r"19,99\d|1999\d", allt), "raw capped count not on leaderboard")
        ctx.close()

    # 排行榜关 JS（爬虫看到的版本）：综合评分列每行都有数，没有「—」
    for lang in ("zh", "en"):
        ctx = b.new_context(viewport={"width": 1280, "height": 900}, java_script_enabled=False)
        p = ctx.new_page()
        r = p.goto(SITE + "/%s/leaderboard/" % lang)
        ok(r.status == 200, "static leaderboard 200")
        hd = p.locator("[data-live=leaderboard] thead th").nth(2).inner_text()
        ok(hd == ("综合评分" if lang == "zh" else "Score"), "static score header " + hd)
        sc = p.eval_on_selector_all("[data-live=leaderboard] tbody tr", "trs=>trs.map(tr=>tr.children[2].innerText.trim())")
        ok(len(sc) >= 10 and all(re.match(r"^\d+\.\d", x) for x in sc), "static scores filled %s: %s" % (lang, sc[:5]))
        ok("—" not in "".join(sc), "no dash in static score column")
        nums = [float(re.match(r"^[\d.]+", x).group(0)) for x in sc]
        ok(nums == sorted(nums, reverse=True), "static rows sorted by score")
        ok(not BAD.search(text(p)), "no forbidden words static leaderboard")
        hs = p.eval_on_selector_all("[data-live=home-top] tbody tr", "x=>x.length")
        ctx.close()
        ctx = b.new_context(viewport={"width": 1280, "height": 900}, java_script_enabled=False)
        p = ctx.new_page(); p.goto(SITE + "/%s/" % lang)
        sc = p.eval_on_selector_all("[data-live=home-top] tbody tr", "trs=>trs.map(tr=>tr.children[2].innerText.trim())")
        ok(len(sc) == 3 and all(re.match(r"^\d+\.\d", x) for x in sc), "static home top3 scores %s" % sc)
        ctx.close()

    # 排行榜：接口 503 → 失败文案；挂起 + 短超时 → 同样走 catch
    for api, label in ((API + "/fail", "503"), (API + "/hang", "hang")):
        ctx, p = open_page(b, "/zh/leaderboard/", api=api, timeout_ms=400)
        t0 = time.time()
        badge_done(p, "[data-live-badge=leaderboard]")
        bd = p.locator("[data-live-badge=leaderboard]")
        ok(bd.is_visible() and FAIL["zh"] in bd.inner_text() and "err" in bd.get_attribute("class"), "fail badge " + label)
        ok(time.time() - t0 < 5, "timeout path fast " + label)
        ok(p.locator("[data-live=leaderboard] tbody tr").count() > 0, "snapshot rows kept " + label)
        ok(not BAD.search(text(p)), "no forbidden words on fail")
        meta = p.inner_text("[data-live-meta=leaderboard]")
        ok(snap_local(SNAP_ISO) in meta, "snapshot asof localized on fail: " + meta)
        ctx.close()

    # 默认 10 秒超时（不设覆盖值）
    ctx, p = open_page(b, "/en/leaderboard/", api=API + "/hang")
    t0 = time.time()
    p.wait_for_timeout(8500)
    ok("load" in p.locator("[data-live-badge=leaderboard]").get_attribute("class"), "still loading before 10s")
    badge_done(p, "[data-live-badge=leaderboard]")
    el = time.time() - t0
    ok(9 <= el <= 14 and FAIL["en"] in p.inner_text("[data-live-badge=leaderboard]"), "default timeout ~10s (%.1fs)" % el)
    ctx.close()

    # 首页 Top 3
    for lang in ("zh", "en"):
        ctx, p = open_page(b, "/%s/" % lang)
        badge_done(p, "[data-live-badge=home-top]")
        bd = p.locator("[data-live-badge=home-top]")
        ok(not bd.is_visible() and bd.inner_text() == "", "home badge hidden " + lang)
        ok(not BAD.search(text(p)), "no forbidden words home")
        ok(re.search(r"（UTC\+8）| \(UTC\+8\)", p.inner_text("[data-live-meta=home-top]")), "home tz label")
        ctx.close()
    ctx, p = open_page(b, "/en/", api=API + "/fail")
    badge_done(p, "[data-live-badge=home-top]")
    ok(FAIL["en"] in p.inner_text("[data-live-badge=home-top]"), "home fail text")
    ctx.close()

    # leader 页
    for lang in ("zh", "en"):
        Z = lang == "zh"
        for c in "12345":
            ctx, p = open_page(b, "/%s/leader/%s/" % (lang, A(c)))
            badge_done(p, "[data-live-badge=leader]")
            bd = p.locator("[data-live-badge=leader]")
            ok(not bd.is_visible() and bd.inner_text() == "", "leader badge hidden %s %s" % (lang, c))
            t = text(p)
            ok(not BAD.search(t), "forbidden %s %s %s" % (lang, c, BAD.search(t)))
            asof = p.inner_text("[data-f=asof]")
            ok(("2026-10-28 15:09（UTC+8）" if Z else "2026-10-28 15:09 (UTC+8)") in asof, "leader asof " + asof)
            third = "第三方口径" if Z else "third-party basis"
            chk = "部分检查未完成" if Z else "Some checks pending"
            mm = "疑似做市，不参与排名" if Z else "Likely market maker · not ranked"
            spark = p.locator("[data-f=spark] figure")
            if c in "15":
                ok(third not in t and chk not in t and mm not in t, "no labels " + c)
            if c == "1":
                ok(spark.count() == 1 and ("累计已实现盈亏" if Z else "Cumulative realized P&L") in spark.inner_text(), "curve caption")
                ok(("综合评分" if Z else "Score") in p.inner_text("[data-f=checks]"), "score shown for normal")
            if c == "2":
                ok(third in p.inner_text("[data-f=grid]") and chk in p.inner_text("[data-f=checks]"), "third-party labels")
                ok(("集中度" if Z else "concentration") in p.inner_text("[data-f=checks]"), "checks note")
            if c == "3":
                ok(mm in t and ("双边挂单" if Z else "both sides") in t, "mm label + reason")
                ok("77.7" not in t and ("综合评分" if Z else "Score") not in p.inner_text("main"), "mm hides score")
                ok(("胜率、回撤 |" if Z else "Win Rate, Drawdown |") in p.title() and "综合评分" not in p.title(), "mm title " + p.title())
            else:
                ok(("综合评分" if Z else "Score") in p.title() or c == "5", "score title " + p.title())
            if c == "4":
                roi = p.locator("[data-f=grid] .st").nth(1).inner_text()
                ok(("无数据" if Z else "No data") in roi and third in roi and "0.0%" not in roi, "roi ND: " + roi)
                ok(spark.count() == 0, "flat curve hidden")
            ctx.close()

    # copy-engine #90 null 情况：b 封顶（胜率/收益率 null）、c 第三方 roi 缺省 null + 曲线 null、d 自算 roi null + 曲线 null、e 胜率 null + 曲线 [] + 未评分。曲线空：整块隐藏（Casey 定稿）
    NULLS = {"b": ("win_rate", "roi"), "c": ("roi",), "d": ("roi",), "e": ("win_rate",)}
    FAKE = re.compile(r"NaN|undefined|null|(?<![\d.])0\.0%")
    for L in ("zh", "en"):
        Z = L == "zh"
        nd = "无数据" if Z else "No data"
        lab = {"win_rate": "胜率（近90天）" if Z else "Win rate (90d)", "roi": "收益率（近90天）" if Z else "ROI (90d)"}
        for c, nulls in NULLS.items():
            for js in (False, True):
                for width in ((1280, 390) if js else (1280,)):
                    ctx = b.new_context(viewport={"width": width, "height": 900}, timezone_id="Asia/Shanghai", java_script_enabled=js)
                    ctx.add_init_script("window.WL_API=%r;" % API)
                    p = ctx.new_page()
                    errs = []
                    p.on("pageerror", lambda e: errs.append(str(e)))
                    p.goto(SITE + "/%s/leader/%s/" % (L, A(c)), wait_until="domcontentloaded")
                    tagj = "%s %s %s %d" % (L, c, "JS" if js else "SSR", width)
                    if js:
                        badge_done(p, "[data-live-badge=leader]")
                    grid = p.locator("[data-f=grid] .st")
                    gl = [(grid.nth(i).locator("span").first.inner_text().strip(), grid.nth(i).locator("b").inner_text()) for i in range(grid.count())]
                    gt = dict(gl)
                    for k in ("win_rate", "roi"):
                        want_nd = k in nulls
                        got = next((v for lb, v in gl if lb.startswith(lab[k])), None)
                        ok(got is not None, "%s cell kept %s %s" % (k, tagj, gt))
                        ok((got == nd) if want_nd else (got != nd), "%s %s: %s" % (k, tagj, got))
                    main = p.inner_text("main")
                    ok(not FAKE.search(main), "no fake numbers %s: %s" % (tagj, FAKE.search(main)))
                    md = p.get_attribute('meta[name="description"]', "content")
                    ld = p.locator('script[type="application/ld+json"]').first.text_content()
                    for k in nulls:
                        word = {"win_rate": "胜率" if Z else "win rate", "roi": "收益率" if Z else "ROI"}[k]
                        ok(word not in md, "meta desc no %s %s: %s" % (k, tagj, md))
                        ok(word not in p.inner_text("[data-f=desc]"), "desc no %s %s" % (k, tagj))
                        ok('"propertyID":"%s"' % k not in ld, "JSON-LD no %s %s" % (k, tagj))
                    ok(not FAKE.search(md) and not re.search(r"NaN|undefined|null", ld), "meta/LD clean " + tagj)
                    if c == "b":
                        # metrics.settled_capped：已结算市场固定「20,000+」，原始 19,991 不出现在格子、摘要、meta、JSON-LD
                        rmv = next((v for lb, v in gl if lb.startswith("已结算市场" if Z else "Resolved markets")), None)
                        ok(rmv == "20,000+", "capped resolved %s: %s" % (tagj, rmv))
                        ok("20,000+" in md and "20,000+" in ld, "capped in meta/LD " + tagj)
                        ok(not re.search(r"19,991|19991", main + md + ld), "raw capped count hidden " + tagj)
                    ok(("66.0" if c == "b" else "61.3" if c == "c" else "73.9" if c == "d" else None) in (p.inner_text("[data-f=checks]") or "") if c != "e"
                       else p.locator("[data-f=checks] .sc").count() == 0, "score %s" % tagj)
                    fig = p.locator("[data-f=spark] figure")
                    if not js:
                        ok(fig.count() == 0, "SSR spark empty " + tagj)
                    elif c == "b":
                        ok(p.locator("[data-f=spark] svg path").count() == 1, "curve drawn " + tagj)
                    else:
                        # 曲线 null / []：整块隐藏，不留空卡片、不画坐标轴；下一块（facts / CTA）紧接网格
                        ok(fig.count() == 0 and p.locator("[data-f=spark] *").count() == 0, "curve area hidden " + tagj)
                        ok(p.locator("[data-f=spark]").bounding_box() is None or p.locator("[data-f=spark]").bounding_box()["height"] == 0, "curve host zero height " + tagj)
                        ok(nd not in p.inner_text("[data-f=spark]"), "no curve ND card " + tagj)
                    hs = p.evaluate("()=>document.documentElement.scrollWidth-innerWidth")
                    ok(hs <= 0, "no hscroll %s %s" % (tagj, hs))
                    ok(not errs, "no page errors %s %s" % (tagj, errs))
                    ctx.close()
    # copy-engine #89 index_basis：服务端渲染（关 JS）和客户端刷新后各查一遍，两边结果要一致
    IBX = {
        "zh": dict(settled="已结算市场（全部历史）", trades="成交笔数（全部历史）", tag="第三方口径", cap="第三方只统计到这个数", win="胜率、收益率按近 90 天",
                   old="统计窗口：近 90 天", quiet="近 30 天无成交", last="最近一次成交", nd="无数据"),
        "en": dict(settled="Resolved markets (all time)", trades="Trades (all time)", tag="third-party basis", cap="Third-party data stops counting here",
                   win="Win rate and ROI: last 90 days", old="Window: last 90 days", quiet="No trades in the last 30 days", last="Last trade", nd="No data"),
    }
    WANT = {  # 地址 → (已结算, 成交笔数, 是否第三方, 是否封顶, 有最近成交, 近30天无成交)
        "6": ("1,842", "9,310", False, False, True, True),
        "7": ("20,000+", "20,000+", True, True, False, False),
        "8": ("3,296", "4,120", True, False, False, False),
        "9": (None, None, False, False, None, False),   # indexable=false；数字见 mock
        "a": ("ND", "ND", True, False, False, False),
    }

    def stat(p, key):
        loc = p.locator("[data-f=grid] [data-f=%s]" % key)
        if loc.count() != 1:
            return None
        return {"label": loc.locator("span").first.inner_text(), "val": loc.locator("b").inner_text(),
                "vtitle": loc.locator("b").get_attribute("title"), "tag": [loc.locator(".ck").nth(i).inner_text() for i in range(loc.locator(".ck").count())],
                "ttitle": loc.locator(".ck").first.get_attribute("title") if loc.locator(".ck").count() else None}

    def check_ib(p, L, c, mode):
        X = IBX[L]; w = WANT[c]; t = text(p); tag = "%s %s %s" % (mode, L, c)
        ok(not BAD.search(t), "forbidden " + tag + str(BAD.search(t)))
        ok("未知" not in t and "Unknown" not in t, "no unknown " + tag)
        se, tr = stat(p, "settled"), stat(p, "trades")
        ok(se and tr, "settled/trades cells present " + tag)
        ok(p.locator("[data-f=grid] .st").filter(has_text=re.compile("^" + ("已结算市场" if L == "zh" else "Resolved markets") + "$")).count() == 0, "old resolved cell replaced " + tag)
        ok(se["label"].startswith(X["settled"]) and tr["label"].startswith(X["trades"]), "labels " + tag + str((se, tr)))
        if w[0] is not None:
            for d, want in ((se, w[0]), (tr, w[1])):
                ok(d["val"] == (X["nd"] if want == "ND" else want), "value %s %s" % (tag, d))
                ok((X["tag"] in d["tag"]) == w[2], "third-party basis tag %s %s" % (tag, d))
                ok((d["vtitle"] == X["cap"] and d["ttitle"] == X["cap"]) if w[3] else (d["vtitle"] is None and d["ttitle"] is None), "cap hover %s %s" % (tag, d))
        ok("—" not in p.inner_text("[data-f=grid]"), "no dash in grid " + tag)
        if c == "7":
            # 封顶原始数 19,991 / 19,998 不出现在页面、meta、JSON-LD 任何地方
            raw = t + (p.get_attribute('meta[name="description"]', "content") or "") + (p.locator('script[type="application/ld+json"]').first.text_content() or "")
            ok(not re.search(r"19,99\d|1999\d", raw), "raw capped count hidden " + tag)
        asof = p.inner_text("[data-f=asof]")
        ok(X["win"] in asof and X["old"] not in asof, "window wording %s %s" % (tag, asof))
        facts = p.inner_text("[data-f=facts]") if p.locator("[data-f=facts]").count() else ""
        if w[4] is not None:
            ok((X["last"] in facts) == w[4], "last trade row %s %s" % (tag, facts))
        ok((X["quiet"] in p.inner_text("[data-f=checks]")) == w[5], "quiet tag " + tag)
        robots = p.locator('meta[name="robots"]')
        if c == "9":
            ok(robots.count() == 1 and "noindex" in robots.get_attribute("content"), "noindex " + tag)
        else:
            ok(robots.count() == 0, "indexable has no robots meta " + tag)

    for L in ("zh", "en"):
        for c in "6789a":
            ctx = b.new_context(viewport={"width": 1280, "height": 900}, java_script_enabled=False, timezone_id="Asia/Shanghai")
            p = ctx.new_page()
            r = p.goto(SITE + "/%s/leader/%s/" % (L, A(c)))
            ok(r.status == 200, "leader %s %s 200 (indexable=false still 200)" % (L, c))
            if c == "9":
                ok("noindex" in (r.headers.get("x-robots-tag") or ""), "x-robots-tag noindex")
            check_ib(p, L, c, "ssr")
            ctx.close()
            ctx, p = open_page(b, "/%s/leader/%s/" % (L, A(c)))
            badge_done(p, "[data-live-badge=leader]")
            check_ib(p, L, c, "client")
            ctx.close()
    # 没有 index_basis 的地址：旧标签、旧窗口说明不变（服务端、客户端都查）
    for L in ("zh", "en"):
        for js in (False, True):
            ctx = b.new_context(viewport={"width": 1280, "height": 900}, java_script_enabled=js, timezone_id="Asia/Shanghai")
            ctx.add_init_script("window.WL_API=%r;" % API)
            p = ctx.new_page(); p.goto(SITE + "/%s/leader/%s/" % (L, A("1")))
            if js:
                badge_done(p, "[data-live-badge=leader]")
            g = p.inner_text("[data-f=grid]")
            ok(IBX[L]["settled"] not in g and IBX[L]["trades"] not in g and ("已结算市场" if L == "zh" else "Resolved markets") in g, "no ib keeps old grid %s %s" % (L, js))
            ok(IBX[L]["old"] in p.inner_text("[data-f=asof]"), "no ib keeps old window %s %s" % (L, js))
            ctx.close()
    # 手机 390：index_basis 格子带标签时不撑出横向滚动
    for L in ("zh", "en"):
        for c in "7a":
            ctx, p = open_page(b, "/%s/leader/%s/" % (L, A(c)), width=390)
            badge_done(p, "[data-live-badge=leader]")
            r = p.evaluate("()=>({dw:document.documentElement.scrollWidth,vw:innerWidth})")
            ok(r["dw"] <= r["vw"], "leader 390 no horizontal scroll %s %s %s" % (L, c, r))
            ctx.close()

    # 手机 390：标签挂到地址下，评分列不被挤出可视区
    for L in ("zh", "en"):
        ctx, p = open_page(b, "/%s/leaderboard/" % L, width=390)
        badge_done(p, "[data-live-badge=leaderboard]")
        r = p.evaluate("""()=>{const t=document.querySelector('[data-live=leaderboard] table');const w=t.parentElement.getBoundingClientRect();
          const row=[...t.querySelectorAll('tbody tr')].find(tr=>tr.querySelector('.ck-m'));if(!row)return null;
          const sc=row.children[2].getBoundingClientRect();const m=row.querySelector('.ck-m');
          return {right:sc.right,wr:w.right,m:getComputedStyle(m).display,cell:[...row.querySelectorAll('td.r .ck')].every(e=>getComputedStyle(e).display==='none')}}""")
        ok(r and r["m"] != "none" and r["cell"], "mobile tags under address " + L + " " + str(r))
        ok(r and r["right"] <= r["wr"] + 0.5, "mobile score column visible " + L + " " + str(r))
        ctx.close()

    # 手机 390：表头不折行（「综合评分」/ Score / Win rate），表格不超出容器，页面不横向滚动
    for L in ("zh", "en"):
        ctx, p = open_page(b, "/%s/leaderboard/" % L, width=390)
        badge_done(p, "[data-live-badge=leaderboard]")
        r = p.evaluate("""()=>{const t=document.querySelector('[data-live=leaderboard] table');const w=t.parentElement;
          const ths=[...t.querySelectorAll('thead th')].filter(th=>getComputedStyle(th).display!=='none');
          const lh=parseFloat(getComputedStyle(ths[0]).lineHeight)||16;
          const hs=ths.map(th=>{const c=getComputedStyle(th);return [th.innerText,th.clientHeight-parseFloat(c.paddingTop)-parseFloat(c.paddingBottom)]});
          const sc=t.querySelector('thead th:nth-child(3)').getBoundingClientRect();
          return {hs,lh,tw:t.scrollWidth,ww:w.clientWidth,dw:document.documentElement.scrollWidth,vw:innerWidth,scR:sc.right,wR:w.getBoundingClientRect().right}}""")
        ok(all(h <= r["lh"] * 1.5 for _, h in r["hs"]), "mobile headers on one line " + L + " " + str(r["hs"]))
        ok(r["tw"] <= r["ww"] + 1, "mobile table fits wrapper " + L + " " + str(r))
        ok(r["dw"] <= r["vw"], "no page horizontal scroll " + L + " " + str(r))
        ok(r["scR"] <= r["wR"] + 0.5, "mobile score header visible " + L)
        ctx.close()

    # 摘要句数据来源。SSR：看 meta 和正文；客户端：浏览器里把接口的 source 反过来，确认 site-live.js 自己按 source 写结尾
    SRC = {"zh": ("数据来自第三方，Wakeloom 还没自己核对。", "数据来自链上公开记录。"),
           "en": ("Data comes from a third party and hasn't been verified by Wakeloom yet.", "Data from public on-chain records.")}
    for L in ("zh", "en"):
        third_s, chain_s = SRC[L]
        for c, is_third in (("2", True), ("4", True), ("1", False), ("5", False)):
            want, other = (third_s, chain_s) if is_third else (chain_s, third_s)
            ctx, p = open_page(b, "/%s/leader/%s/" % (L, A(c)))
            badge_done(p, "[data-live-badge=leader]")
            md = p.get_attribute('meta[name="description"]', "content")
            ok(want in md and other not in md and md.endswith("尚未正式上线。" if L == "zh" else "Not yet launched."), "SSR meta desc %s %s: %s" % (L, c, md))
            d = p.inner_text("[data-f=desc]")
            ok(d.endswith(want) and other not in d, "desc %s %s: %s" % (L, c, d))
            ctx.close()
            ctx = b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Shanghai")
            ctx.add_init_script("window.WL_API=%r;" % API)
            def make_flip(new_src):
                def flip(route):
                    r = route.fetch()
                    j = r.json()
                    j["leader"]["source"] = new_src
                    route.fulfill(response=r, body=json.dumps(j))
                return flip
            ctx.route(re.compile(r".*/v1/public/leaders/0x[0-9a-f]{40}$"), make_flip("local" if is_third else "polymarketscan"))
            p = ctx.new_page()
            p.goto(SITE + "/%s/leader/%s/" % (L, A(c)), wait_until="domcontentloaded")
            badge_done(p, "[data-live-badge=leader]")
            try:
                p.wait_for_function("s=>{const e=document.querySelector('[data-f=desc]');return e&&e.textContent.endsWith(s)}", arg=other, timeout=10000)
            except Exception:
                pass
            d = p.inner_text("[data-f=desc]")
            ok(d.endswith(other) and want not in d, "client desc follows source %s %s: %s" % (L, c, d))
            ctx.close()

    # leader 页失败 + 异地时区
    ctx, p = open_page(b, "/zh/leader/%s/" % A("2"), api=API + "/hang", timeout_ms=400, tz="America/New_York")
    badge_done(p, "[data-live-badge=leader]")
    ok(FAIL["zh"] in p.inner_text("[data-live-badge=leader]"), "leader fail text")
    ok("2026-10-28 03:09（UTC−4）" in p.inner_text("[data-f=asof]"), "asof localized on fail, NY: " + p.inner_text("[data-f=asof]"))
    ok("第三方口径" in p.inner_text("[data-f=grid]"), "SSR labels survive client failure")
    ctx.close()
    b.close()

print("site-live browser tests ok (%d checks)" % n)
