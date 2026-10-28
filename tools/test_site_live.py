"""site-live.js 浏览器测试（Playwright，无头 Chromium）。

先起 mock 接口和本地预览：
  python3 tools/mock_public_api.py 8891 &
  BFF_ORIGIN=http://127.0.0.1:8891 PORT=8876 node tools/preview-www.mjs &
再跑：python3 tools/test_site_live.py [http://127.0.0.1:8876] [http://127.0.0.1:8891]
覆盖：成功后角标隐藏、加载失败/超时文案、10 秒超时、标注、收益率缺数据、曲线隐藏、时区标签。
"""
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
        ok(rows.count() == 6, "6 rows")
        third = "第三方口径" if lang == "zh" else "third-party basis"
        chk = "部分检查未完成" if lang == "zh" else "Some checks pending"
        nd = "无数据" if lang == "zh" else "No data"
        r0, r1, r2, r3 = (rows.nth(i).inner_text() for i in range(4))
        ok(third not in r0 and chk not in r0, "local row has no tags")
        ok(third in r1 and chk in r1, "third-party row has both tags")
        ok(third not in r2 and chk not in r2, "row without fields unchanged")
        ok(nd in r3 and "0.0%" not in r3, "third-party roi 0 with realized pnl -> ND")
        tip = rows.nth(1).locator(".ck").first.get_attribute("title") or ""
        ok("集中度" in tip or "concentration" in tip, "checks tag tooltip")
        foot = p.locator("[data-f=roi-note]")
        ok(foot.count() == 1, "roi footnote once")
        ok(("不含浮动" in foot.inner_text()) if lang == "zh" else ("excluding unrealized" in foot.inner_text()), "footnote text")
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
        ok("2026-10-22 19:24（UTC+8）" in meta, "snapshot asof localized on fail: " + meta)
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

    # leader 页失败 + 异地时区
    ctx, p = open_page(b, "/zh/leader/%s/" % A("2"), api=API + "/hang", timeout_ms=400, tz="America/New_York")
    badge_done(p, "[data-live-badge=leader]")
    ok(FAIL["zh"] in p.inner_text("[data-live-badge=leader]"), "leader fail text")
    ok("2026-10-28 03:09（UTC−4）" in p.inner_text("[data-f=asof]"), "asof localized on fail, NY: " + p.inner_text("[data-f=asof]"))
    ok("第三方口径" in p.inner_text("[data-f=grid]"), "SSR labels survive client failure")
    ctx.close()
    b.close()

print("site-live browser tests ok (%d checks)" % n)
