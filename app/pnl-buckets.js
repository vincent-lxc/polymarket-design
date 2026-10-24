/* 账户详情趋势图的日期窗口和盈亏柱。只消费 /v1/accounts/:id/pnl-buckets。
   接口没有、404 或第一次就失败时，调用方退回原来的净值曲线，不在这里补数字。
   悬停「手续费为估算」看这一期的 fees_estimated（契约里与顶层一致）。
   X 轴和悬停标题用每期 label。累计收益率用 cum_return_pct，has_data=false 时为 null，折线断开。 */
(function (g) {
  var UP = "#2fd47a";
  var DOWN = "#ff5a5f";
  var FLAT = "#9a9aa3";
  var LINE = "#FF6A1F";
  var MUTED = "#6b6b73";
  var DAY_CAP = 366;
  var EMPTY_TEXT = "这段时间还没有数据";
  var ERROR_TEXT = "图表暂时加载不了，稍后刷新";
  var RANGE_TEXT = "区间太长，请改用周或月";
  var INVALID_TEXT = "开始日期晚于结束日期";
  var FEE_TEXT = "手续费为估算";
  var PARTIAL_TEXT = "本期未结束";

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function zoneOf(tz) {
    if (tz == null || tz === "") return "Asia/Shanghai";
    var s = String(tz).trim();
    if (/^(UTC)?\+?0?8(:?00)?$/i.test(s) || /beijing|hong\s*kong|shanghai/i.test(s)) return "Asia/Shanghai";
    try {
      Intl.DateTimeFormat("en-US", { timeZone: s }).format(new Date());
      return s;
    } catch (e) {
      return "Asia/Shanghai";
    }
  }

  function zonedParts(ms, zone) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zoneOf(zone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    var p = {};
    fmt.formatToParts(new Date(ms)).forEach(function (x) {
      if (x.type !== "literal") p[x.type] = x.value;
    });
    if (p.hour === "24") p.hour = "00";
    return p;
  }

  function dateISO(ms, zone) {
    var p = zonedParts(ms, zone);
    return p.year + "-" + p.month + "-" + p.day;
  }

  function todayISO(nowMs, zone) {
    return dateISO(nowMs == null ? Date.now() : nowMs, zone);
  }

  function parseISODate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function isoDate(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); }

  function addDays(iso, days) {
    var p = parseISODate(iso);
    if (!p) return "";
    var t = Date.UTC(p.y, p.m - 1, p.d) + days * 86400000;
    var d = new Date(t);
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function addMonths(iso, months) {
    var p = parseISODate(iso);
    if (!p) return "";
    var m0 = p.m - 1 + months;
    var y = p.y + Math.floor(m0 / 12);
    var m = ((m0 % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return isoDate(y, m + 1, Math.min(p.d, last));
  }

  function civilDate(value, zone) {
    if (value == null || value === "" || value === true || value === false) return "";
    if (typeof value === "string" && parseISODate(value.trim())) return value.trim();
    var ms = typeof value === "number" ? value : Date.parse(value);
    if (!isFinite(ms)) return "";
    return dateISO(ms, zone);
  }

  function weekStartsMonday(name) {
    var s = String(name || "monday").toLowerCase();
    return !(s === "sunday" || s === "sun" || s === "0");
  }

  function weekStartDate(iso, weekStart) {
    var p = parseISODate(iso);
    if (!p) return "";
    var day = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    var target = weekStartsMonday(weekStart) ? 1 : 0;
    return addDays(iso, -((day - target + 7) % 7));
  }

  function inclusiveDays(from, to) {
    var a = parseISODate(from);
    var b = parseISODate(to);
    if (!a || !b) return 0;
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000) + 1;
  }

  function normalizeGranularity(g0) {
    return g0 === "week" || g0 === "month" || g0 === "year" ? g0 : "day";
  }

  function defaultWindow(granularity, opts) {
    opts = opts || {};
    var zone = zoneOf(opts.tz);
    var now = opts.now != null ? opts.now : Date.now();
    var today = todayISO(now, zone);
    var g1 = normalizeGranularity(granularity);
    var from;
    if (g1 === "week") {
      from = addDays(weekStartDate(today, opts.week_start || "monday"), -25 * 7);
    } else if (g1 === "month") {
      var p = parseISODate(today);
      from = addMonths(isoDate(p.y, p.m, 1), -11);
    } else if (g1 === "year") {
      var incYear = civilDate(opts.inception, zone);
      var yp = parseISODate(incYear || today);
      from = yp ? isoDate(yp.y, 1, 1) : today;
    } else {
      from = addDays(today, -29);
    }
    if (from > today) from = today;
    return { granularity: g1, from: from, to: today, custom: false };
  }

  function clampWindow(from, to, opts) {
    opts = opts || {};
    var zone = zoneOf(opts.tz);
    var now = opts.now != null ? opts.now : Date.now();
    var today = todayISO(now, zone);
    var min = civilDate(opts.inception, zone);
    var requested = parseISODate(from) ? from : today;
    var f = requested;
    var t = parseISODate(to) ? to : today;
    var clippedToInception = !!(opts.custom && min && requested < min);
    if (clippedToInception) f = min;
    if (t > today) t = today;
    if (f > t) f = t;
    var granularity = normalizeGranularity(opts.granularity);
    var warn = granularity === "day" && inclusiveDays(f, t) > DAY_CAP ? RANGE_TEXT : "";
    return { granularity: granularity, from: f, to: t, warn: warn, today: today, min: min || "", clippedToInception: clippedToInception };
  }

  function reconcileWindow(state, payload, nowMs) {
    if (!state || state.custom || !payload || typeof payload !== "object") return null;
    var tz = payload.tz || state.tz || "";
    var weekStart = payload.week_start || state.weekStart || "monday";
    var inception = payload.inception_at || state.inception || "";
    var opts = { now: nowMs, tz: tz, week_start: weekStart, inception: inception, granularity: state.granularity };
    var def = defaultWindow(state.granularity, opts);
    var win = clampWindow(def.from, def.to, opts);
    if (win.warn || (win.from === state.from && win.to === state.to)) return null;
    return { from: win.from, to: win.to, tz: tz, weekStart: weekStart, inception: inception, granularity: normalizeGranularity(state.granularity) };
  }

  function requestPath(id, q) {
    q = q || {};
    var p = new URLSearchParams();
    p.set("granularity", normalizeGranularity(q.granularity));
    if (q.from) p.set("from", q.from);
    if (q.to) p.set("to", q.to);
    p.set("scope", q.scope === "current_segment" ? "current_segment" : "all");
    return "/v1/accounts/" + encodeURIComponent(String(id == null ? "" : id)) + "/pnl-buckets?" + p.toString();
  }

  function finite(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function bucketRows(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return Array.isArray(payload.buckets) ? payload.buckets : null;
  }

  function noEquity(payload) {
    return !!(payload && payload.reasons && payload.reasons.buckets === "no_equity_points");
  }

  function errorCode(err) {
    if (!err) return "";
    if (err.code) return String(err.code);
    var body = err.body;
    if (body && (body.error || body.code)) return String(body.error || body.code);
    return "";
  }

  function looksLikePayload(payload) {
    if (Array.isArray(payload)) return true;
    if (!payload || typeof payload !== "object") return false;
    return Array.isArray(payload.buckets) || Array.isArray(payload.items) || payload.tz != null || payload.inception_at != null || payload.week_start != null || payload.granularity != null;
  }

  function hasFlag(v) {
    if (v === false || v === "false" || v === 0 || v === "0") return false;
    if (v === true || v === "true" || v === 1 || v === "1") return true;
    return null;
  }

  function normalizeRow(raw) {
    raw = raw || {};
    var flagged = hasFlag(raw.has_data);
    var pnl = finite(raw.pnl_net);
    var nav = finite(raw.nav_end);
    var navStart = finite(raw.nav_start);
    var flow = finite(raw.flow_usd);
    var fees = finite(raw.fees);
    var feesUncharged = finite(raw.fees_uncharged);
    var pr = finite(raw.period_return_pct);
    var cr = finite(raw.cum_return_pct);
    var has = flagged == null ? (pnl != null || nav != null || pr != null || cr != null) : flagged;
    var feesEstimated = raw.fees_estimated === true || raw.fees_estimated === "true";
    var partial = raw.partial === true || raw.partial === "true";
    var segment = raw.segment == null || raw.segment === "" || !isFinite(Number(raw.segment)) ? null : Number(raw.segment);
    var base = {
      has: !!has,
      label: raw.label == null ? "" : String(raw.label),
      partial: partial,
      segment: segment,
      feesEstimated: feesEstimated,
      start: raw.period_start || "",
      end: raw.period_end || ""
    };
    if (!has) {
      return Object.assign(base, { pnl: null, nav: null, navStart: null, flow: null, fees: null, feesUncharged: null, pr: null, cr: null });
    }
    return Object.assign(base, { pnl: pnl, nav: nav, navStart: navStart, flow: flow, fees: fees, feesUncharged: feesUncharged, pr: pr, cr: cr });
  }

  function withReturns(rows) {
    var prev = 0;
    var seen = false;
    return rows.map(function (r) {
      if (!r.has || r.cr == null) return Object.assign({}, r, { cum: null, cumBefore: null, plot: false });
      var before = seen ? prev : 0;
      seen = true;
      prev = r.cr;
      return Object.assign({}, r, { cumBefore: before, cum: r.cr, plot: true });
    });
  }

  function mmdd(iso) {
    var p = parseISODate(iso);
    return p ? pad2(p.m) + "-" + pad2(p.d) : "";
  }

  function inclusiveEnd(end, zone) {
    if (!end) return "";
    if (parseISODate(String(end).trim())) return String(end).trim();
    var ms = Date.parse(end);
    if (!isFinite(ms)) return "";
    var parts = zonedParts(ms, zone);
    var date = parts.year + "-" + parts.month + "-" + parts.day;
    if (parts.hour === "00" && parts.minute === "00" && (!parts.second || parts.second === "00")) return addDays(date, -1);
    return date;
  }

  function periodTitle(row, granularity, zone) {
    var start = civilDate(row.start, zone);
    var end = inclusiveEnd(row.end, zone) || start;
    if (!start) return "";
    if (granularity === "year") return start.slice(0, 4);
    if (granularity === "month") return start.slice(0, 7);
    if (granularity === "day" || start === end) return mmdd(start);
    if (start.slice(0, 4) !== end.slice(0, 4)) return start + " – " + end;
    return mmdd(start) + " – " + mmdd(end);
  }

  /* 「账户 MM-DD 开始运行」只用顶层 inception_at。clipped_from 是当时请求的起点，不是开跑日。 */
  function clipText(payload, opts) {
    opts = opts || {};
    if (!payload || typeof payload !== "object") return "";
    var zone = zoneOf(opts.tz || payload.tz);
    var scope = opts.scope || payload.scope || "all";
    var from = opts.from || "";
    var segDay = civilDate(payload.segment_start_at, zone);
    if (scope === "current_segment" && segDay && from && from < segDay) {
      return "已从当前分段开始（" + mmdd(segDay) + "）";
    }
    var inc = civilDate(payload.inception_at, zone);
    if (!inc) return "";
    if (opts.clippedToInception) return "账户 " + mmdd(inc) + " 开始运行，已从这天开始";
    return "账户 " + mmdd(inc) + " 开始运行";
  }

  function slotIndex(ev, svg, slots) {
    var node = ev && ev.target;
    var hit = node && typeof node.closest === "function" ? node.closest("rect.sa-hit") : null;
    if (hit && hit.dataset && hit.dataset.i != null && hit.dataset.i !== "" && isFinite(Number(hit.dataset.i))) return Number(hit.dataset.i);
    if (!svg || typeof svg.getScreenCTM !== "function") return -1;
    var ctm = svg.getScreenCTM();
    if (!ctm || typeof ctm.inverse !== "function") return -1;
    var inv = ctm.inverse();
    var pt = typeof svg.createSVGPoint === "function" ? svg.createSVGPoint() : { x: 0, y: 0 };
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    var p = typeof pt.matrixTransform === "function" ? pt.matrixTransform(inv) : null;
    if (!p || !isFinite(p.x)) return -1;
    slots = slots || [];
    var i;
    for (i = 0; i < slots.length; i++) {
      if (p.x >= slots[i].x0 && p.x < slots[i].x1) return i;
    }
    if (slots.length && p.x >= slots[slots.length - 1].x0 && p.x <= slots[slots.length - 1].x1 + 0.01) return slots.length - 1;
    return -1;
  }

  function unchargedFees(payload) {
    var rows = bucketRows(payload);
    if (!rows) return null;
    var sum = 0;
    var any = false;
    rows.forEach(function (raw) {
      if (!raw || raw.has_data === false || raw.has_data === "false") return;
      var n = finite(raw.fees_uncharged);
      if (n == null) return;
      any = true;
      sum += n;
    });
    return any ? sum : null;
  }

  function feesNote(payload) {
    if (!payload || typeof payload !== "object") return "";
    if (!(payload.fees_estimated === true || payload.fees_estimated === "true")) return "";
    var sum = unchargedFees(payload);
    if (sum == null) return "";
    return "估算手续费 " + formatUsd(sum, false);
  }

  function formatPct(frac) {
    if (frac == null || !isFinite(Number(frac))) return "—";
    var v = Number(frac) * 100;
    var sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return sign + Math.abs(v).toFixed(1) + "%";
  }

  function formatUsd(x, sign) {
    if (x == null || !isFinite(Number(x))) return "—";
    var n = Number(x);
    var s = "";
    if (sign) s = n > 0 ? "+" : n < 0 ? "−" : "";
    else if (n < 0) s = "−";
    return s + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatAxis(frac) {
    if (frac == null || !isFinite(frac)) return "";
    if (Math.abs(frac) < 1e-12) return "0%";
    return formatPct(frac);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function tooltipFor(row, granularity, zone) {
    var title = row.label || periodTitle(row, granularity, zone);
    var partial = row.partial ? PARTIAL_TEXT : "";
    if (!row.has) return { title: title, rows: [{ k: "", v: "无数据", cls: "" }], fee: "", partial: partial };
    var pnlCls = row.pnl > 0 ? "up" : row.pnl < 0 ? "dn" : "";
    return {
      title: title,
      rows: [
        { k: "当期盈亏", v: formatUsd(row.pnl, true), cls: pnlCls },
        { k: "当期收益率", v: formatPct(row.pr), cls: row.pr > 0 ? "up" : row.pr < 0 ? "dn" : "" },
        { k: "累计收益率", v: formatPct(row.cum), cls: row.cum > 0 ? "up" : row.cum < 0 ? "dn" : "" },
        { k: "期末净值", v: formatUsd(row.nav, false), cls: "" }
      ],
      fee: row.feesEstimated ? FEE_TEXT : "",
      partial: partial
    };
  }

  function tooltipHtml(tip) {
    tip = tip || { title: "", rows: [], fee: "", partial: "" };
    var rows = (tip.rows || []).map(function (r) {
      if (!r.k) return "<div>" + esc(r.v) + "</div>";
      return "<div><span class=\"mu\">" + esc(r.k) + "</span> <b class=\"" + esc(r.cls || "") + "\">" + esc(r.v) + "</b></div>";
    }).join("");
    var fee = tip.fee ? "<div class=\"mu\">" + esc(tip.fee) + "</div>" : "";
    var partial = tip.partial ? "<div class=\"mu\">" + esc(tip.partial) + "</div>" : "";
    return "<b>" + esc(tip.title) + "</b>" + rows + fee + partial;
  }

  function bucketChart(payload, opts) {
    opts = opts || {};
    var zone = zoneOf(opts.tz || (payload && payload.tz));
    var granularity = normalizeGranularity(opts.granularity || (payload && payload.granularity));
    var rawRows = bucketRows(payload) || [];
    var rows = rawRows.map(normalizeRow).filter(function (r) { return r.start || r.end || r.has; });
    rows.sort(function (a, b) {
      var as = civilDate(a.start, zone) || "";
      var bs = civilDate(b.start, zone) || "";
      if (as < bs) return -1;
      if (as > bs) return 1;
      return 0;
    });
    rows = withReturns(rows);
    var width = opts.width || 720;
    var height = opts.height || 292;
    var padL = 8;
    var padR = 54;
    var lineTop = 14;
    var lineBot = 168;
    var barTop = 188;
    var barBot = 262;
    var n = rows.length;
    var inner = Math.max(1, width - padL - padR);
    var slot = n ? inner / n : inner;
    rows.forEach(function (r, i) {
      r.x0 = padL + i * slot;
      r.x1 = padL + (i + 1) * slot;
      r.cx = (r.x0 + r.x1) / 2;
    });
    var ys = [0];
    rows.forEach(function (r) {
      if (!r.plot) return;
      if (r.cum != null) ys.push(r.cum);
      if (r.cumBefore != null) ys.push(r.cumBefore);
    });
    var minY = ys[0];
    var maxY = ys[0];
    ys.forEach(function (y) { if (y < minY) minY = y; if (y > maxY) maxY = y; });
    if (minY === maxY) { minY -= 0.01; maxY += 0.01; }
    var span = maxY - minY;
    minY -= span * 0.12;
    maxY += span * 0.12;
    function yLine(v) {
      return lineTop + (1 - (v - minY) / (maxY - minY)) * (lineBot - lineTop);
    }
    var pnls = [];
    rows.forEach(function (r) { if (r.has && r.pnl != null) pnls.push(r.pnl); });
    var hasPos = pnls.some(function (v) { return v > 0; });
    var hasNeg = pnls.some(function (v) { return v < 0; });
    var zeroBar = barBot;
    var amp = barBot - barTop - 2;
    if (hasPos && hasNeg) {
      zeroBar = (barTop + barBot) / 2;
      amp = (barBot - barTop) / 2 - 2;
    } else if (hasNeg && !hasPos) {
      zeroBar = barTop;
    }
    var maxAbs = 0;
    pnls.forEach(function (v) { var a = Math.abs(v); if (a > maxAbs) maxAbs = a; });
    var bw = Math.max(1, Math.min(slot * 0.62, 22));
    rows.forEach(function (r) {
      r.bar = null;
      if (!r.has || r.pnl == null) return;
      var h = r.pnl === 0 ? 1.5 : (maxAbs ? Math.abs(r.pnl) / maxAbs * amp : 1.5);
      if (r.pnl !== 0) h = Math.max(h, 2);
      r.bar = {
        x: r.cx - bw / 2,
        y: r.pnl >= 0 ? zeroBar - h : zeroBar,
        w: bw,
        h: h,
        color: r.pnl > 0 ? UP : r.pnl < 0 ? DOWN : FLAT,
        pnl: r.pnl
      };
    });
    var d = "";
    var pen = false;
    rows.forEach(function (r) {
      if (!r.plot || r.cum == null) { pen = false; return; }
      var y1 = yLine(r.cum);
      if (!pen) {
        var y0 = yLine(r.cumBefore == null ? 0 : r.cumBefore);
        d += "M" + r.x0.toFixed(1) + " " + y0.toFixed(1) + "L" + r.x1.toFixed(1) + " " + y1.toFixed(1);
      } else {
        d += "L" + r.x1.toFixed(1) + " " + y1.toFixed(1);
      }
      pen = true;
    });
    var zeroY = yLine(0);
    var slots = rows.map(function (r, i) {
      return {
        i: i,
        has: r.has,
        x0: r.x0,
        x1: r.x1,
        pnl: r.pnl,
        nav: r.nav,
        navStart: r.navStart,
        flow: r.flow,
        feesUncharged: r.feesUncharged,
        segment: r.segment,
        partial: r.partial,
        pr: r.pr,
        cum: r.cum,
        cumBefore: r.cumBefore,
        plot: r.plot,
        bar: r.bar,
        label: r.label,
        tip: tooltipFor(r, granularity, zone)
      };
    });
    var drawn = slots.some(function (s) { return s.bar || s.plot; });
    var yLabels = [];
    function pushLabel(v) {
      var y = yLine(v);
      if (y < lineTop - 2 || y > lineBot + 2) return;
      if (yLabels.some(function (lb) { return Math.abs(lb.y - y) < 14; })) return;
      yLabels.push({ y: y, text: formatAxis(v) });
    }
    pushLabel(maxY);
    pushLabel(0);
    pushLabel(minY);
    var startDay = n ? civilDate(rows[0].start, zone) : "";
    var endDay = n ? (inclusiveEnd(rows[n - 1].end, zone) || civilDate(rows[n - 1].start, zone)) : "";
    var startLabel = n ? (rows[0].label || mmdd(startDay)) : "";
    var endLabel = n > 1 ? (rows[n - 1].label || mmdd(endDay)) : "";
    return {
      width: width,
      height: height,
      padL: padL,
      padR: padR,
      zeroY: zeroY,
      zeroBar: zeroBar,
      d: d,
      slots: slots,
      yLabels: yLabels,
      drawn: drawn,
      clip: clipText(payload, { tz: zone, scope: opts.scope, from: opts.from, clippedToInception: !!opts.clippedToInception }),
      fontSize: 11,
      feesUncharged: unchargedFees(payload),
      feesNote: feesNote(payload),
      granularity: granularity,
      startLabel: startLabel,
      endLabel: endLabel,
      lineTop: lineTop,
      lineBot: lineBot,
      barTop: barTop,
      barBot: barBot
    };
  }

  function svg(model) {
    model = model || { width: 720, height: 292, slots: [], d: "", yLabels: [] };
    var w = model.width;
    var h = model.height;
    var fontSize = Math.max(11, Number(model.fontSize) || 11);
    var s = "";
    if (isFinite(model.zeroY)) {
      s += '<line class="sa-zero" x1="' + model.padL + '" x2="' + (w - model.padR) + '" y1="' + model.zeroY.toFixed(1) + '" y2="' + model.zeroY.toFixed(1) + '"></line>';
    }
    if (isFinite(model.zeroBar)) {
      s += '<line class="sa-zero" x1="' + model.padL + '" x2="' + (w - model.padR) + '" y1="' + model.zeroBar.toFixed(1) + '" y2="' + model.zeroBar.toFixed(1) + '"></line>';
    }
    if (model.d) s += '<path class="sa-line" d="' + model.d + '" fill="none" stroke="' + LINE + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"></path>';
    (model.slots || []).forEach(function (slot) {
      if (!slot.bar) return;
      var b = slot.bar;
      s += '<rect class="sa-bar" data-i="' + slot.i + '" x="' + b.x.toFixed(1) + '" y="' + b.y.toFixed(1) + '" width="' + b.w.toFixed(1) + '" height="' + b.h.toFixed(1) + '" fill="' + b.color + '" rx="1"></rect>';
    });
    (model.yLabels || []).forEach(function (lb) {
      if (!lb.text) return;
      s += '<text x="' + (w - 6) + '" y="' + (lb.y - 4).toFixed(1) + '" fill="' + MUTED + '" font-size="' + fontSize + '" text-anchor="end">' + esc(lb.text) + "</text>";
    });
    if (model.startLabel) s += '<text x="' + model.padL + '" y="' + (h - 8) + '" fill="' + MUTED + '" font-size="' + fontSize + '">' + esc(model.startLabel) + "</text>";
    if (model.endLabel) s += '<text x="' + (w - model.padR) + '" y="' + (h - 8) + '" fill="' + MUTED + '" font-size="' + fontSize + '" text-anchor="end">' + esc(model.endLabel) + "</text>";
    (model.slots || []).forEach(function (slot) {
      s += '<rect class="sa-hit" data-i="' + slot.i + '" x="' + slot.x0.toFixed(1) + '" y="0" width="' + Math.max(0, slot.x1 - slot.x0).toFixed(1) + '" height="' + h + '" fill="none" pointer-events="all"></rect>';
    });
    return '<svg class="sa-svg sa-pnl-svg" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="收益率与盈亏">' + s + "</svg>";
  }

  function present(input) {
    input = input || {};
    if (input.error) {
      var code = errorCode(input.error);
      if (code === "too_many_buckets") return { mode: "blocked", controls: true, message: RANGE_TEXT, chart: null };
      if (code === "invalid_range") return { mode: "blocked", controls: true, message: INVALID_TEXT, chart: null };
      if (input.error.status === 404) return { mode: "legacy", controls: false, message: "", chart: null };
      return { mode: "error", controls: true, message: ERROR_TEXT, chart: null };
    }
    if (!looksLikePayload(input.payload)) return { mode: "legacy", controls: false, message: "", chart: null };
    if (noEquity(input.payload)) return { mode: "empty", controls: true, message: EMPTY_TEXT, chart: null };
    var chart = bucketChart(input.payload, {
      granularity: input.granularity || input.payload.granularity,
      tz: input.tz || input.payload.tz,
      scope: input.scope || input.payload.scope,
      from: input.from,
      clippedToInception: !!input.clippedToInception,
      width: input.width,
      height: input.height
    });
    if (!chart.drawn) return { mode: "empty", controls: true, message: EMPTY_TEXT, chart: chart };
    return { mode: "chart", controls: true, message: "", chart: chart };
  }

  function initialState() {
    return {
      granularity: "day",
      custom: false,
      from: "",
      to: "",
      status: "loading",
      controls: false,
      hadSuccess: false,
      payload: null,
      model: null,
      inception: "",
      tz: "",
      weekStart: "monday",
      notice: "",
      window: null,
      seq: 0,
      realigned: false
    };
  }

  g.PMPnl = {
    UP: UP,
    DOWN: DOWN,
    LINE: LINE,
    DAY_CAP: DAY_CAP,
    EMPTY_TEXT: EMPTY_TEXT,
    ERROR_TEXT: ERROR_TEXT,
    RANGE_TEXT: RANGE_TEXT,
    INVALID_TEXT: INVALID_TEXT,
    FEE_TEXT: FEE_TEXT,
    PARTIAL_TEXT: PARTIAL_TEXT,
    zoneOf: zoneOf,
    todayISO: todayISO,
    dateISO: dateISO,
    civilDate: civilDate,
    addDays: addDays,
    weekStartDate: weekStartDate,
    inclusiveDays: inclusiveDays,
    normalizeGranularity: normalizeGranularity,
    defaultWindow: defaultWindow,
    clampWindow: clampWindow,
    reconcileWindow: reconcileWindow,
    requestPath: requestPath,
    bucketChart: bucketChart,
    svg: svg,
    tooltipHtml: tooltipHtml,
    present: present,
    initialState: initialState,
    clipText: clipText,
    slotIndex: slotIndex,
    unchargedFees: unchargedFees
  };
})(typeof window !== "undefined" ? window : globalThis);
