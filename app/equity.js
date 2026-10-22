/* 总览净值曲线兜底。reasons.equity_curve_omitted 非空时，曲线和合计不是同一口径。 */
(function (g) {
  function omittedEquityCount(v) {
    if (v == null || v === false || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    if (typeof v === "string") {
      var t = v.trim();
      if (/^\d+$/.test(t)) return Number(t);
      var m = t.match(/\d+/);
      return m ? Number(m[0]) : 1;
    }
    if (Array.isArray(v)) return v.length;
    if (typeof v === "object") {
      if (Array.isArray(v.strategies)) return v.strategies.length;
      if (Array.isArray(v.instances)) return v.instances.length;
      if (typeof v.count === "number" || typeof v.count === "string") return omittedEquityCount(v.count);
      if (typeof v.n === "number" || typeof v.n === "string") return omittedEquityCount(v.n);
      return Object.keys(v).length;
    }
    return 0;
  }
  function equityCurveCaption(n) {
    if (!n) return null;
    return { title: "已统计实例净值", note: "曲线不完整：缺 " + n + " 个实例" };
  }
  g.PMEquity = { omittedEquityCount: omittedEquityCount, equityCurveCaption: equityCurveCaption };
})(typeof globalThis !== "undefined" ? globalThis : this);
