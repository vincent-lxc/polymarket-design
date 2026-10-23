/* site-live.js · 官网公开数据客户端刷新。缺值显示「无数据」/ No data，不补 0。 */
(function () {
  var API = (window.WL_API || "https://api.wakeloom.com").replace(/\/$/, "");
  var lang = document.documentElement.lang.indexOf("zh") === 0 ? "zh" : "en";
  var ND = lang === "zh" ? "无数据" : "No data";
  var CAT = { politics: "政治", geopolitics: "地缘政治", tech: "科技", sports: "体育", crypto: "加密货币", economy: "经济", finance: "金融", business: "商业", culture: "文化", "pop-culture": "文化娱乐", weather: "天气", science: "科学", world: "国际", elections: "选举", esports: "电竞", mentions: "言论" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function short(a) {
    return a && a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a || "";
  }
  function pct(x, sign, d) {
    if (x == null || !isFinite(x)) return null;
    d = d == null ? 1 : d;
    var v = x * 100;
    var s = sign && v > 0 ? "+" : v < 0 ? "−" : "";
    return s + Math.abs(v).toFixed(d) + "%";
  }
  function usd(x, sign) {
    if (x == null || !isFinite(x)) return null;
    var s = sign && x > 0 ? "+" : x < 0 ? "−" : "";
    var n = Math.abs(x);
    return s + "$" + (n < 100 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString("en-US"));
  }
  function num(x) {
    return x == null || !isFinite(x) ? null : Number(x).toLocaleString("en-US");
  }
  function tone(x) {
    return x == null ? "" : x > 0 ? "up" : x < 0 ? "dn" : "";
  }
  /* 接口时间按 UTC 解析；显示用浏览器本地时区，不写死城市名 */
  function parseUtc(iso) {
    if (iso == null || iso === "") return null;
    if (typeof iso === "number") {
      var dn = new Date(iso);
      return isNaN(dn) ? null : dn;
    }
    var s = String(iso).trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      var dn2 = new Date(Number(s));
      return isNaN(dn2) ? null : dn2;
    }
    if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
      var d0 = new Date(s);
      return isNaN(d0) ? null : d0;
    }
    s = s.replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var d1 = new Date(s + "T00:00:00Z");
      return isNaN(d1) ? null : d1;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      var d2 = new Date(s + "Z");
      return isNaN(d2) ? null : d2;
    }
    var d3 = new Date(s);
    return isNaN(d3) ? null : d3;
  }
  function bj(iso) {
    var d = parseUtc(iso);
    if (!d) return null;
    var p = Object.fromEntries(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .formatToParts(d)
        .map(function (x) {
          return [x.type, x.value];
        })
    );
    return p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute;
  }
  function dname(l, a) {
    var n = (l && (l.user_name || l.name)) || "";
    a = (a || (l && l.address) || "").toLowerCase();
    if (!n || /^0x/i.test(n) || /-\d{10,}$/.test(n) || n.length > 24 || (a && n.toLowerCase().indexOf(a.slice(2, 8)) >= 0)) return short(a);
    return "@" + n;
  }
  function cell(v, cls) {
    return v != null ? '<td class="r num ' + (cls || "") + '">' + esc(v) + "</td>" : '<td class="r"><span class="nd">' + ND + "</span></td>";
  }
  function cellHm(v, cls) {
    return v != null ? '<td class="r num hm ' + (cls || "") + '">' + esc(v) + "</td>" : '<td class="r hm"><span class="nd">' + ND + "</span></td>";
  }
  /* 与 App 公开榜同一口径：GET /v1/public/leaderboard?metric=smart_score，本地再按综合评分降序排一次。 */
  var LB = "/v1/public/leaderboard?window=90d&metric=smart_score&limit=50";
  function scoreText(l) {
    var s = l && l.smart_score;
    return typeof s === "number" && isFinite(s) ? s.toFixed(1) : null;
  }
  function sortBySmartScore(list) {
    return (list || [])
      .map(function (l, i) {
        return { l: l, i: i };
      })
      .sort(function (a, b) {
        var as = typeof a.l.smart_score === "number" && isFinite(a.l.smart_score) ? a.l.smart_score : null;
        var bs = typeof b.l.smart_score === "number" && isFinite(b.l.smart_score) ? b.l.smart_score : null;
        if (as == null && bs == null) return a.i - b.i;
        if (as == null) return 1;
        if (bs == null) return -1;
        if (bs !== as) return bs - as;
        return a.i - b.i;
      })
      .map(function (x) {
        return x.l;
      });
  }
  function fillHead(table, labels) {
    var tr = table && table.querySelector("thead tr");
    if (!tr) return;
    tr.innerHTML = labels
      .map(function (c) {
        return '<th class="' + (c[1] || "") + '">' + esc(c[0]) + "</th>";
      })
      .join("");
  }
  function boardMeta(n, asof) {
    if (lang === "zh") return "数据截至 " + (asof || ND) + " · 按综合评分 · 共 " + n + " 位";
    return "Data as of " + (asof || ND) + " · Ranked by score · " + n + " traders";
  }
  var UPDATING = lang === "zh" ? "数据更新中" : "Data updating";

  async function get(path) {
    var res = await fetch(API + path, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function setBadge(el, state, text) {
    if (!el) return;
    el.className = "live-badge " + (state || "");
    el.innerHTML = "<i></i><span>" + esc(text) + "</span>";
  }

  function rowFull(i, l) {
    var m = l.metrics || {};
    var a = (l.address || "").toLowerCase();
    var nm = dname(l, a);
    return (
      "<tr><td class=\"num mu\">" +
      i +
      '</td><td><a href="/' +
      lang +
      "/leader/" +
      a +
      '/"><b>' +
      esc(nm) +
      '</b></a><div class="mu xs num">' +
      esc(short(a)) +
      "</div></td>" +
      cell(scoreText(l)) +
      cell(pct(m.win_rate, false, 0)) +
      cell(pct(m.roi, true), tone(m.roi)) +
      cellHm(pct(m.max_drawdown)) +
      cellHm(num(m.resolved_markets)) +
      cellHm(usd(m.realized_pnl, true), tone(m.realized_pnl)) +
      "</tr>"
    );
  }
  function rowShort(i, l) {
    var m = l.metrics || {};
    var a = (l.address || "").toLowerCase();
    var nm = dname(l, a);
    return (
      "<tr><td class=\"num mu\">" +
      i +
      '</td><td><a href="/' +
      lang +
      "/leader/" +
      a +
      '/"><b>' +
      esc(nm) +
      '</b></a><div class="mu xs num">' +
      esc(short(a)) +
      "</div></td>" +
      cell(scoreText(l)) +
      cell(pct(m.win_rate, false, 0)) +
      cell(pct(m.roi, true), tone(m.roi)) +
      "</tr>"
    );
  }

  function spark(curve) {
    var pts = (curve || [])
      .map(function (c) {
        return [c.t, c.equity];
      })
      .filter(function (p) {
        return typeof p[1] === "number" && isFinite(p[1]);
      });
    if (pts.length < 2) return "";
    var vs = pts.map(function (p) {
      return p[1];
    });
    var lo = Math.min.apply(null, vs),
      hi = Math.max.apply(null, vs),
      rng = hi - lo || 1;
    var W = 640,
      H = 160;
    var d = pts
      .map(function (p, i) {
        return (i === 0 ? "M" : "L") + (i * (W / (pts.length - 1))).toFixed(1) + "," + (H - 8 - ((p[1] - lo) / rng) * (H - 16)).toFixed(1);
      })
      .join(" ");
    var cap = lang === "zh" ? "全部历史收益曲线（已实现 + 浮动，美元）" : "All-time equity curve (realized + unrealized, USD)";
    var t0 = bj(pts[0][0]),
      t1 = bj(pts[pts.length - 1][0]);
    var rngt = t0 && t1 ? t0.slice(0, 10) + " – " + t1.slice(0, 10) : "";
    return (
      '<figure class="card spark"><figcaption>' +
      esc(cap) +
      '<span class="mu">' +
      esc(rngt) +
      '</span></figcaption><svg viewBox="0 0 ' +
      W +
      " " +
      H +
      '" preserveAspectRatio="none" role="img" aria-label="' +
      esc(cap) +
      '"><path d="' +
      d +
      '" fill="none" stroke="#FF6A1F" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="sp-y num mu"><span>' +
      esc(usd(hi) || "") +
      "</span><span>" +
      esc(usd(lo) || "") +
      "</span></div></figure>"
    );
  }

  function stat(label, val, cls) {
    if (val == null) return "";
    return '<div class="st"><span>' + esc(label) + "</span>" + '<b class="num ' + (cls || "") + '">' + esc(val) + "</b></div>";
  }

  async function refreshLeaderboard() {
    var tbody = document.querySelector("[data-live=leaderboard] tbody");
    var meta = document.querySelector("[data-live-meta=leaderboard]");
    var badge = document.querySelector("[data-live-badge=leaderboard]");
    if (!tbody) return;
    setBadge(badge, "load", lang === "zh" ? "刷新中…" : "Refreshing…");
    tbody.classList.add("live-skel");
    try {
      fillHead(
        tbody.closest("table"),
        lang === "zh"
          ? [["#", "num"], ["地址", ""], ["综合评分", "r"], ["胜率", "r"], ["收益率", "r"], ["最大回撤", "r hm"], ["已结算", "r hm"], ["已实现", "r hm"]]
          : [["#", "num"], ["Wallet", ""], ["Score", "r"], ["Win rate", "r"], ["ROI", "r"], ["Max drawdown", "r hm"], ["Resolved", "r hm"], ["Realized", "r hm"]]
      );
      var j = await get(LB);
      var b = j.leaderboard || {};
      var leaders = sortBySmartScore(b.leaders || []);
      tbody.innerHTML = leaders.map(function (l, i) {
        return rowFull(i + 1, l);
      }).join("");
      tbody.classList.remove("live-skel");
      if (meta) {
        var asof = bj(b.as_of);
        meta.textContent = boardMeta(leaders.length, asof);
        meta.setAttribute("data-asof", b.as_of || "");
        meta.setAttribute("data-sort", "smart_score");
      }

      /* 排行榜页无 recent 块；勿引用未定义的 root/d，否则成功刷新后仍会落入 catch 显示红字 */
      setBadge(badge, "", UPDATING);
    } catch (e) {
      tbody.classList.remove("live-skel");
      setBadge(badge, "err", lang === "zh" ? "接口暂不可用，显示构建快照" : "API unavailable — showing build snapshot");
    }
  }

  async function refreshHomeTop() {
    var tbody = document.querySelector("[data-live=home-top] tbody");
    var meta = document.querySelector("[data-live-meta=home-top]");
    var badge = document.querySelector("[data-live-badge=home-top]");
    var more = document.querySelector("[data-live-more=home-top]");
    if (!tbody) return;
    setBadge(badge, "load", lang === "zh" ? "刷新中…" : "Refreshing…");
    tbody.classList.add("live-skel");
    try {
      fillHead(
        tbody.closest("table"),
        lang === "zh"
          ? [["#", "num"], ["地址", ""], ["综合评分", "r"], ["胜率", "r"], ["收益率", "r"]]
          : [["#", "num"], ["Wallet", ""], ["Score", "r"], ["Win rate", "r"], ["ROI", "r"]]
      );
      var j = await get(LB);
      var b = j.leaderboard || {};
      var leaders = sortBySmartScore(b.leaders || []).slice(0, 3);
      tbody.innerHTML = leaders.map(function (l, i) {
        return rowShort(i + 1, l);
      }).join("");
      tbody.classList.remove("live-skel");
      if (meta) {
        var asof = bj(b.as_of);
        meta.textContent = asof ? (lang === "zh" ? "数据截至 " : "Data as of ") + asof + (lang === "zh" ? " · 按综合评分" : " · Ranked by score") : "";
        meta.setAttribute("data-asof", b.as_of || "");
        meta.setAttribute("data-sort", "smart_score");
      }
      if (more) {
        var n = (b.leaders || []).length;
        more.textContent = (lang === "zh" ? "看全部 " : "View all ") + n + (lang === "zh" ? " 位 →" : " traders →");
      }
      setBadge(badge, "", UPDATING);
    } catch (e) {
      tbody.classList.remove("live-skel");
      setBadge(badge, "err", lang === "zh" ? "接口暂不可用" : "API unavailable");
    }
  }

  function parseAddr() {
    var m = location.pathname.match(/\/leader\/(0x[a-fA-F0-9]{40})\/?/);
    if (m) return m[1].toLowerCase();
    var q = new URLSearchParams(location.search).get("addr");
    return q ? q.toLowerCase() : null;
  }

  async function refreshLeader() {
    var root = document.querySelector("[data-live=leader]");
    if (!root) return;
    var addr = (root.getAttribute("data-addr") || parseAddr() || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(addr)) return;
    var badge = document.querySelector("[data-live-badge=leader]");
    setBadge(badge, "load", lang === "zh" ? "刷新中…" : "Refreshing…");
    try {
      var det = await get("/v1/public/leaders/" + addr);
      var d = det.leader || {};
      var wal = null;
      try {
        wal = await get("/v1/public/wallets/" + addr);
      } catch (e) {}
      var m = Object.assign({}, d.metrics || {});
      ["win_rate", "roi", "max_drawdown"].forEach(function (k) {
        if (d[k] != null) m[k] = d[k];
      });
      var nm = dname(Object.assign({}, wal || {}, d), addr);
      var asof = bj(d.updated_at || (wal && wal.as_of));
      var wr = pct(m.win_rate, false, 1),
        roi = pct(m.roi, true),
        dd = pct(m.max_drawdown),
        rm = num(m.resolved_markets);
      var titleEl = root.querySelector("[data-f=name]");
      if (titleEl) {
        var rk = titleEl.querySelector(".rk");
        titleEl.innerHTML = esc(nm) + (rk ? " " + rk.outerHTML : "");
      }
      var descEl = root.querySelector("[data-f=desc]");
      if (descEl) {
        var parts, desc, who = short(addr);
        if (lang === "zh") {
          parts = [wr ? "近90天胜率 " + wr : null, roi ? "收益率 " + roi : null, dd ? "最大回撤 " + dd : null].filter(Boolean);
          desc = who + (parts.length ? "：" + parts.join("、") + "。" : "。") + (rm ? "已结算市场 " + rm + " 个。" : "") + "数据来自链上公开记录。";
          if (root.getAttribute("data-paper") === "1") desc += "模拟盘数据，不是实盘成交。";
        } else {
          parts = [wr ? "90-day win rate " + wr : null, roi ? "ROI " + roi : null, dd ? "max drawdown " + dd : null].filter(Boolean);
          desc = who + (parts.length ? ": " + parts.join(", ") + ". " : ". ") + (rm ? rm + " resolved markets. " : "") + "Data from public on-chain records.";
          if (root.getAttribute("data-paper") === "1") desc += " Paper-trading figures, not live fills.";
        }
        descEl.textContent = desc;
      }
      var asofEl = root.querySelector("[data-f=asof]");
      if (asofEl && asof) {
        asofEl.textContent = (lang === "zh" ? "数据截至 " : "Data as of ") + asof + (lang === "zh" ? " · 统计窗口：近 90 天" : " · Window: last 90 days");
      }
      var L = function (z, e) {
        return lang === "zh" ? z : e;
      };
      var stats = [
        [L("胜率（近90天）", "Win rate (90d)"), wr, ""],
        [L("收益率（近90天）", "ROI (90d)"), roi, tone(m.roi)],
        [L("最大回撤", "Max drawdown"), dd, ""],
        [L("已结算市场", "Resolved markets"), rm, ""],
        [L("已实现盈亏", "Realized P&L"), usd(m.realized_pnl, true), tone(m.realized_pnl)],
        [L("近30天盈亏", "P&L (30d)"), usd(m.pnl_30d, true), tone(m.pnl_30d)],
        [L("成交额", "Volume"), usd(m.volume_usd), ""],
        [L("平均买入价", "Avg entry price"), typeof m.avg_entry_price === "number" ? Math.round(m.avg_entry_price * 100) + "¢" : null, ""],
        [L("单笔中位金额", "Median trade"), usd(m.median_trade_usd), ""],
        [
          L("持仓中位时长", "Median hold"),
          typeof m.median_hold_minutes === "number"
            ? (m.median_hold_minutes / 1440).toFixed(1) + (lang === "zh" ? " 天" : " days")
            : null,
          "",
        ],
      ];
      var grid = root.querySelector("[data-f=grid]");
      if (grid) grid.innerHTML = stats.map(function (s) {
        return stat(s[0], s[1], s[2]);
      }).join("");

      var sparkHost = root.querySelector("[data-f=spark]");
      if (sparkHost) sparkHost.innerHTML = spark((wal && wal.equity_curve) || []);

      var facts = [];
      var cats = (d.categories || m.categories || [])
        .map(function (x) {
          return typeof x === "object" ? x.category : x;
        })
        .filter(function (c) {
          return c && c !== "unknown";
        })
        .slice(0, 5)
        .map(function (c) {
          return lang === "zh" ? CAT[c] || c : c;
        });
      if (cats.length) facts.push(L("主要市场类别：", "Main categories: ") + cats.join(lang === "zh" ? "、" : ", ") + L("。", "."));
      var lt = bj(m.last_trade_at);
      if (lt) facts.push(L("最近一次成交：", "Last trade: ") + lt + L("。", "."));
      var xn = d.x_username || (wal && wal.x_username);
      if (xn) facts.push(L("X 账号：", "X account: ") + "@" + xn + L("（自报，未核实）。", " (self-reported, unverified)."));
      var factsEl = root.querySelector("[data-f=facts]");
      if (factsEl) {
        if (facts.length) {
          factsEl.style.display = "";
          factsEl.innerHTML = "<ul class=\"facts\">" + facts.map(function (f) {
            return "<li>" + esc(f) + "</li>";
          }).join("") + "</ul>";
        } else {
          factsEl.style.display = "none";
          factsEl.innerHTML = "";
        }
      }
      setBadge(badge, "", UPDATING);
    } catch (e) {
      setBadge(badge, "err", lang === "zh" ? "接口暂不可用，显示构建快照" : "API unavailable — showing build snapshot");
      var miss = root.querySelector("[data-f=missing]");
      if (miss) miss.hidden = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.querySelector("[data-live=leaderboard]")) refreshLeaderboard();
    if (document.querySelector("[data-live=home-top]")) refreshHomeTop();
    if (document.querySelector("[data-live=leader]")) refreshLeader();
  });
})();
