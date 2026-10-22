/* 总览净值曲线兜底。reasons.equity_curve_omitted 非空时，曲线和合计不是同一口径。 */
(function (g) {
  /* 返回缺失实例数；-1 表示「知道有缺，但数不清」，界面只写「曲线不完整」。
     2026-10-22 线上实测是逗号分隔的实例名："catunknown20000,example,fees2000,…"。
     以前用正则抓第一个数字，把 catunknown20000 里的 20000 当成了实例数。 */
  function omittedEquityNames(v) {
    if (Array.isArray(v)) return v.map(String);
    if (v && typeof v === "object") {
      if (Array.isArray(v.strategies)) return v.strategies.map(String);
      if (Array.isArray(v.instances)) return v.instances.map(String);
    }
    if (typeof v === "string" && /[,;，]/.test(v)) return v.split(/[,;，]/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (typeof v === "string" && /^[A-Za-z0-9_.:-]+$/.test(v.trim()) && !/^\d+$/.test(v.trim())) return [v.trim()];
    return null;
  }
  function omittedEquityCount(v) {
    if (v == null || v === false || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    var names = omittedEquityNames(v);
    if (names) return names.length;
    if (typeof v === "string") {
      var t = v.trim();
      if (/^\d+$/.test(t)) return Number(t);
      return t ? -1 : 0;
    }
    if (typeof v === "object") {
      if (typeof v.count === "number" || typeof v.count === "string") return omittedEquityCount(String(v.count).trim() === "" ? "" : Number(v.count));
      if (typeof v.n === "number" || typeof v.n === "string") return omittedEquityCount(Number(v.n));
      var k = Object.keys(v).length;
      return k;
    }
    return 0;
  }
  function equityCurveCaption(n) {
    if (!n) return null;
    return { title: "已统计实例净值", note: n > 0 ? "曲线不完整：缺 " + n + " 个实例" : "曲线不完整" };
  }
  g.PMEquity = { omittedEquityNames: omittedEquityNames, omittedEquityCount: omittedEquityCount, equityCurveCaption: equityCurveCaption };
})(typeof globalThis !== "undefined" ? globalThis : this);
