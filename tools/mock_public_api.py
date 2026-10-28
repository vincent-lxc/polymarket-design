"""本地 mock 公开接口，给 site-live.js 浏览器测试和标注截图用。不碰现网。

python3 tools/mock_public_api.py 8791
路径前缀：/hang/... 永不返回（测超时）；/fail/... 返回 503；其余正常。
地址约定（只在 mock 里）：
  0x1111… 自算地址（source=local）
  0x2222… 第三方 + 部分检查未完成，收益率正常
  0x3333… 疑似做市（suspected_market_maker=true，#87 未上线，只能 mock）
  0x4444… 第三方，roi=0 但已实现盈亏不为 0，曲线是平的
  0x5555… 字段全缺（现网 #85 之前的形状）
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
    return base


CURVES = {"1": curve([0, 3200, 2900, 8100, 15400, 21900, 30500, 41200, 48210.5]),
          "2": curve([0, 1500, 900, 4200, 7600, 9100, 12000]),
          "3": curve([0, 40, 80, 120, 160, 210, 250]),
          "4": curve([322.54, 322.54]),
          "5": curve([0, 500, 1200, 900, 2400])}


def board():
    rows = []
    for i, c in enumerate(["1", "2", "5", "4", "1", "2"]):
        l = leader(c)
        l["address"] = "0x" + (c * 39) + str(i)
        l["user_name"] = None
        l["smart_score"] = 80 - i * 3.3
        if c == "5":
            for k in ("source", "checks_incomplete", "skipped_checks", "suspected_market_maker"):
                l.pop(k, None)
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
                if len(a) != 42 or a != addr(c) or c not in "12345":
                    return self.send(404, {"error": "not found"})
                if kind == "leader":
                    l = leader(c)
                    if c == "5":
                        for k in ("source", "checks_incomplete", "skipped_checks", "suspected_market_maker"):
                            l.pop(k, None)
                    return self.send(200, {"source": "stats_table", "leader": l})
                return self.send(200, {"address": a, "as_of": ASOF, "equity_curve": CURVES[c]})
        self.send(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
