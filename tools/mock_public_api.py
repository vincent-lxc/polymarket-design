"""本地 mock 公开接口，给 site-live.js 浏览器测试和标注截图用。不碰现网。

python3 tools/mock_public_api.py 8791
路径前缀：/hang/... 永不返回（测超时）；/fail/... 返回 503；其余正常。
地址约定（只在 mock 里）：
  0x1111… 自算地址（source=local）
  0x2222… 第三方 + 部分检查未完成，收益率正常
  0x3333… 疑似做市（suspected_market_maker=true，#87 未上线，只能 mock）
  0x4444… 第三方，roi=0 但已实现盈亏不为 0，曲线是平的
  0x5555… 字段全缺（现网 #85 之前的形状）
copy-engine #90 的 null 情况（字段名和位置按 #90 openapi / BFF.md）：
  0xbbbb… 第三方，已结算数封顶：win_rate/roi/profit_factor 为 null（third_party_capped_sample），settled_capped/trades_capped 在 metrics 里
  0xcccc… 第三方，roi 缺省 0 → null（third_party_default），已实现盈亏不为 0；曲线 null（scan_summary_not_series）
  0xdddd… 自算，曲线 null（curve_metric_mismatch），roi null（no_invested），smart_score 有值
  0xeeee… 自算，曲线空数组，win_rate null（no_settled_markets），smart_score null（not_scored）
  以下带 copy-engine #89 的 index_basis（门槛读的成交数、已结算数）：
  0x6666… 自算地址，index_basis 正常，近 30 天无成交（no_trades_30d=true）
  0x7777… 第三方，成交数、已结算数都封顶（20,000+），没有最近成交时间
  0x8888… 第三方，没封顶，last_trade_at / no_trades_30d 为 null（隐藏这一行）
  0x9999… 自算地址，不可收录（indexable=false，reason=below_min_settled），页面仍 200
  0xaaaa… 第三方没给成交数、已结算数（null，reasons=third_party_missing）
"""
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ASOF = "2026-10-28T07:09:25.000Z"


def addr(c):
    return "0x" + c * 40


def curve(vals):
    days = ["2026-10-%02d" % d for d in range(13, 13 + len(vals))]
    return [{"t": d + "T00:00:00.000Z", "equity": v, "cum_pnl": v, "realized_pnl": v, "unrealized_pnl": 0} for d, v in zip(days, vals)]


def basis(c):
    th = {"min_trades": 50, "min_settled": 20}
    if c == "6":
        return {"source": "local", "trades": 9310, "trades_capped": False, "settled": 1842, "settled_capped": False,
                "last_trade_at": "2026-09-12T03:20:00.000Z", "no_trades_30d": True, "thresholds": th, "reason": None, "reasons": {}}
    if c == "7":
        # 原始数故意给 19991 / 19998：封顶时页面只能写固定「20,000+」，不能露出原始数（Blake 2026-10-28）
        return {"source": "polymarketscan", "trades": 19998, "trades_capped": True, "settled": 19991, "settled_capped": True,
                "last_trade_at": None, "no_trades_30d": None, "thresholds": th, "reason": None,
                "reasons": {"last_trade_at": "third_party_no_trade_history"}}
    if c == "8":
        return {"source": "polymarketscan", "trades": 4120, "trades_capped": False, "settled": 3296, "settled_capped": False,
                "last_trade_at": None, "no_trades_30d": None, "thresholds": th, "reason": None,
                "reasons": {"last_trade_at": "third_party_no_trade_history"}}
    if c == "9":
        return {"source": "local", "trades": 133, "trades_capped": False, "settled": 12, "settled_capped": False,
                "last_trade_at": "2026-10-26T09:05:00.000Z", "no_trades_30d": False, "thresholds": th, "reason": "below_min_settled", "reasons": {}}
    if c == "a":
        return {"source": "polymarketscan", "trades": None, "trades_capped": False, "settled": None, "settled_capped": False,
                "last_trade_at": None, "no_trades_30d": None, "thresholds": th, "reason": "below_min_trades",
                "reasons": {"last_trade_at": "third_party_no_trade_history", "trades": "third_party_missing", "settled": "third_party_missing"}}
    return None


def leader(c):
    a = addr(c)
    base = {
        "address": a, "indexable": True, "updated_at": ASOF, "window": "90d",
        "win_rate": 0.62, "roi": 0.184, "max_drawdown": 0.071, "smart_score": 71.4,
        "metrics": {"win_rate": 0.62, "roi": 0.184, "max_drawdown": 0.071, "resolved_markets": 214,
                    "realized_pnl": 48210.5, "pnl_30d": 6120.0, "volume_usd": 912000, "last_trade_at": "2026-10-27T22:41:00.000Z"},
    }
    if c == "1":
        base.update(source="local", checks_incomplete=False, skipped_checks=[], suspected_market_maker=False)
    elif c == "2":
        base.update(source="polymarketscan", checks_incomplete=True,
                    skipped_checks=["top_event_share", "median_hold_minutes", "last_trade_at", "mm_score", "wash_score"],
                    suspected_market_maker=None, smart_score=64.9)
    elif c == "3":
        base.update(source="local", checks_incomplete=False, skipped_checks=[], suspected_market_maker=True, smart_score=77.7)
    elif c == "4":
        base.update(source="polymarketscan", checks_incomplete=True, skipped_checks=["mm_score", "wash_score"],
                    roi=0, smart_score=58.2)
        base["metrics"].update(roi=0, realized_pnl=285432.38)
    elif c == "b":
        base.update(source="polymarketscan", checks_incomplete=True, skipped_checks=["mm_score", "wash_score"],
                    win_rate=None, roi=None, smart_score=66.0)
        base["metrics"].update(win_rate=None, roi=None, profit_factor=None, resolved_markets=19991, trade_count=20000,
                               settled_capped=True, trades_capped=True, from_scan=1)
        base["metric_reasons"] = {"win_rate": "third_party_capped_sample", "roi": "third_party_capped_sample",
                                  "profit_factor": "third_party_capped_sample"}
    elif c == "c":
        base.update(source="polymarketscan", checks_incomplete=True, skipped_checks=["mm_score", "wash_score"],
                    roi=None, smart_score=61.3)
        base["metrics"].update(roi=None, profit_factor=1.42, realized_pnl=12840.0, from_scan=1,
                               settled_capped=False, trades_capped=False)
        base["metric_reasons"] = {"roi": "third_party_default"}
    elif c == "d":
        base.update(source="local", checks_incomplete=False, skipped_checks=[], suspected_market_maker=False, smart_score=73.9,
                    roi=None)
        base["metrics"].update(roi=None)
        base["metric_reasons"] = {"roi": "no_invested"}
    elif c == "e":
        base.update(source="local", checks_incomplete=False, skipped_checks=[], suspected_market_maker=False,
                    win_rate=None, smart_score=None)
        base["metrics"].update(win_rate=None, profit_factor=None, resolved_markets=0)
        base["metric_reasons"] = {"win_rate": "no_settled_markets", "profit_factor": "no_settled_markets"}
        base["reasons"] = {"smart_score": "not_scored"}
    ib = basis(c)
    if ib is not None:
        base["index_basis"] = ib
        base.update(source=ib["source"], checks_incomplete=ib["source"] != "local", skipped_checks=["mm_score", "wash_score"] if ib["source"] != "local" else [],
                    suspected_market_maker=False)
        if c == "9":
            base["indexable"] = False
            base["smart_score"] = None
    return base


CURVES = {"1": curve([0, 3200, 2900, 8100, 15400, 21900, 30500, 41200, 48210.5]),
          "2": curve([0, 1500, 900, 4200, 7600, 9100, 12000]),
          "3": curve([0, 40, 80, 120, 160, 210, 250]),
          "4": curve([322.54, 322.54]),
          "5": curve([0, 500, 1200, 900, 2400]),
          "b": curve([0, 900, 2100, 1800, 3900, 5200]),
          "c": None,
          "d": None,
          "e": []}
CURVE_REASON = {"c": "scan_summary_not_series", "d": "curve_metric_mismatch", "e": "no_points_in_window"}
for _c in "6789a":
    CURVES[_c] = curve([0, 900, 2100, 1800, 3900, 5200, 6100])


def board():
    rows = []
    for i, c in enumerate(["1", "2", "5", "4", "1", "2", "6", "7", "a"]):
        l = leader(c)
        l["address"] = "0x" + (c * 39) + str(i)
        l["user_name"] = None
        l["smart_score"] = 80 - i * 3.3
        if c == "5":
            for k in ("source", "checks_incomplete", "skipped_checks", "suspected_market_maker"):
                l.pop(k, None)
        rows.append(l)
    # #90：封顶行比例为 null 但有分；未评分行 smart_score 为 null，排在最后
    for i, c in enumerate(["b", "e"]):
        l = leader(c)
        l["address"] = "0x" + (c * 39) + str(6 + i)
        l["user_name"] = None
        rows.append(l)
    return {"source": "stats_table", "leaderboard": {"as_of": ASOF, "window": "90d", "leaders": rows}}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "*")
        self.end_headers()

    def do_GET(self):
        p = self.path.split("?")[0]
        if p.startswith("/hang/"):
            time.sleep(60)
            return
        if p.startswith("/fail/"):
            return self.send(503, {"error": "unavailable"})
        if p == "/v1/public/leaderboard":
            return self.send(200, board())
        for pre, kind in (("/v1/public/leaders/", "leader"), ("/v1/public/wallets/", "wallet")):
            if p.startswith(pre):
                a = p[len(pre):].strip("/").lower()
                c = a[2:3]
                if len(a) != 42 or a != addr(c) or c not in "123456789abcde":
                    return self.send(404, {"error": "not found"})
                if kind == "leader":
                    l = leader(c)
                    if c == "5":
                        for k in ("source", "checks_incomplete", "skipped_checks", "suspected_market_maker"):
                            l.pop(k, None)
                    return self.send(200, {"source": "stats_table", "leader": l})
                w = {"address": a, "as_of": ASOF, "equity_curve": CURVES[c]}
                if c in CURVE_REASON:
                    w["reasons"] = {"equity_curve": CURVE_REASON[c]}
                return self.send(200, w)
        self.send(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
