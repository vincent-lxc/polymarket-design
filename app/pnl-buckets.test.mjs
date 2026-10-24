import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("./pnl-buckets.js", import.meta.url), "utf8");
const sandbox = { window: {}, globalThis: null, console, URLSearchParams, Intl, Date };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox);
const P = sandbox.PMPnl;

const NOW = Date.parse("2026-10-24T04:00:00Z");
const FORBIDDEN = ["待建", "校准中", "S0", "未命名", "示意"];

assert.equal(P.initialState().granularity, "day");
assert.equal(P.initialState().controls, false);

const day = P.defaultWindow("day", { now: NOW, tz: "Asia/Shanghai" });
assert.equal(day.granularity, "day");
assert.equal(day.to, "2026-10-24");
assert.equal(day.from, "2026-09-25");
assert.equal(P.inclusiveDays(day.from, day.to), 30);

const week = P.defaultWindow("week", { now: NOW, tz: "Asia/Shanghai", week_start: "monday" });
assert.equal(week.to, "2026-10-24");
assert.equal(week.from, P.addDays(P.weekStartDate("2026-10-24", "monday"), -25 * 7));
assert.equal(P.weekStartDate(week.from, "monday"), week.from);
let mondays = 0;
for (let d = week.from; d <= week.to; d = P.addDays(d, 7)) mondays += 1;
assert.equal(mondays, 26);
assert.equal(P.weekStartDate("2026-10-24", "sunday"), "2026-10-18");

const month = P.defaultWindow("month", { now: NOW, tz: "Asia/Shanghai" });
assert.equal(month.from, "2025-11-01");
assert.equal(month.to, "2026-10-24");

const year = P.defaultWindow("year", { now: NOW, tz: "Asia/Shanghai", inception: "2026-10-14T00:00:00+08:00" });
assert.equal(year.from, "2026-10-14");
assert.equal(year.to, "2026-10-24");

const custom = P.clampWindow("2026-10-01", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day", inception: "2026-09-01T00:00:00+08:00" });
assert.equal(custom.from, "2026-10-01");
assert.equal(custom.to, "2026-10-24");
assert.equal(P.inclusiveDays(custom.from, custom.to), 24);
assert.equal(custom.warn, "");

const tooEarly = P.clampWindow("2026-10-01", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day", inception: "2026-10-14T00:00:00+08:00" });
assert.equal(tooEarly.from, "2026-10-14");
assert.equal(tooEarly.min, "2026-10-14");

const longOk = P.clampWindow("2025-10-24", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day" });
assert.equal(P.inclusiveDays(longOk.from, longOk.to), 366);
assert.equal(longOk.warn, "");
const tooLong = P.clampWindow("2025-10-23", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day" });
assert.equal(tooLong.warn, P.RANGE_TEXT);

const shifted = P.reconcileWindow({
  granularity: "day",
  custom: false,
  from: "2026-09-25",
  to: "2026-10-24"
}, { inception_at: "2026-10-14T00:00:00+08:00", tz: "Asia/Shanghai", week_start: "monday" }, NOW);
assert.equal(shifted.from, "2026-10-14");
assert.equal(P.reconcileWindow({ granularity: "day", custom: true, from: "2026-09-25", to: "2026-10-24" }, { inception_at: "2026-10-14T00:00:00+08:00" }, NOW), null);
assert.equal(P.reconcileWindow({ granularity: "day", custom: false, from: "2026-10-14", to: "2026-10-24" }, { inception_at: "2026-10-14T00:00:00+08:00" }, NOW), null);

function row(start, end, extra) {
  return Object.assign({
    period_start: start,
    period_end: end,
    has_data: true,
    nav_end: 20000,
    pnl_net: 10,
    fees: 1,
    period_return_pct: 0.01,
    cum_return_pct: 0.01
  }, extra);
}

const gapPayload = {
  tz: "Asia/Shanghai",
  week_start: "monday",
  inception_at: "2026-10-14T00:00:00+08:00",
  fees_estimated: true,
  buckets: [
    row("2026-10-22T00:00:00+08:00", "2026-10-23T00:00:00+08:00", { pnl_net: 100, nav_end: 20100, period_return_pct: 0.005, cum_return_pct: 0.2, fees_estimated: true }),
    row("2026-10-23T00:00:00+08:00", "2026-10-24T00:00:00+08:00", { has_data: false, pnl_net: 0, nav_end: 0, fees: 0, period_return_pct: 0, cum_return_pct: 0, fees_estimated: true }),
    row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00", { pnl_net: -40, nav_end: 70100, period_return_pct: 0.01, cum_return_pct: 0.21, fees_estimated: false })
  ]
};
const gap = P.bucketChart(gapPayload, { granularity: "day" });
assert.equal(gap.slots.length, 3);
assert.equal(gap.slots[1].has, false);
assert.equal(gap.slots[1].bar, null);
assert.equal(gap.slots[1].plot, false);
assert.equal(gap.slots[1].pnl, null);
assert.equal(gap.slots[0].cumBefore, 0);
assert.ok(Math.abs(gap.slots[0].cum - 0.005) < 1e-12);
assert.ok(Math.abs(gap.slots[2].cum - ((1.005 * 1.01) - 1)) < 1e-12);
const gapSvg = P.svg(gap);
assert.equal((gapSvg.match(/class="sa-bar"/g) || []).length, 2);
assert.match(gapSvg, /#2fd47a/);
assert.match(gapSvg, /#ff5a5f/);
assert.match(gapSvg, /#FF6A1F/);
assert.doesNotMatch(gapSvg, /class="sa-bar"[^>]*fill="#2fd47a"[^>]*fill="#2fd47a"/);
const emptyTip = P.tooltipHtml(gap.slots[1].tip);
assert.match(emptyTip, /无数据/);
assert.doesNotMatch(emptyTip, /\$0\.00|0%|NaN|undefined|−100%/);
const firstTip = P.tooltipHtml(gap.slots[0].tip);
assert.match(firstTip, /10-22/);
assert.match(firstTip, /当期盈亏/);
assert.match(firstTip, /\+\$100\.00/);
assert.match(firstTip, /当期收益率/);
assert.match(firstTip, /累计收益率/);
assert.match(firstTip, /期末净值/);
assert.match(firstTip, /手续费为估算/);
assert.match(firstTip, /\+0\.5%/);
assert.doesNotMatch(P.tooltipHtml(gap.slots[2].tip), /手续费为估算/);
assert.doesNotMatch(emptyTip, /手续费为估算/);
assert.equal(gap.slots[0].tip.title, "10-22");
assert.equal(gap.slots[2].tip.title, "10-24");
const zeroY = gap.d.match(/M([\d.]+) ([\d.]+)/);
assert.ok(Math.abs(Number(zeroY[2]) - gap.zeroY) < 0.2);
assert.ok(gap.d.indexOf("M") !== gap.d.lastIndexOf("M"));

const periodOnly = P.bucketChart({
  tz: "Asia/Shanghai",
  fees_estimated: false,
  buckets: [row("2026-10-22T00:00:00+08:00", "2026-10-23T00:00:00+08:00", { fees_estimated: true, pnl_net: 12 })]
}, { granularity: "day" });
assert.match(P.tooltipHtml(periodOnly.slots[0].tip), /手续费为估算/);
const topOnly = P.bucketChart({
  tz: "Asia/Shanghai",
  fees_estimated: true,
  buckets: [row("2026-10-22T00:00:00+08:00", "2026-10-23T00:00:00+08:00", { fees_estimated: false, pnl_net: 12 })]
}, { granularity: "day" });
assert.doesNotMatch(P.tooltipHtml(topOnly.slots[0].tip), /手续费为估算/);

const deposit = P.bucketChart({
  tz: "Asia/Shanghai",
  buckets: [
    row("2026-10-23T00:00:00+08:00", "2026-10-24T00:00:00+08:00", { pnl_net: 100, nav_end: 20100, period_return_pct: 0.005 }),
    row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00", { pnl_net: 8, nav_end: 70100, period_return_pct: 0.0004 })
  ]
}, { granularity: "day" });
assert.ok(Math.abs(deposit.slots[1].bar.h / deposit.slots[0].bar.h - 0.08) < 0.02);
assert.ok(deposit.slots[1].bar.h < deposit.slots[0].bar.h);
assert.ok(deposit.slots[1].nav - deposit.slots[0].nav > 1000);

const viaItems = P.bucketChart({ items: [row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00")] }, { granularity: "day" });
assert.equal(viaItems.slots.length, 1);
assert.equal(viaItems.slots[0].bar == null, false);

const young = [];
for (let i = 0; i < 10; i++) {
  young.push(row("2026-10-" + String(15 + i).padStart(2, "0") + "T00:00:00+08:00", "2026-10-" + String(16 + i).padStart(2, "0") + "T00:00:00+08:00", { pnl_net: i % 2 ? -3 : 4 }));
}
const youngChart = P.bucketChart({ buckets: young }, { granularity: "day" });
assert.equal(youngChart.slots.length, 10);
assert.equal((P.svg(youngChart).match(/class="sa-bar"/g) || []).length, 10);

const clipped = P.present({
  granularity: "day",
  payload: {
    tz: "Asia/Shanghai",
    week_start: "monday",
    clipped_from: "2026-10-01",
    segment_start_at: "2026-10-18T00:00:00+08:00",
    buckets: [row("2026-10-18T00:00:00+08:00", "2026-10-19T00:00:00+08:00")]
  }
});
assert.equal(clipped.mode, "chart");
assert.equal(clipped.controls, true);
assert.equal(clipped.chart.clip, "已从当前分段开始（10-18）");
assert.equal(P.clipText({ segment_start_at: "2026-10-18T00:00:00+08:00" }, "Asia/Shanghai"), "已从当前分段开始（10-18）");
assert.equal(P.clipText({ clipped_from: null, segment_start_at: null }, "Asia/Shanghai"), "");

const none = P.present({
  payload: {
    tz: "Asia/Shanghai",
    buckets: [row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00", { has_data: false, pnl_net: null, nav_end: null, period_return_pct: null, cum_return_pct: null })]
  }
});
assert.equal(none.mode, "empty");
assert.equal(none.message, "这段时间还没有数据");
assert.equal((P.svg(none.chart).match(/class="sa-bar"/g) || []).length, 0);

const missing = P.present({ error: { status: 404 }, hadSuccess: false });
assert.equal(missing.mode, "legacy");
assert.equal(missing.controls, false);
assert.equal(missing.chart, null);
assert.equal(missing.message, "");
const offline = P.present({ error: { status: 0, offline: true }, hadSuccess: false });
assert.equal(offline.mode, "legacy");
assert.equal(offline.chart, null);
const later = P.present({ error: { status: 500 }, hadSuccess: true });
assert.equal(later.mode, "error");
assert.equal(later.controls, true);
assert.equal(later.message, "图表暂时加载不了，稍后刷新");
assert.equal(later.chart, null);
const gone = P.present({ error: { status: 404 }, hadSuccess: true });
assert.equal(gone.mode, "legacy");
assert.equal(gone.controls, false);
assert.equal(gone.chart, null);

assert.equal(P.requestPath("paper20000", { granularity: "week", from: "2026-04-27", to: "2026-10-24", scope: "current_segment" }), "/v1/accounts/paper20000/pnl-buckets?granularity=week&from=2026-04-27&to=2026-10-24&scope=current_segment");
assert.match(P.requestPath("11111111-1111-4111-8111-111111111111", { granularity: "day", from: day.from, to: day.to, scope: "all" }), /granularity=day/);

const src = fs.readFileSync(new URL("./pnl-buckets.js", import.meta.url), "utf8");
for (const word of FORBIDDEN) assert.equal(src.includes(word), false, word);
assert.equal(gapSvg.includes("NaN"), false);
assert.equal(gapSvg.includes("undefined"), false);

const right = gap.slots[gap.slots.length - 1];
assert.ok(Math.abs(right.x1 - (gap.width - gap.padR)) < 0.2);

console.log("pnl-buckets tests ok");
