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
    return p.year + "-" + p.month + "-" + p.day + " " + (p.hour === "24" ? "00" : p.hour) + ":" + p.minute;
  }
  /* 浏览器时区标签，如 UTC+8、UTC−5:30、UTC */
  function tzName(d) {
    var off = -d.getTimezoneOffset();
    if (!off) return "UTC";
    var a = Math.abs(off), h = Math.floor(a / 60), mi = a % 60;
    return "UTC" + (off > 0 ? "+" : "−") + h + (mi ? ":" + (mi < 10 ? "0" : "") + mi : "");
  }
  /* 「数据截至」等时间：本地时区 + 时区标签，例：2026-10-28 15:09（UTC+8） */
  function stamp(iso) {
    var d = parseUtc(iso);
    var t = bj(iso);
    if (!d || !t) return null;
    var z = tzName(d);
    return t + (lang === "zh" ? "（" + z + "）" : " (" + z + ")");
  }
  /* 服务端/构建快照里写的是 UTC。页面一打开就按 data-asof-iso 换成本地时区，刷新失败时也一致。 */
  function localizeAsof() {
    var els = document.querySelectorAll("[data-asof-iso]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var iso = el.getAttribute("data-asof-iso");
      var s = stamp(iso);
      if (!s) continue;
      el.textContent = el.textContent.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?:（UTC[^）]*）| \(UTC[^)]*\)| UTC)/, s);
    }
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
  /* 手机上数值格的标签改挂到地址下面，避免评分被挤出屏幕（CSS 控制显示哪一份） */
  function mobileTags(f) {
    var t = [];
    if (f.checks) t.push(tag(TXT.checks, f.third ? TXT.checksNote : null));
    if (f.third) t.push(tag(TXT.third));
    return t.length ? '<div class="ck-m">' + t.join("") + "</div>" : "";
  }
  /* 数值格下方挂一个小标签；标签单独一行，不挤数字 */
  function tagCell(v, cls, t) {
    if (!t) return cell(v, cls);
    var body = v != null ? '<span class="num ' + (cls || "") + '">' + esc(v) + "</span>" : '<span class="nd">' + ND + "</span>";
    return '<td class="r">' + body + t + "</td>";
  }
  /* 排行榜分数列：没有综合评分（smart_score 为 null）时写「—」，不写「无数据」或 0。「—」只用在这一列。 */
  function scoreCell(v, t) {
    if (v != null) return tagCell(v, "", t);
    return '<td class="r"><span class="num mu" data-nd="score">—</span>' + (t || "") + "</td>";
  }
  function cellHm(v, cls) {
    return v != null ? '<td class="r num hm ' + (cls || "") + '">' + esc(v) + "</td>" : '<td class="r hm"><span class="nd">' + ND + "</span></td>";
  }
  /* 后端 #85/#87 标注字段。字段不在时全部为 false，页面保持原样；顶层 response.source 不看。 */
  var TXT = lang === "zh"
    ? {
        third: "第三方口径",
        checks: "部分检查未完成",
        checksNote: "该地址数据来自第三方，尚未完成集中度、做市、刷量检查。",
        mm: "疑似做市，不参与排名",
        mmNote: "该地址常在同一市场双边挂单，盈亏可能主要来自买卖价差，跟单难以复制。",
        score: "综合评分",
        roiNote: "自算地址的收益率 = 已实现盈亏 ÷ 投入，不含浮动。",
        fail: "暂时无法刷新，显示的是截至上次更新的数据",
      }
    : {
        third: "third-party basis",
        checks: "Some checks pending",
        checksNote: "This address uses third-party data; concentration, market-making and wash-trading checks are not done yet.",
        mm: "Likely market maker · not ranked",
        mmNote: "This address often quotes both sides of a market; its P&L may come mainly from spreads and is hard to copy.",
        score: "Score",
        roiNote: "For addresses we compute ourselves, ROI = realized P&L ÷ capital invested, excluding unrealized P&L.",
        fail: "Couldn't refresh; showing data from the last update",
      };
  function flags(l) {
    var src = l && typeof l.source === "string" ? l.source.trim().toLowerCase() : "";
    return {
      third: src === "polymarketscan" || src === "third_party",
      checks: !!l && l.checks_incomplete === true,
      mm: !!l && l.suspected_market_maker === true,
    };
  }
  /* copy-engine #89 index_basis：门槛读的成交数、已结算数。没有这个字段时返回 null，页面保持旧显示。与 workers/leader-page.mjs 一致。 */
  var IBT = lang === "zh"
    ? { settled: "已结算市场（全部历史）", trades: "成交笔数（全部历史）", col: "已结算（全部历史）", thirdCount: "第三方口径", capNote: "第三方只统计到这个数", window: "胜率、收益率按近 90 天", quiet: "近 30 天无成交" }
    : { settled: "Resolved markets (all time)", trades: "Trades (all time)", col: "Resolved (all time)", thirdCount: "third-party basis", capNote: "Third-party data stops counting here", window: "Win rate and ROI: last 90 days", quiet: "No trades in the last 30 days" };
  function basis(l) {
    var ib = l && l.index_basis;
    return ib && typeof ib === "object" && !Array.isArray(ib) ? ib : null;
  }
  /* 封顶（capped===true）一律固定写「20,000+」，不用原始数（Blake 2026-10-28）；null（第三方没给）返回 null，显示「无数据」。与 workers/leader-page.mjs 一致 */
  var CAPPED_COUNT = "20,000+";
  function basisCount(n, capped) {
    if (capped === true) return CAPPED_COUNT;
    return num(n);
  }
  function basisTag(ib, capped) {
    if (!ib) return "";
    var src = typeof ib.source === "string" ? ib.source.trim().toLowerCase() : "";
    if (src !== "polymarketscan" && src !== "third_party" && capped !== true) return "";
    return tag(IBT.thirdCount, capped === true ? IBT.capNote : null);
  }
  /* 已结算 / 成交笔数格：这一格总在，没数写「无数据」 */
  function basisStat(key, ib) {
    var capped = ib[key + "_capped"] === true;
    var v = basisCount(ib[key], capped);
    var t = basisTag(ib, capped);
    var b = v == null ? '<b class="nd">' + ND + "</b>" : '<b class="num"' + (capped ? ' title="' + esc(IBT.capNote) + '"' : "") + ">" + esc(v) + "</b>";
    return '<div class="st" data-f="' + key + '"><span>' + esc(IBT[key]) + (t ? " " + t : "") + "</span>" + b + "</div>";
  }
  function tag(text, title) {
    return '<span class="ck"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + esc(text) + "</span>";
  }
  /* 第三方收益率：null，或正好 0 但已实现盈亏不是 0 / 曲线是平的 → 显示「无数据」，不显示 0.0% */
  function roiMissing(f, m, flat) {
    if (!f.third) return false;
    var r = m && m.roi;
    if (r == null || !isFinite(r)) return true;
    if (r !== 0) return false;
    var rp = m && m.realized_pnl;
    return (typeof rp === "number" && isFinite(rp) && rp !== 0) || flat === true;
  }
  /* 净值点：画「累计已实现盈亏」；没有 realized_pnl 时只在浮动为 0 时退回 equity */
  function curvePts(curve) {
    return (curve || [])
      .map(function (c) {
        var v = c && typeof c.realized_pnl === "number" ? c.realized_pnl : c && c.unrealized_pnl === 0 ? c.equity : null;
        return [c && c.t, v];
      })
      .filter(function (p) {
        return typeof p[1] === "number" && isFinite(p[1]);
      });
  }
  /* 0 个点、1 个点、或全部相等，都算没有有效曲线 */
  function curveFlat(curve) {
    var pts = curvePts(curve);
    if (pts.length < 2) return true;
    for (var i = 1; i < pts.length; i++) if (pts[i][1] !== pts[0][1]) return false;
    return true;
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
  /* 接口 10 秒没回就算失败，走各自的 catch。window.WL_API_TIMEOUT_MS 只给测试用。 */
  var TIMEOUT_MS = 10000;
  async function get(path) {
    var ms = typeof window.WL_API_TIMEOUT_MS === "number" ? window.WL_API_TIMEOUT_MS : TIMEOUT_MS;
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    try {
      var res = await fetch(API + path, { headers: { Accept: "application/json" }, signal: ctl ? ctl.signal : undefined });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* 加载中/失败才显示角标；成功后隐藏并清空，只留「数据截至 …」 */
  function setBadge(el, state, text) {
    if (!el) return;
    el.hidden = false;
    el.className = "live-badge " + (state || "");
    el.innerHTML = "<i></i><span>" + esc(text) + "</span>";
  }
  function hideBadge(el) {
    if (!el) return;
    el.hidden = true;
    el.className = "live-badge";
    el.innerHTML = "";
  }

  /* 排行榜「已结算」：有 index_basis 时读 index_basis.settled（封顶「20,000+」，悬停说明） */
  function settledCell(l, m) {
    var ib = basis(l);
    if (!ib) return cellHm(basisCount(m.resolved_markets, m.settled_capped));
    var capped = ib.settled_capped === true;
    var v = basisCount(ib.settled, capped);
    if (v == null) return cellHm(null);
    return '<td class="r num hm"' + (capped ? ' title="' + esc(IBT.capNote) + '"' : "") + ">" + esc(v) + "</td>";
  }
  function rowFull(i, l) {
    var m = l.metrics || {};
    var f = flags(l);
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
      "</div>" +
      mobileTags(f) +
      "</td>" +
      scoreCell(scoreText(l), f.checks ? tag(TXT.checks, f.third ? TXT.checksNote : null) : "") +
      cell(pct(m.win_rate, false, 0)) +
      tagCell(roiMissing(f, m) ? null : pct(m.roi, true), tone(m.roi), f.third ? tag(TXT.third, f.checks ? null : TXT.checksNote) : "") +
      cellHm(pct(m.max_drawdown)) +
      settledCell(l, m) +
      cellHm(usd(m.realized_pnl, true), tone(m.realized_pnl)) +
      "</tr>"
    );
  }
  function rowShort(i, l) {
    var m = l.metrics || {};
    var f = flags(l);
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
      "</div>" +
      mobileTags(f) +
      "</td>" +
      scoreCell(scoreText(l), f.checks ? tag(TXT.checks, f.third ? TXT.checksNote : null) : "") +
      cell(pct(m.win_rate, false, 0)) +
      tagCell(roiMissing(f, m) ? null : pct(m.roi, true), tone(m.roi), f.third ? tag(TXT.third, f.checks ? null : TXT.checksNote) : "") +
      "</tr>"
    );
  }

  function spark(curve) {
    if (curveFlat(curve)) return "";
    var pts = curvePts(curve);
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
    var cap = lang === "zh" ? "累计已实现盈亏（美元）" : "Cumulative realized P&L (USD)";
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

  /* t：标签旁的小标签。带标签的格即使没值也保留，显示「无数据」 */
  /* keep：胜率、收益率这类格子为 null 时也保留，显示「无数据」（copy-engine #90 会置 null），不写 0 */
  function stat(label, val, cls, t, keep) {
    if (val == null && !t && !keep) return "";
    var b = val == null ? '<b class="nd">' + ND + "</b>" : '<b class="num ' + (cls || "") + '">' + esc(val) + "</b>";
    return '<div class="st"><span>' + esc(label) + (t ? " " + t : "") + "</span>" + b + "</div>";
  }

  /* 榜里有第三方地址时，在表格下面写一次收益率口径 */
  function roiFootnote(host, on) {
    if (!host) return;
    var el = host.querySelector("[data-f=roi-note]");
    if (!on) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("p");
      el.className = "mu xs ck-foot";
      el.setAttribute("data-f", "roi-note");
      var tb = host.querySelector("table");
      var after = tb && tb.closest(".tw") ? tb.closest(".tw") : tb;
      if (after && after.parentNode) after.parentNode.insertBefore(el, after.nextSibling);
      else host.appendChild(el);
    }
    el.textContent = TXT.roiNote;
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
      if (leaders.some(function (l) { return !!basis(l); })) {
        var th = tbody.closest("table").querySelectorAll("thead th");
        if (th[6]) th[6].textContent = IBT.col;
      }
      tbody.innerHTML = leaders.map(function (l, i) {
        return rowFull(i + 1, l);
      }).join("");
      tbody.classList.remove("live-skel");
      if (meta) {
        var asof = stamp(b.as_of);
        meta.textContent = boardMeta(Number(meta.getAttribute("data-index-total")) || leaders.length, asof);
        meta.setAttribute("data-asof", b.as_of || "");
        meta.setAttribute("data-sort", "smart_score");
      }
      roiFootnote(tbody.closest("[data-live=leaderboard]"), leaders.some(function (l) {
        return flags(l).third;
      }));

      /* 排行榜页无 recent 块；勿引用未定义的 root/d，否则成功刷新后仍会落入 catch 显示红字 */
      hideBadge(badge);
    } catch (e) {
      tbody.classList.remove("live-skel");
      setBadge(badge, "err", TXT.fail);
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
        var asof = stamp(b.as_of);
        meta.textContent = asof ? (lang === "zh" ? "数据截至 " : "Data as of ") + asof + (lang === "zh" ? " · 按综合评分" : " · Ranked by score") : "";
        meta.setAttribute("data-asof", b.as_of || "");
        meta.setAttribute("data-sort", "smart_score");
      }
      if (more) {
        var n = (b.leaders || []).length;
        more.textContent = (lang === "zh" ? "看全部 " : "View all ") + n + (lang === "zh" ? " 位 →" : " traders →");
      }
      hideBadge(badge);
    } catch (e) {
      tbody.classList.remove("live-skel");
      setBadge(badge, "err", TXT.fail);
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
    localizeAsof();
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
      var asofIso = d.as_of || d.updated_at || (wal && wal.as_of);
      var asof = stamp(asofIso);
      var f = flags(d);
      if (root.getAttribute("data-mm") === "1") f.mm = true; // www 白名单补的做市标记
      var curve = (wal && wal.equity_curve) || [];
      var roiNd = roiMissing(f, m, wal ? curveFlat(curve) : undefined);
      var sc = f.mm ? null : scoreText(d);
      var roiNote = f.third ? (lang === "zh" ? "（第三方口径）" : " (third-party basis)") : "";
      var wr = pct(m.win_rate, false, 1),
        roi = roiNd || f.mm ? null : pct(m.roi, true),
        dd = pct(m.max_drawdown),
        ib = basis(d),
        rm = ib ? basisCount(ib.settled, ib.settled_capped) : basisCount(m.resolved_markets, m.settled_capped);
      var titleEl = root.querySelector("[data-f=name]");
      if (titleEl) {
        var rk = f.mm ? null : titleEl.querySelector(".rk");
        titleEl.innerHTML = esc(nm) + (rk ? " " + rk.outerHTML : "");
      }
      var descEl = root.querySelector("[data-f=desc]");
      if (descEl) {
        var parts, desc, who = short(addr);
        if (lang === "zh") {
          parts = [sc ? "综合评分 " + sc : null, wr ? "近90天胜率 " + wr : null, roi ? "收益率 " + roi + roiNote : null, dd ? "最大回撤 " + dd : null].filter(Boolean);
          desc = who + (parts.length ? "：" + parts.join("、") + "。" : "。") + (rm ? (ib ? "已结算市场（全部历史）" : "已结算市场 ") + rm + " 个。" : "") + (f.third ? "数据来自第三方，Wakeloom 还没自己核对。" : "数据来自链上公开记录。");
          if (root.getAttribute("data-paper") === "1") desc += "模拟盘数据，不是实盘成交。";
        } else {
          parts = [sc ? "score " + sc : null, wr ? "90-day win rate " + wr : null, roi ? "ROI " + roi + roiNote : null, dd ? "max drawdown " + dd : null].filter(Boolean);
          desc = who + (parts.length ? ": " + parts.join(", ") + ". " : ". ") + (rm ? rm + (ib ? " resolved markets (all time). " : " resolved markets. ") : "") + (f.third ? "Data comes from a third party and hasn't been verified by Wakeloom yet." : "Data from public on-chain records.");
          if (root.getAttribute("data-paper") === "1") desc += " Paper-trading figures, not live fills.";
        }
        descEl.textContent = desc;
      }
      var asofEl = root.querySelector("[data-f=asof]");
      if (asofEl && asof) {
        asofEl.setAttribute("data-asof-iso", String(asofIso));
        asofEl.textContent = (lang === "zh" ? "数据截至 " : "Data as of ") + asof + (ib ? " · " + IBT.window : lang === "zh" ? " · 统计窗口：近 90 天" : " · Window: last 90 days");
      }
      var L = function (z, e) {
        return lang === "zh" ? z : e;
      };
      var stats = [
        [L("胜率（近90天）", "Win rate (90d)"), wr, "", "", true],
        f.mm ? null : [L("收益率（近90天）", "ROI (90d)"), roi, tone(m.roi), f.third ? tag(TXT.third) : "", true],
        [L("最大回撤", "Max drawdown"), dd, ""],
        ib ? ["settled"] : [L("已结算市场", "Resolved markets"), rm, ""],
        ib ? ["trades"] : null,
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
        if (!s) return "";
        if (s.length === 1) return basisStat(s[0], ib);
        return stat(s[0], s[1], s[2], s[3], s[4]);
      }).join("");

      var ckEl = root.querySelector("[data-f=checks]");
      if (ckEl) {
        var bits = [], notes = [];
        if (f.mm) {
          bits.push('<span class="ck ck-mm">' + esc(TXT.mm) + "</span>");
          notes.push(TXT.mmNote);
        } else if (sc) {
          bits.push('<span class="sc"><span class="mu">' + esc(TXT.score) + '</span> <b class="num">' + esc(sc) + "</b></span>");
        }
        if (f.checks) {
          bits.push(tag(TXT.checks, f.third ? TXT.checksNote : null));
          if (f.third) notes.push(TXT.checksNote);
        }
        if (ib && ib.no_trades_30d === true) bits.push('<span class="ck ck-quiet">' + esc(IBT.quiet) + "</span>");
        ckEl.innerHTML = bits.length
          ? '<div class="ck-line">' + bits.join("") + "</div>" + notes.map(function (n) {
              return '<p class="mu xs ck-note">' + esc(n) + "</p>";
            }).join("")
          : "";
        ckEl.hidden = !bits.length;
      }

      var sparkHost = root.querySelector("[data-f=spark]");
      /* 曲线 null / [] / 0–1 个点 / 全部相等：整块不画（Casey 2026-10-28 定稿，copy-engine #90 约 45% 本地地址曲线为 null） */
      if (sparkHost) sparkHost.innerHTML = spark(curve);

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
      /* 有 index_basis 时只认 index_basis.last_trade_at；null 时整行不显示 */
      var lt = stamp(ib ? ib.last_trade_at : m.last_trade_at);
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
      hideBadge(badge);
    } catch (e) {
      setBadge(badge, "err", TXT.fail);
      var miss = root.querySelector("[data-f=missing]");
      if (miss) miss.hidden = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    localizeAsof();
    if (document.querySelector("[data-live=leaderboard]")) refreshLeaderboard();
    if (document.querySelector("[data-live=home-top]")) refreshHomeTop();
    if (document.querySelector("[data-live=leader]")) refreshLeader();
  });
})();
