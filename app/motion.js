/* 总览动效（仅 visual-v4 暗色 overview）
   迷你净值曲线：沿用 SVG data-series 与现有涨跌色描边。拖动探针（竖虚线+圆点+浮层），
   拖动时同步 #ov-eq；松手弹性回到最后一个点。
   缓动 【建议值】easeOutBack，近似 cubic-bezier(.34, 1.56, .64, 1)（与 --ease 同族）。 */
(function () {
  var reduce = document.documentElement.classList.contains("nomo") ||
    (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  function bj(ms) {
    var d = new Date(ms);
    var p = Object.fromEntries(new Intl.DateTimeFormat(undefined, {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(d).map(function (x) { return [x.type, x.value]; }));
    return p.month + "-" + p.day + " " + p.hour + ":" + p.minute;
  }
  function usd(v) {
    return (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function parseMoney(s) {
    if (!s) return null;
    var v = parseFloat(String(s).replace(/[−–—]/g, "-").replace(/[^0-9.\-]/g, ""));
    return isNaN(v) ? null : v;
  }
  /* 【建议值】easeOutBack ≈ cubic-bezier(.34, 1.56, .64, 1) */
  function easeOutBack(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  /* ---------- 迷你净值曲线 · 探针 ---------- */
  var chart = document.getElementById("ov-chart");
  var svg = chart && chart.querySelector("svg[data-series]");
  var big = document.getElementById("ov-eq");
  if (chart && svg && big) {
    var ds = JSON.parse(svg.dataset.series);
    var series = ds.v;
    var line = svg.querySelector("polyline.eq-line") || svg.querySelector("polyline");
    var area = svg.querySelector("polygon.eq-area");
    var probeV = document.getElementById("ov-probe-v");
    var probeDot = document.getElementById("ov-probe-dot");
    var tip = document.getElementById("ov-tip");
    var tipV = document.getElementById("ov-tip-v");
    var tipT = document.getElementById("ov-tip-t");
    var raw = [];
    for (var i = 0; i < line.points.numberOfItems; i++) {
      var p = line.points.getItem(i);
      raw.push({ x: p.x, y: p.y });
    }
    var last = raw.length - 1;
    var vbW = (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) || 300;
    var col = line.getAttribute("stroke") || "#ff5a5f";
    chart.style.setProperty("--probe", col);
    var currentF = last;
    var dragging = false;
    var atRest = true;
    var raf = 0;
    var restText = (big.textContent || "").trim();
    var hasNd = !!big.querySelector(".nd");

    function valueAt(i) {
      var n = series.length, m = raw.length;
      var j = m <= 1 ? 0 : Math.round(i * (n - 1) / Math.max(1, m - 1));
      return series[Math.max(0, Math.min(n - 1, j))];
    }
    function timeAt(i) {
      var m = raw.length, n = series.length;
      return ds.t0 + i * ds.dt * (n - 1) / Math.max(1, m - 1);
    }
    function toHost(x, y) {
      var pt = svg.createSVGPoint();
      pt.x = x; pt.y = y;
      var m = svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      var q = pt.matrixTransform(m);
      var hr = chart.getBoundingClientRect();
      return { x: q.x - hr.left, y: q.y - hr.top };
    }
    function render(resting) {
      if (!raw.length) return;
      var clamped = Math.max(0, Math.min(last, currentF));
      var i0 = Math.floor(clamped);
      var i1 = Math.min(last, i0 + 1);
      var t = clamped - i0;
      var x = raw[i0].x + (raw[i1].x - raw[i0].x) * t;
      var y = raw[i0].y + (raw[i1].y - raw[i0].y) * t;
      if (currentF > last) x += Math.min(6, (currentF - last) * 10);
      if (currentF < 0) x += Math.max(-6, currentF * 10);
      if (x < 0) x = 0;
      if (x > vbW) x = vbW;
      var hp = toHost(x, y);
      var W = chart.clientWidth, H = chart.clientHeight;
      var hx = Math.max(0, Math.min(W - 1, hp.x));
      var hy = Math.max(0, Math.min(H - 1, hp.y));
      if (probeV) probeV.style.transform = "translateX(" + hx.toFixed(1) + "px)";
      if (probeDot) probeDot.style.transform = "translate(" + (hx - 5).toFixed(1) + "px," + (hy - 5).toFixed(1) + "px)";
      var idx = Math.round(clamped);
      var val = valueAt(idx);
      if (tipV) tipV.textContent = usd(val);
      if (tipT) tipT.textContent = bj(timeAt(idx));
      if (tip) {
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var tx = hx - tw / 2;
        var ty = hy - th - 8;
        if (tx < 4) tx = 4;
        if (tx + tw > W - 4) tx = Math.max(4, W - tw - 4);
        if (ty < 2) ty = hy + 12;
        if (ty + th > H - 2) ty = Math.max(2, H - th - 2);
        tip.style.transform = "translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px)";
      }
      if (hasNd || big.querySelector(".sk") || document.documentElement.classList.contains("pending-metrics")) return;
      if (resting && idx === last) {
        var live = parseMoney(restText);
        var endV = valueAt(last);
        big.textContent = (live == null || Math.abs(live - endV) < 0.02) ? usd(endV) : restText;
      } else big.textContent = usd(val);
    }
    /* api.js 用实时 equity_curve 重画曲线后派发 pm:curve；这里重读序列、点位和静止读数，不再沿用示例值。 */
    chart.addEventListener("pm:curve", function () {
      try { ds = JSON.parse(svg.dataset.series); } catch (e) { return; }
      series = ds.v || [];
      raw = [];
      for (var k = 0; k < line.points.numberOfItems; k++) {
        var q = line.points.getItem(k);
        raw.push({ x: q.x, y: q.y });
      }
      last = raw.length - 1;
      col = line.getAttribute("stroke") || col;
      chart.style.setProperty("--probe", col);
      restText = (big.textContent || "").trim();
      hasNd = !!big.querySelector(".nd");
      currentF = last;
      atRest = true;
      if (raw.length) render(true);
    });
    function idxFromClient(clientX) {
      var pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = 0;
      var m = svg.getScreenCTM();
      if (!m) return last;
      var x = pt.matrixTransform(m.inverse()).x;
      var best = 0, bd = 1e9;
      for (var j = 0; j < raw.length; j++) {
        var dd = Math.abs(raw[j].x - x);
        if (dd < bd) { bd = dd; best = j; }
      }
      return best;
    }
    function springTo(target) {
      var from = currentF;
      if (reduce || Math.abs(from - target) < 0.01) {
        currentF = target;
        atRest = true;
        render(true);
        return;
      }
      var t0 = performance.now();
      var DUR = 560; /* 【建议值】ms */
      if (raf) cancelAnimationFrame(raf);
      function frame(now) {
        if (dragging) return;
        var u = Math.min(1, (now - t0) / DUR);
        currentF = from + (target - from) * easeOutBack(u);
        if (u < 1) {
          render(false);
          raf = requestAnimationFrame(frame);
        } else {
          currentF = target;
          atRest = true;
          render(true);
          raf = 0;
          big.classList.remove("eq-spring");
          void big.offsetWidth;
          big.classList.add("eq-spring");
        }
      }
      raf = requestAnimationFrame(frame);
    }
    function growIn() {
      if (reduce || !line.getTotalLength) return;
      var len = 0;
      try { len = line.getTotalLength(); } catch (e) { len = 0; }
      if (!len) return;
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      /* 入场描边 【建议值】ease-out，不用回弹，避免 dash 过冲 */
      line.style.transition = "stroke-dashoffset .9s cubic-bezier(.22,.8,.3,1)";
      if (area) {
        area.style.opacity = "0";
        area.style.transition = "opacity .9s ease";
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          line.style.strokeDashoffset = "0";
          if (area) area.style.opacity = "1";
        });
      });
    }
    chart.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      if (atRest) restText = (big.textContent || "").trim();
      dragging = true;
      atRest = false;
      if (raf) cancelAnimationFrame(raf);
      chart.classList.add("is-dragging");
      try { chart.setPointerCapture(e.pointerId); } catch (err) {}
      currentF = idxFromClient(e.clientX);
      render(false);
      e.preventDefault();
    });
    chart.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      currentF = idxFromClient(e.clientX);
      render(false);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      chart.classList.remove("is-dragging");
      springTo(last);
    }
    chart.addEventListener("pointerup", endDrag);
    chart.addEventListener("pointercancel", endDrag);

    var q = new URLSearchParams(location.search).get("probe");
    var initIdx = last;
    if (q === "mid") initIdx = Math.floor(last / 2);
    else if (q != null && q !== "" && !isNaN(+q)) initIdx = Math.max(0, Math.min(last, +q | 0));
    currentF = initIdx;
    if (initIdx !== last) atRest = false;
    growIn();
    render(initIdx === last);
    chart.classList.add("is-ready");
    addEventListener("resize", function () { render(atRest); });
  }
})();
