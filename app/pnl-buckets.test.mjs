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

const year = P.defaultWindow("year", { now: NOW, tz: "Asia/Shanghai", inception: "2026-10-14T09:00:00Z" });
assert.equal(year.from, "2026-01-01");
assert.equal(year.to, "2026-10-24");
assert.equal(P.defaultWindow("year", { now: NOW, tz: "Asia/Shanghai" }).from, "2026-01-01");
assert.equal(P.defaultWindow("year", { now: NOW, tz: "Asia/Shanghai", inception: "2025-06-02T00:00:00+08:00" }).from, "2025-01-01");
const dayYoung = P.defaultWindow("day", { now: NOW, tz: "Asia/Shanghai", inception: "2026-10-14T09:00:00Z" });
assert.equal(dayYoung.from, "2026-09-25");
assert.equal(P.defaultWindow("week", { now: NOW, tz: "Asia/Shanghai", week_start: "monday", inception: "2026-10-14T09:00:00Z" }).from, week.from);

const custom = P.clampWindow("2026-10-01", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day", custom: true, inception: "2026-09-01T00:00:00+08:00" });
assert.equal(custom.from, "2026-10-01");
assert.equal(custom.to, "2026-10-24");
assert.equal(P.inclusiveDays(custom.from, custom.to), 24);
assert.equal(custom.warn, "");

const tooEarly = P.clampWindow("2026-10-01", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day", custom: true, inception: "2026-10-14T00:00:00+08:00" });
assert.equal(tooEarly.from, "2026-10-14");
assert.equal(tooEarly.min, "2026-10-14");
assert.equal(tooEarly.clippedToInception, true);
const preset = P.clampWindow("2026-09-25", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day", inception: "2026-10-14T00:00:00+08:00" });
assert.equal(preset.from, "2026-09-25");
assert.equal(preset.clippedToInception, false);
assert.equal(P.rememberRequestedFrom("", "pnl-from", "2026-10-01"), "2026-10-01");
assert.equal(P.rememberRequestedFrom("2026-10-01", "pnl-to", "2026-10-14"), "2026-10-01");
assert.equal(P.rememberRequestedFrom("2026-10-01", "pnl-from", "2026-10-20"), "2026-10-20");
assert.equal(P.rememberRequestedFrom("2026-10-01", "granularity", "2026-10-01"), "");
assert.equal(P.rememberRequestedFrom("", "pnl-to", "2026-09-25"), "2026-09-25");
const keptFrom = P.rememberRequestedFrom("2026-10-01", "pnl-to", "2026-10-14");
const keptClip = P.clampWindow(keptFrom, "2026-10-20", { now: NOW, tz: "Asia/Shanghai", granularity: "day", custom: true, inception: "2026-10-14T09:00:00Z" });
assert.equal(keptClip.from, "2026-10-14");
assert.equal(keptClip.clippedToInception, true);
assert.equal(P.clipText({ inception_at: "2026-10-14T09:00:00Z", tz: "Asia/Shanghai" }, { scope: "all", tz: "Asia/Shanghai", clippedToInception: keptClip.clippedToInception }), "账户 10-14 开始运行，已从这天开始");
const dropped = P.clampWindow("2026-10-14", "2026-10-20", { now: NOW, tz: "Asia/Shanghai", granularity: "day", custom: true, inception: "2026-10-14T09:00:00Z" });
assert.equal(dropped.clippedToInception, false);

const longOk = P.clampWindow("2025-10-24", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day" });
assert.equal(P.inclusiveDays(longOk.from, longOk.to), 366);
assert.equal(longOk.warn, "");
const tooLong = P.clampWindow("2025-10-23", "2026-10-24", { now: NOW, tz: "Asia/Shanghai", granularity: "day" });
assert.equal(tooLong.warn, P.RANGE_TEXT);

assert.equal(P.reconcileWindow({
  granularity: "day",
  custom: false,
  from: "2026-09-25",
  to: "2026-10-24"
}, { inception_at: "2026-10-14T09:00:00Z", tz: "Asia/Shanghai", week_start: "monday" }, NOW), null);
assert.equal(P.reconcileWindow({ granularity: "day", custom: true, from: "2026-09-25", to: "2026-10-24" }, { inception_at: "2026-10-14T00:00:00+08:00" }, NOW), null);
assert.equal(P.reconcileWindow({ granularity: "year", custom: false, from: "2026-01-01", to: "2026-10-24" }, { inception_at: "2026-10-14T09:00:00Z", tz: "Asia/Shanghai" }, NOW), null);
const yearShift = P.reconcileWindow({
  granularity: "year",
  custom: false,
  from: "2026-01-01",
  to: "2026-10-24"
}, { inception_at: "2025-03-01T00:00:00+08:00", tz: "Asia/Shanghai", week_start: "monday" }, NOW);
assert.equal(yearShift.from, "2025-01-01");
assert.equal(yearShift.to, "2026-10-24");

function row(start, end, extra) {
  var label = String(start || "").slice(5, 10);
  return Object.assign({
    period_start: start,
    period_end: end,
    label: label,
    has_data: true,
    nav_start: 20000,
    nav_end: 20010,
    flow_usd: 0,
    pnl_net: 10,
    fees: 1,
    fees_uncharged: 0,
    fees_estimated: false,
    period_return_pct: 0.01,
    cum_return_pct: 0.01,
    segment: 1,
    partial: false
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
assert.equal(gap.slots[0].cum, 0.2);
assert.equal(gap.slots[2].cumBefore, 0.2);
assert.equal(gap.slots[2].cum, 0.21);
assert.equal(gap.slots[1].cum, null);
assert.notEqual(gap.slots[0].cum, gap.slots[0].pr);
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

const ignoredItems = P.bucketChart({ tz: "Asia/Shanghai", items: [row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00")] }, { granularity: "day" });
assert.equal(ignoredItems.slots.length, 0);
assert.equal(ignoredItems.drawn, false);

const young = [];
for (let i = 0; i < 10; i++) {
  young.push(row("2026-10-" + String(15 + i).padStart(2, "0") + "T00:00:00+08:00", "2026-10-" + String(16 + i).padStart(2, "0") + "T00:00:00+08:00", { pnl_net: i % 2 ? -3 : 4 }));
}
const youngChart = P.bucketChart({ buckets: young }, { granularity: "day" });
assert.equal(youngChart.slots.length, 10);
assert.equal((P.svg(youngChart).match(/class="sa-bar"/g) || []).length, 10);

const clipped = P.present({
  granularity: "day",
  scope: "current_segment",
  from: "2026-10-01",
  payload: {
    tz: "Asia/Shanghai",
    week_start: "monday",
    scope: "current_segment",
    clipped_from: null,
    segment_start_at: "2026-10-18T00:00:00+08:00",
    inception_at: "2026-10-14T00:00:00+08:00",
    fee_basis: "estimated_deducted",
    fees_estimated: true,
    currency: "USD",
    totals: { pnl_net: 10, fees: 1, return_pct: 0.01 },
    reasons: {},
    buckets: [row("2026-10-18T00:00:00+08:00", "2026-10-19T00:00:00+08:00", { label: "10-18", fees_estimated: true, partial: true, cum_return_pct: 0.01 })]
  }
});
assert.equal(clipped.mode, "chart");
assert.equal(clipped.controls, true);
assert.equal(clipped.chart.clip, "已从当前分段开始（10-18）");
assert.equal(clipped.chart.slots[0].tip.title, "10-18");
assert.match(P.tooltipHtml(clipped.chart.slots[0].tip), /本期未结束/);
assert.match(P.svg(clipped.chart), />10-18</);
assert.equal(P.clipText({ scope: "current_segment", segment_start_at: "2026-10-18T00:00:00+08:00" }, { scope: "current_segment", from: "2026-10-01", tz: "Asia/Shanghai" }), "已从当前分段开始（10-18）");
assert.equal(P.clipText({ scope: "current_segment", segment_start_at: "2026-10-18T00:00:00+08:00" }, { scope: "current_segment", from: "2026-10-20", tz: "Asia/Shanghai" }), "");
assert.equal(P.clipText({ scope: "all", clipped_from: null, segment_start_at: null }, { scope: "all" }), "");
assert.equal(P.clipText({ scope: "all", clipped_from: null, inception_at: "2026-10-14T09:00:00Z" }, { scope: "all", tz: "Asia/Shanghai" }), "账户 10-14 开始运行");
assert.equal(P.clipText({ scope: "all", clipped_from: "2026-09-25", inception_at: "2026-10-14T09:00:00Z" }, { scope: "all", tz: "Asia/Shanghai" }), "账户 10-14 开始运行");
assert.equal(P.clipText({ scope: "all", clipped_from: "2026-09-25", inception_at: null }, { scope: "all", tz: "Asia/Shanghai" }), "");
assert.equal(P.clipText({ scope: "all", inception_at: "2026-10-14T09:00:00Z", tz: "Asia/Shanghai" }, { scope: "all", tz: "Asia/Shanghai", clippedToInception: true }), "账户 10-14 开始运行，已从这天开始");
const clippedStart = P.present({
  scope: "all",
  from: "2026-10-14",
  clippedToInception: true,
  payload: {
    tz: "Asia/Shanghai",
    inception_at: "2026-10-14T09:00:00Z",
    fees_estimated: false,
    buckets: [row("2026-10-14T00:00:00+08:00", "2026-10-15T00:00:00+08:00", { label: "10-14", cum_return_pct: 0.01 })]
  }
});
assert.equal(clippedStart.chart.clip, "账户 10-14 开始运行，已从这天开始");

const opened = P.present({
  scope: "all",
  from: "2026-10-12",
  payload: {
    tz: "Asia/Shanghai",
    scope: "all",
    clipped_from: "2026-10-12",
    segment_start_at: null,
    inception_at: "2026-10-14T00:00:00+08:00",
    fee_basis: "charged",
    fees_estimated: false,
    currency: "USD",
    totals: { pnl_net: 8, fees: 1, return_pct: 0.0004 },
    reasons: {},
    week_start: "monday",
    buckets: [
      row("2026-10-12T00:00:00+08:00", "2026-10-13T00:00:00+08:00", { has_data: false, label: "10-12", nav_start: null, nav_end: null, flow_usd: null, pnl_net: null, fees: null, fees_uncharged: null, period_return_pct: null, cum_return_pct: null }),
      row("2026-10-14T00:00:00+08:00", "2026-10-15T00:00:00+08:00", { label: "10-14", pnl_net: 8, cum_return_pct: 0.0004, partial: true, flow_usd: 5000, nav_start: 20000 })
    ]
  }
});
assert.equal(opened.mode, "chart");
assert.equal(opened.chart.clip, "账户 10-14 开始运行");
assert.equal(opened.chart.slots[0].bar, null);
assert.equal(opened.chart.slots[0].plot, false);
assert.equal(opened.chart.slots[0].flow, null);
assert.equal(opened.chart.slots[1].flow, 5000);
assert.equal(opened.chart.slots[1].navStart, 20000);
assert.equal(opened.chart.startLabel, "10-12");
assert.equal(opened.chart.endLabel, "10-14");
assert.match(P.tooltipHtml(opened.chart.slots[1].tip), /本期未结束/);
assert.doesNotMatch(P.tooltipHtml(opened.chart.slots[1].tip), /手续费为估算/);
assert.equal(P.clipText({ scope: "current_segment", segment_start_at: null, clipped_from: "2026-10-12", inception_at: "2026-10-14T00:00:00+08:00" }, { scope: "current_segment", from: "2026-10-12", tz: "Asia/Shanghai" }), "账户 10-14 开始运行");

const weekLabel = P.bucketChart({
  tz: "Asia/Shanghai",
  granularity: "week",
  buckets: [row("2026-10-19T00:00:00+08:00", "2026-10-26T00:00:00+08:00", { label: "10-19~10-25", cum_return_pct: 0.02 })]
}, { granularity: "week" });
assert.equal(weekLabel.slots[0].tip.title, "10-19~10-25");
assert.match(P.svg(weekLabel), /10-19~10-25/);
const monthLabel = P.bucketChart({ buckets: [row("2026-10-01T00:00:00+08:00", "2026-11-01T00:00:00+08:00", { label: "2026-10" })] }, { granularity: "month" });
assert.equal(monthLabel.slots[0].tip.title, "2026-10");
const yearLabel = P.bucketChart({ buckets: [row("2026-01-01T00:00:00+08:00", "2027-01-01T00:00:00+08:00", { label: "2026" })] }, { granularity: "year" });
assert.equal(yearLabel.slots[0].tip.title, "2026");
assert.match(P.svg(yearLabel), />2026</);

const bare = P.present({
  payload: {
    tz: "Asia/Shanghai",
    fee_basis: "charged",
    fees_estimated: false,
    currency: "USD",
    totals: { pnl_net: null, fees: null, return_pct: null },
    reasons: { buckets: "no_equity_points" },
    buckets: [row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00", { pnl_net: 100, nav_end: 20100 })]
  }
});
assert.equal(bare.mode, "empty");
assert.equal(bare.chart, null);
assert.equal(bare.message, P.EMPTY_TEXT);

const many = P.present({ error: { status: 400, code: "too_many_buckets" }, hadSuccess: true });
assert.equal(many.mode, "blocked");
assert.equal(many.controls, true);
assert.equal(many.message, "区间太长，请改用周或月");
assert.equal(many.chart, null);
const badOrder = P.present({ error: { status: 400, code: "invalid_range", body: { error: "invalid_range" } }, hadSuccess: false });
assert.equal(badOrder.mode, "blocked");
assert.equal(badOrder.controls, true);
assert.equal(badOrder.message, "开始日期晚于结束日期");
const fromBody = P.present({ error: { status: 400, body: { error: "too_many_buckets", message: "区间太长，请改用周或月" } }, hadSuccess: false });
assert.equal(fromBody.mode, "blocked");
assert.equal(fromBody.message, P.RANGE_TEXT);

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
assert.equal(offline.mode, "error");
assert.equal(offline.controls, true);
assert.equal(offline.message, P.ERROR_TEXT);
assert.equal(offline.chart, null);
const first500 = P.present({ error: { status: 500 }, hadSuccess: false });
assert.equal(first500.mode, "error");
assert.equal(first500.controls, true);
assert.equal(first500.message, "图表暂时加载不了，稍后刷新");
assert.equal(first500.chart, null);
const later = P.present({ error: { status: 500 }, hadSuccess: true });
assert.equal(later.mode, "error");
assert.equal(later.controls, true);
assert.equal(later.message, "图表暂时加载不了，稍后刷新");
assert.equal(later.chart, null);
const gone = P.present({ error: { status: 404 }, hadSuccess: true });
assert.equal(gone.mode, "legacy");
assert.equal(gone.controls, false);
assert.equal(gone.chart, null);

const feeSplit = P.bucketChart({
  tz: "Asia/Shanghai",
  fees_estimated: true,
  totals: { pnl_net: 10, fees: 0, return_pct: 0.01 },
  buckets: [
    row("2026-10-23T00:00:00+08:00", "2026-10-24T00:00:00+08:00", { fees: 9, fees_uncharged: 1.5, fees_estimated: true }),
    row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00", { fees: 4, fees_uncharged: 2.25, fees_estimated: true })
  ]
}, { granularity: "day" });
assert.equal(feeSplit.feesUncharged, 3.75);
assert.match(feeSplit.feesNote, /估算手续费/);
assert.match(feeSplit.feesNote, /\$3\.75/);
assert.doesNotMatch(feeSplit.feesNote, /\$0\.00|\$13\.00|\$9\.00/);

assert.equal(P.requestPath("fixture-paper", { granularity: "week", from: "2026-04-27", to: "2026-10-24", scope: "current_segment" }), "/v1/accounts/fixture-paper/pnl-buckets?granularity=week&from=2026-04-27&to=2026-10-24&scope=current_segment");
assert.match(P.requestPath("11111111-1111-4111-8111-111111111111", { granularity: "day", from: day.from, to: day.to, scope: "all" }), /granularity=day/);

const src = fs.readFileSync(new URL("./pnl-buckets.js", import.meta.url), "utf8");
for (const word of FORBIDDEN) assert.equal(src.includes(word), false, word);
assert.equal(gapSvg.includes("NaN"), false);
assert.equal(gapSvg.includes("undefined"), false);

const right = gap.slots[gap.slots.length - 1];
assert.ok(Math.abs(right.x1 - (gap.width - gap.padR)) < 0.2);

const orderedLate = P.bucketChart({
  tz: "Asia/Shanghai",
  buckets: [
    row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00", { label: "10-24", cum_return_pct: 0.21, period_return_pct: 0.01 }),
    row("2026-10-22T00:00:00+08:00", "2026-10-23T00:00:00+08:00", { label: "10-22", cum_return_pct: 0.2, period_return_pct: 0.2 })
  ]
}, { granularity: "day" });
assert.equal(orderedLate.slots[0].label, "10-22");
assert.equal(orderedLate.slots[0].cumBefore, 0);
assert.equal(orderedLate.slots[1].label, "10-24");
assert.equal(orderedLate.slots[1].cumBefore, 0.2);

const hitSlots = [];
for (let i = 0; i < 30; i++) hitSlots.push({ x0: i * 24, x1: (i + 1) * 24 });
const letterboxed = {
  getScreenCTM() {
    return { inverse: () => ({ a: 720 / 200, b: 0, c: 0, d: 1, e: -100 * 720 / 200, f: 0 }) };
  },
  createSVGPoint() {
    return { x: 0, y: 0, matrixTransform(m) { return { x: m.a * this.x + m.c * this.y + m.e, y: m.b * this.x + m.d * this.y + m.f }; } };
  }
};
assert.equal(P.slotIndex({ clientX: 250, clientY: 20, target: { closest: () => null } }, letterboxed, hitSlots), 22);
assert.equal(P.slotIndex({
  clientX: 10,
  clientY: 10,
  target: { closest: (sel) => (sel === "rect.sa-hit" ? { dataset: { i: "3" } } : null) }
}, letterboxed, hitSlots), 3);
const sized = P.svg(P.bucketChart({
  tz: "Asia/Shanghai",
  buckets: [row("2026-10-24T00:00:00+08:00", "2026-10-25T00:00:00+08:00", { label: "10-24" })]
}, { width: 286, granularity: "day" }));
assert.match(sized, /viewBox="0 0 286 /);
for (const size of sized.matchAll(/font-size="([0-9.]+)"/g)) assert.ok(Number(size[1]) >= 11);

function loadFx(name) {
  return JSON.parse(fs.readFileSync(new URL("../test/fixtures/pnl/" + name + ".json", import.meta.url), "utf8"));
}
const TOP_KEYS = ["account_id", "granularity", "scope", "tz", "week_start", "from", "to", "clipped_from", "inception_at", "segment_start_at", "fee_basis", "fees_estimated", "currency", "buckets", "totals", "reasons"];
const BUCKET_KEYS = ["period_start", "period_end", "label", "has_data", "nav_start", "nav_end", "flow_usd", "pnl_net", "fees", "fees_uncharged", "fees_estimated", "period_return_pct", "cum_return_pct", "segment", "partial"];
const fxDay = loadFx("day");
const fxWeek = loadFx("week");
const fxMonth = loadFx("month");
const fxYear = loadFx("year");
const fxSeg = loadFx("current-segment");
const fxAll = loadFx("all-from-inception");
const fxCard = loadFx("card");
for (const fx of [fxDay, fxWeek, fxMonth, fxYear, fxSeg, fxAll]) {
  for (const key of TOP_KEYS) assert.equal(Object.prototype.hasOwnProperty.call(fx, key), true, key);
  assert.equal(Array.isArray(fx.buckets), true);
  assert.equal(fx.items, undefined);
  assert.equal(fx.tz, "Asia/Shanghai");
  assert.equal(fx.week_start, "monday");
  assert.equal(fx.fees_estimated, true);
  assert.equal(fx.fee_basis, "estimated_deducted");
  assert.equal(fx.currency, "USD");
  assert.equal(fx.totals.fees, 0);
  assert.equal(fx.inception_at, "2026-10-14T09:00:00Z");
  assert.equal(fx.segment_start_at, null);
  assert.equal(P.clipText(fx, { scope: fx.scope, from: fx.from, tz: fx.tz }), "账户 10-14 开始运行");
  assert.doesNotMatch(P.clipText(fx, { scope: fx.scope, from: fx.from, tz: fx.tz }), /09-25|10-01|04-27/);
  fx.buckets.forEach(function (b) {
    for (const key of BUCKET_KEYS) assert.equal(Object.prototype.hasOwnProperty.call(b, key), true, key);
    if (!b.has_data) {
      assert.equal(b.pnl_net, null);
      assert.equal(b.nav_start, null);
      assert.equal(b.nav_end, null);
      assert.equal(b.flow_usd, null);
      assert.equal(b.fees, null);
      assert.equal(b.fees_uncharged, null);
      assert.equal(b.period_return_pct, null);
      assert.equal(b.cum_return_pct, null);
      return;
    }
    for (const key of ["nav_start", "nav_end", "flow_usd", "pnl_net", "fees", "fees_uncharged"]) {
      if (!Number.isFinite(b[key])) continue;
      assert.ok(Math.abs(b[key] * 100 - Math.round(b[key] * 100)) < 1e-6, key);
    }
    if ([b.nav_start, b.nav_end, b.flow_usd, b.pnl_net].every((n) => Number.isFinite(n))) {
      assert.ok(Math.abs(b.pnl_net - (b.nav_end - b.nav_start - b.flow_usd)) <= 0.01);
    }
    if (Number.isFinite(b.nav_start) && b.nav_start !== 0 && Number.isFinite(b.period_return_pct)) {
      assert.ok(Math.abs(b.period_return_pct - b.pnl_net / b.nav_start) < 1e-7);
    }
  });
}
assert.equal(fxDay.granularity, "day");
assert.equal(fxDay.scope, "all");
assert.equal(fxDay.from, "2026-09-25");
assert.equal(fxDay.buckets.length, 30);
assert.equal(fxDay.buckets[0].label, "09-25");
assert.equal(fxDay.buckets[0].has_data, false);
assert.equal(fxDay.buckets.at(-1).label, "10-24");
assert.equal(fxWeek.buckets.length, 26);
assert.match(fxWeek.buckets[0].label, /^\d{2}-\d{2}~\d{2}-\d{2}$/);
assert.equal(fxWeek.buckets.at(-1).label, "10-19~10-25");
assert.equal(fxMonth.buckets.length, 12);
assert.equal(fxMonth.buckets[0].label, "2025-11");
assert.equal(fxMonth.buckets.at(-1).label, "2026-10");
assert.equal(fxYear.buckets.length, 1);
assert.equal(fxYear.from, "2026-01-01");
assert.equal(fxYear.buckets[0].label, "2026");
assert.equal(fxYear.buckets[0].partial, true);
assert.equal(fxSeg.scope, "current_segment");
assert.equal(fxSeg.granularity, "day");
assert.equal(fxSeg.buckets.length, 30);
const dayChart = P.present({ payload: fxDay, granularity: "day", scope: "all", from: fxDay.from, tz: fxDay.tz });
assert.equal(dayChart.mode, "chart");
assert.equal(dayChart.chart.slots.filter((s) => s.bar).length, 11);
assert.equal(dayChart.chart.slots[0].bar, null);
assert.equal(dayChart.chart.clip, "账户 10-14 开始运行");
function sumField(payload, key) {
  return payload.buckets.reduce((s, b) => s + (b.has_data && Number.isFinite(b[key]) ? b[key] : 0), 0);
}
function usdText(n) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const dayFees = sumField(fxDay, "fees_uncharged");
assert.ok(Math.abs(dayChart.chart.feesUncharged - dayFees) < 1e-6);
assert.match(dayChart.chart.feesNote, /估算手续费/);
assert.ok(dayChart.chart.feesNote.includes(usdText(dayFees)));
assert.equal(fxDay.totals.fees, 0);
assert.doesNotMatch(dayChart.chart.feesNote, /\$0\.00/);
const stripped = Object.assign({}, fxDay, { clipped_from: null });
assert.equal(P.clipText(stripped, { scope: "all", from: fxDay.from, tz: "Asia/Shanghai" }), "账户 10-14 开始运行");
const yearChart = P.bucketChart(fxYear, { granularity: "year", scope: "all", from: fxYear.from });
assert.equal(yearChart.slots.length, 1);
assert.equal(yearChart.slots[0].tip.title, "2026");
const yearFees = sumField(fxYear, "fees_uncharged");
assert.ok(Math.abs(yearChart.feesUncharged - yearFees) < 1e-6);
assert.ok(yearChart.feesNote.includes(usdText(yearFees)));
assert.doesNotMatch(yearChart.feesNote, /\$0\.00/);
const netSum = sumField(fxAll, "pnl_net");
assert.ok(Math.abs(netSum - fxCard.metrics.net_pnl_usd) <= 0.01);
assert.equal(fxCard.id, "11111111-1111-4111-8111-111111111111");
assert.equal(fxCard.name, "fixture-paper");
assert.equal(fxCard.inception_at, undefined);
assert.equal(fxCard.equity_curve, undefined);
assert.deepEqual(Object.keys(fxCard).sort(), ["id", "metrics", "name"]);
assert.deepEqual(Object.keys(fxCard.metrics), ["net_pnl_usd"]);
const REAL_ID = "7cd31570-39a5-47ea-aa0d-1b49d90acad4";
for (const fx of [fxDay, fxWeek, fxMonth, fxYear, fxSeg, fxAll, fxCard]) {
  const raw = JSON.stringify(fx);
  assert.equal(raw.includes(REAL_ID), false);
  assert.equal(/0x[0-9a-fA-F]{6,}/.test(raw), false);
}
assert.equal(fxDay.account_id, fxCard.id);

console.log("pnl-buckets tests ok");
