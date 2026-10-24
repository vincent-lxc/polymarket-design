import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("./sa-core.js", import.meta.url), "utf8");
const sandbox = { window: {}, globalThis: null, console, URLSearchParams };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox);
const SA = sandbox.PMSA;

const codes = [
  "unauthorized", "account_not_found", "strategy_not_found", "invalid_params", "invalid_capital",
  "invalid_limit", "invalid_cursor", "cursor_mismatch", "confirm_name_mismatch", "compare_count_invalid",
  "duplicate_account_ids", "invalid_axis", "strategy_not_launchable", "wallet_accounts_not_enabled",
  "params_locked", "account_running", "account_archived", "account_name_taken", "insufficient_wallet_balance",
  "wallet_has_positions", "wallet_funds_not_withdrawn", "legacy_read_only", "legacy_account_readonly", "account_limit_reached",
  "rpc_not_configured", "engine_unavailable", "wallet_balance_unavailable"
];
for (const code of codes) {
  const text = SA.errorText(code);
  assert.equal(typeof text, "string");
  assert.ok(text.length > 8, code);
  assert.ok(!/已创建|已暂停|暂停/.test(text), code + " " + text);
}

assert.match(SA.errorText("insufficient_wallet_balance", { available_usd: 100, requested_usd: 400, allocated_usd: 900 }), /可用/);
assert.match(SA.errorText("params_locked"), /先停止/);
assert.match(SA.warningText("paper_over_allocated", { allocated_usd: 80000, limit_usd: 60000 }), /不会拦截/);

const paperOver = { mode: "paper", over_allocated: true, allocated_usd: 80000, paper_limit_usd: 60000, wallet_available_usd: null };
const paperPage = SA.allocationNoticeText(paperOver, [
  { code: "paper_over_allocated", allocated_usd: 80000, limit_usd: 60000 },
  { code: "engine_delay" }
]);
assert.equal(/超额/.test(paperPage), false);
assert.equal(/超过参考额度/.test(paperPage), false);
assert.match(paperPage, /engine_delay/);
assert.equal(SA.warningLines([{ code: "paper_over_allocated", allocated_usd: 90000, limit_usd: 60000 }]).join("|"), "");
assert.equal(SA.warningLines([{ code: "paper_over_allocated" }, { code: "rpc_slow" }]).join("|"), "rpc_slow");
assert.equal(SA.summaryOverWarning(paperOver), "");
assert.equal(SA.summaryOverWarning({ over_allocated: true, allocated_usd: 1 }), "");
assert.match(SA.summaryOverWarning({ mode: "wallet", over_allocated: true, allocated_usd: 50, wallet_available_usd: 10 }), /超额/);
assert.equal(/超过参考额度/.test(SA.summaryOverWarning({ mode: "wallet", over_allocated: true, wallet_available_usd: 10 })), false);
assert.equal(SA.summaryOverWarning({ mode: "wallet", over_allocated: false, wallet_available_usd: 1 }), "");
assert.equal(SA.allocationWarning({ account_type: "paper", requested_usd: 999999, wallet_available_usd: 1 }), "");
assert.equal(SA.allocationWarning({ mode: "paper", requested_usd: 999999 }), "");
assert.equal(SA.allocationWarning({ account_type: "wallet", requested_usd: 80 }), "");
assert.equal(SA.allocationWarning({ account_type: "wallet", requested_usd: 40, wallet_available_usd: 100 }), "");
assert.match(SA.allocationWarning({ account_type: "wallet", requested_usd: 80, wallet_available_usd: 10 }), /超额/);
assert.equal(SA.allocationWarning({ account_type: "wallet", requested_usd: 80, previous_usd: 70, wallet_available_usd: 20 }), "");
assert.match(SA.allocationWarning({ account_type: "wallet", requested_usd: 80, previous_usd: 50, wallet_available_usd: 20 }), /超额/);
const saSrc = fs.readFileSync(new URL("./sa.js", import.meta.url), "utf8");
assert.equal(/60000|50000/.test(saSrc), false);
assert.equal(saSrc.includes("paper_over_allocated"), false);
assert.match(saSrc, /SA\.warningLines\(/);
assert.match(saSrc, /SA\.summaryOverWarning\(/);

assert.equal(SA.isStrategyCatalog({ items: [{ strategy_id: "copy" }], next_cursor: null, total: 1 }), true);
assert.equal(SA.isStrategyCatalog({ strategies: [{ name: "paper" }] }), false);
assert.equal(SA.isAccountListV2({ accounts: [{ strategy: "paper20000" }] }), false);
assert.equal(SA.isAccountListV2({ items: [], next_cursor: null, total: 0, summary: { mode: "paper" } }), true);
assert.equal(SA.isAccountListV2({ accounts: [{ strategy: "zft-062", process_kind: "legacy" }], next_cursor: null, total: 7, summary: { mode: "paper" } }), true);
assert.equal(SA.isAccountListV2({ accounts: [{ id: "a", strategy_id: "copy" }], summary: { mode: "paper" } }), true);
const alias = SA.normalizeAccountPage({ accounts: [{ strategy: "zft-062", process_kind: "legacy" }], next_cursor: null, total: 1, summary: { mode: "paper" } });
assert.equal(alias.items[0].strategy, "zft-062");
assert.equal(alias.accounts.length, 1);
const named = SA.normalizeAccountPage({ items: [{ id: "paper20000" }], summary: { mode: "paper" } });
assert.equal(named.accounts[0].id, "paper20000");
assert.equal(SA.isLegacyAccount({ process_kind: "legacy" }), true);
assert.equal(SA.isLegacyAccount({ process_kind: "acct" }), false);
assert.equal(SA.hasCursorPage({ active: [{ address: "0x1" }] }), false);
assert.equal(SA.hasCursorPage({ active: [], next_cursor: null, total: 0 }), true);

assert.equal(SA.stateLabel("running"), "运行中");
assert.equal(SA.stateLabel("stopped"), "已停止");
assert.equal(SA.stateLabel("paused"), "paused");
assert.ok(!/已创建/.test(SA.stateLabel("created")));

const paperStopped = { state: "stopped", account_type: "paper", wallet_close_status: { can_delete: true, open_positions_count: 0, unwithdrawn_usd: 0 } };
const walletBlocked = { state: "stopped", account_type: "wallet", wallet_close_status: { can_delete: false, open_positions_count: 2, unwithdrawn_usd: 10 } };
const running = { state: "running", account_type: "paper", wallet_close_status: { can_delete: false } };
assert.equal(SA.canDelete(paperStopped), true);
assert.equal(SA.canDelete(walletBlocked), false);
assert.equal(SA.canDelete(running), false);
assert.match(SA.deleteBlockReason(walletBlocked), /清仓/);
assert.equal(SA.settlementNote(walletBlocked), "");
assert.match(SA.settlementNote({ account_type: "wallet", state: "stopped", pending_settlement_count: 2 }), /2 笔/);
assert.equal(SA.settlementNote({ account_type: "paper", state: "stopped", pending_settlement_count: 3 }), "");
assert.equal(SA.settlementNote({ account_type: "wallet", state: "running", pending_settlement_count: 2 }), "");
assert.equal(SA.settlementNote({ account_type: "paper", state: "stopped", pending_settlement_count: null }), "停止期间到期的持仓，下次启动时补记");
assert.equal(SA.settlementNote({ account_type: "wallet", state: "stopped", pending_settlement_count: null }), "停止期间到期的持仓，下次启动时补记");
assert.equal(SA.settlementNote({ account_type: "paper", state: "running", pending_settlement_count: null }), "");
assert.equal(SA.settlementNote({ account_type: "paper", state: "stopped", pending_settlement_count: 0 }), "");
assert.equal(SA.settlementNote({ account_type: "wallet", state: "stopped", pending_settlement_count: 0 }), "");
["paper", "wallet"].forEach((type) => {
  [null, 0, 2].forEach((count) => {
    assert.ok(!/无待结算/.test(SA.settlementNote({ account_type: type, state: "stopped", pending_settlement_count: count })));
  });
});
assert.match(SA.errorText("wallet_accounts_not_enabled"), /钱包账户即将推出/);
const okRpc = SA.rpcCapacityView({ status: "ok", available_rpm: 420, required_rpm: 180, rpc_source: "public" });
assert.equal(okRpc.kind, "ok");
assert.equal(SA.rpcRatio(okRpc), "420/180");
assert.equal(Object.prototype.hasOwnProperty.call(okRpc, "rpc_source"), false);
const lowRpc = SA.rpcCapacityView({ status: "insufficient", available_rpm: 40, required_rpm: 180, observed_429_1h: 17, providers_healthy: 1, providers_total: 3 });
assert.equal(lowRpc.kind, "insufficient");
assert.equal(lowRpc.observed429, 17);
assert.equal(lowRpc.healthy, 1);
assert.equal(SA.rpcCapacityView(null).kind, "missing");
assert.equal(SA.rpcCapacityView({ status: "ok" }).kind, "ok");
assert.equal(SA.rpcRatio(SA.rpcCapacityView({ status: "ok" })), "无数据");
assert.equal(SA.launchBody({ strategy_id: "copy", name: "a", params: {}, capital_usd: 1 }).start, true);

let p = SA.pagerInit(20);
assert.equal(SA.pagerCursor(p), null);
const n1 = SA.pagerNote(p, 46, 20);
assert.equal(n1.text, "第 1–20 条，共 46 条");
assert.equal(n1.show, true);
assert.equal(n1.hasPrev, false);
assert.equal(n1.hasNext, true);
assert.equal(SA.shouldShowPager(20, 20), false);
assert.equal(SA.shouldShowPager(0, 20), false);
assert.equal(SA.shouldShowPager(21, 20), true);
p = SA.pagerRemember(p, "cur-2");
p = SA.pagerNext(p);
assert.equal(SA.pagerCursor(p), "cur-2");
assert.equal(SA.pagerNote(p, 46, 20).text, "第 21–40 条，共 46 条");
p = SA.pagerPrev(p);
assert.equal(p.index, 0);
p = SA.pagerNext(SA.pagerRemember(SA.pagerInit(20), "cur-2"));
const reset = SA.pagerOnHttpError(p, { status: 400, body: { error: "cursor_mismatch" } });
assert.equal(reset.index, 0);
assert.equal(SA.pagerCursor(reset), null);
assert.equal(SA.pagerOnHttpError(p, { status: 409, body: { error: "params_locked" } }), null);
assert.equal(SA.normalizeLimit(200), 20);
assert.equal(SA.normalizeLimit(50), 50);
const more = SA.loadMoreState(20, 46, "c");
assert.equal(more.show, true);
assert.match(more.label, /还有 26 条/);
assert.equal(SA.loadMoreState(46, 46, null).show, false);

const body = SA.launchBody({ strategy_id: "copy", name: "n", params: { copy_ratio: 0.5 }, capital_usd: 1000 });
assert.equal(body.start, true);
assert.equal(body.strategy_id, "copy");
assert.equal(SA.copyBody({ name: "n-copy", params: { copy_ratio: 0.5 }, capital_usd: 1000 }).start, true);
assert.equal(SA.copyBody({ name: "n-copy", params: { copy_ratio: 0.5 }, capital_usd: 1000 }).params_patch.copy_ratio, 0.5);
assert.equal(Object.prototype.hasOwnProperty.call(SA.copyBody({ name: "n", params: {}, capital_usd: 1 }), "params"), false);
assert.equal(Object.prototype.hasOwnProperty.call(body, "params_patch"), false);

let seq = 0;
const rng = () => "k" + (++seq);
const attempt = SA.createSubmitAttempt(rng);
assert.equal(attempt.key(), "k1");
assert.equal(attempt.noteChange(), "k2");
assert.equal(attempt.begin(), "k2");
assert.equal(attempt.begin(), null);
assert.equal(attempt.noteChange(), "k2");
attempt.fail();
assert.equal(attempt.key(), "k3");
const retry = SA.createSubmitAttempt(rng);
const same = retry.key();
assert.equal(retry.begin(), same);
retry.fail();
assert.equal(retry.key(), same);
assert.equal(retry.begin(), same);
const done = SA.createSubmitAttempt(rng);
const before = done.begin();
const after = done.succeed();
assert.notEqual(after, before);
assert.equal(done.begin(), after);

const runningActs = SA.rowActions({ state: "running", process_kind: "acct", account_type: "paper" });
assert.equal(runningActs.primary.join(","), "stop,capital");
assert.equal(runningActs.paramsLocked, true);
assert.ok(runningActs.secondary.includes("copy"));
assert.ok(!runningActs.primary.includes("pause"));
const stoppedActs = SA.rowActions({ state: "stopped", process_kind: "acct", account_type: "paper", params_editable: true, wallet_close_status: { can_delete: true } });
assert.ok(stoppedActs.primary.includes("edit"));
assert.ok(stoppedActs.primary.includes("start"));
assert.equal(stoppedActs.deleteDisabled, false);
assert.equal(SA.paramsEditable({ state: "stopped", process_kind: "acct", archived: false }), true);
assert.equal(SA.paramsEditable({ state: "running", process_kind: "acct", params_editable: false }), false);
const legacy = SA.rowActions({ state: "running", process_kind: "legacy" });
assert.equal(legacy.primary.length, 0);
assert.equal(legacy.secondary.length, 0);
assert.equal(legacy.note, "旧版策略，暂不支持编辑");
assert.equal(SA.errorText("legacy_read_only"), "旧版策略，暂不支持编辑");
assert.equal(SA.errorText("legacy_account_readonly"), "旧版策略，暂不支持编辑");
assert.ok(!/复制/.test(legacy.note));

const schemas = {
  copy: [{ key: "copy_ratio", label_zh: "跟单比例", type: "number", unit: "x" }, { key: "fees_on", label_zh: "手续费开关", type: "bool" }],
  zerofeetrend: [{ key: "entry_threshold", label_zh: "入场阈值", type: "number" }]
};
const model = SA.compareTableModel(schemas, [
  { strategy_id: "copy", strategy_label: "跟单", capital_usd: 100, fees_usd: 3, gross_pnl_usd: 12, net_pnl_usd: 9, return_pct: 0.09, trades: 4, max_drawdown_pct: -0.02, runtime_sec: 86400, current_segment: 2, params: { copy_ratio: 0.3, fees_on: true } },
  { strategy_id: "zerofeetrend", strategy_label: "零费", capital_usd: 50, fees_usd: 0, gross_pnl_usd: 1, net_pnl_usd: 1, return_pct: 0.02, trades: 2, max_drawdown_pct: -0.01, runtime_sec: 3600, current_segment: 1, params: { entry_threshold: 0.62 } }
]);
assert.equal(model.common[0].label, "策略");
assert.equal(model.common.find((r) => r.key === "fees_usd").label, "手续费");
const ratio = model.sections[0].rows.find((r) => r.key === "copy_ratio");
assert.equal(ratio.cells[1], "—");
assert.match(ratio.cells[0], /0\.3x/);
const entry = model.sections[1].rows[0];
assert.equal(entry.cells[0], "—");
assert.equal(entry.cells[1], "0.62");
assert.equal(model.common.find((r) => r.key === "max_drawdown_pct").cells[0], "2.0%");
assert.equal(model.common.find((r) => r.key === "return_pct").cells[0], "+9.0%");

const paper = SA.mockAccounts().find((a) => a.id === "paper20000");
assert.equal(Object.prototype.hasOwnProperty.call(paper, "series"), true);
assert.equal(paper.series, null);
assert.equal(paper.points, undefined);
const mixed = SA.mockCompare(["paper20000", "old-1x"], { axis: "elapsed" });
assert.equal(mixed.table.find((r) => r.account_id === "old-1x").archived, true);
assert.equal(mixed.table.find((r) => r.account_id === "paper20000").archived, false);
assert.equal(mixed.series.find((s) => s.account_id === "old-1x").archived, true);
const tagged = SA.chartModel(mixed.series, { focusId: "old-1x", axis: "elapsed" });
assert.equal(tagged.lines.find((l) => l.account_id === "old-1x").archived, true);
assert.equal(tagged.lines.find((l) => l.account_id === "paper20000").archived, false);

const cmp = SA.mockCompare(["paper20000", "paper20000fees", "zft-062"], { axis: "calendar", metric: "return_pct", scope: "all" });
const chart = SA.chartModel(cmp.series, { focusId: "paper20000", axis: "calendar", metric: "return_pct", width: 600, height: 200 });
assert.equal(chart.lines.filter((l) => l.accent).length, 1);
assert.equal(chart.lines.find((l) => l.accent).color, SA.ACCENT);
assert.ok(chart.lines.filter((l) => !l.accent).every((l) => l.color !== SA.ACCENT));
assert.ok(chart.marks.every((m) => m.account_id === "paper20000"));
assert.ok(chart.gaps.length >= 1);
const hover = SA.chartModel(cmp.series, { focusId: "paper20000", hoverId: "zft-062", axis: "calendar" });
assert.ok(hover.marks.every((m) => m.account_id === "zft-062"));
const elapsed = SA.chartModel(SA.mockCompare(["paper20000", "zft-062"], { axis: "elapsed" }).series, { focusId: "paper20000", axis: "elapsed" });
assert.equal(elapsed.gaps.length, 0);
assert.ok(elapsed.marks.length >= 1);

assert.equal(SA.selectionError(["a"]), "compare_count_invalid");
assert.equal(SA.selectionError(["a", "a"]), "duplicate_account_ids");
assert.equal(SA.selectionError(["a", "b", "c", "d"]), "");
assert.equal(SA.selectionError(["a", "b", "c", "d", "e"]), "compare_count_invalid");

const hero = SA.pickHero(SA.mockStrategies().items);
assert.equal(hero.strategy_id, "copy");
const problems = SA.validateParams(SA.mockStrategies().items[0].params_schema, { copy_ratio: 5, fees_on: false, daily_loss_usd: 10, max_positions: 1 });
assert.ok(problems.some((p) => /跟单比例/.test(p) && /改小/.test(p)));

const page = SA.mockPage(SA.mockAccounts(), { archived: false, strategy_id: "copy", limit: 20 });
assert.equal(page.items.length, 20);
assert.equal(page.accounts.length, page.items.length);
assert.equal(page.total, 47);
assert.ok(page.next_cursor);
const page2 = SA.mockPage(SA.mockAccounts(), { archived: false, strategy_id: "copy", limit: 20, cursor: page.next_cursor });
assert.equal(page2.items[0].id !== page.items[0].id, true);
assert.equal(SA.mockPage(SA.mockAccounts(), { archived: false, strategy_id: "zerofeetrend", limit: 20 }).total, 0);
const legPage = SA.mockPage(SA.mockAccounts(), { archived: false, process_kind: "legacy", limit: 20 });
assert.equal(legPage.total, 1);
assert.equal(legPage.items[0].id, "zft-062");
assert.equal(legPage.items[0].strategy, "zft-062");
assert.equal(legPage.items[0].strategy_id, null);
assert.equal(legPage.items[0].process_kind, "legacy");
assert.equal(legPage.accounts[0].strategy, "zft-062");
assert.ok(legPage.summary && Array.isArray(legPage.items) && Array.isArray(legPage.accounts));
assert.equal(Object.prototype.hasOwnProperty.call(legPage, "next_cursor"), true);
assert.equal(typeof legPage.total, "number");
assert.equal(SA.strategyCaption(legPage.items[0]), "旧版策略");
assert.equal(SA.selectionId({ id: "acct_1", strategy: "old-a", strategy_id: null, process_kind: "legacy" }), "acct_1");
assert.equal(SA.strategyCaption({ strategy_id: null, strategy_label: null, process_kind: "legacy", strategy: "old-a" }), "旧版策略");
const off = SA.accountListQuery({ archived: false, strategy_id: null, limit: 20 });
const on = SA.accountListQuery({ archived: true, strategy_id: "copy", limit: 20 });
const coerced = SA.accountListQuery({ archived: "1", strategy_id: "null", limit: 20 });
const zero = SA.accountListQuery({ archived: 0, strategy_id: null, limit: 50 });
assert.match(off, /(^|&)archived=false(&|$)/);
assert.match(on, /(^|&)archived=true(&|$)/);
assert.match(on, /(^|&)strategy_id=copy(&|$)/);
assert.match(coerced, /(^|&)archived=true(&|$)/);
assert.match(zero, /(^|&)archived=false(&|$)/);
assert.equal(off.includes("strategy_id"), false);
assert.equal(coerced.includes("strategy_id"), false);
assert.equal(zero.includes("strategy_id"), false);
assert.equal(/archived=(1|0)(&|$)/.test(off + "&" + on + "&" + coerced + "&" + zero), false);
const legCmp = SA.mockCompare(["paper20000", "zft-062"], { axis: "elapsed" });
const zrow = legCmp.table.find((r) => r.account_id === "zft-062");
assert.equal(zrow.strategy_id, null);
assert.equal(zrow.strategy, "zft-062");
assert.equal(zrow.process_kind, "legacy");
const legModel = SA.compareTableModel(legCmp.schemas, legCmp.table);
const shown = [];
legModel.common.forEach((r) => shown.push(r.label, ...r.cells));
legModel.sections.forEach((s) => {
  shown.push(s.label);
  assert.notEqual(s.strategy_id, "null");
  s.rows.forEach((r) => shown.push(r.label, ...r.cells));
});
assert.equal(legModel.common.find((r) => r.key === "strategy_label").cells[1], "旧版策略");
assert.ok(legModel.sections.some((s) => s.label === "旧版策略 参数"));
assert.ok(shown.every((t) => t !== "null" && !String(t).includes("null")));

const leadersOld = { active: [{ address: "0xabc" }] };
const leadersNew = { active: [{ address: "0xabc" }], next_cursor: "n", total: 40 };
assert.equal(SA.hasCursorPage(leadersOld), false);
assert.equal(SA.hasCursorPage(leadersNew), true);

assert.match(SA.formatPct(0.135), /\+13\.5%/);
assert.equal(SA.formatPct(0.172), "+17.2%");
assert.equal(SA.formatDrawdown(0.172), "17.2%");
assert.equal(SA.formatDrawdown(-0.042), "4.2%");
assert.equal(SA.formatDrawdown(0), "0.0%");
assert.equal(SA.formatDrawdown(null), "—");
assert.equal(SA.formatDrawdown(0.172).includes("+"), false);
assert.equal(SA.formatMetric("max_drawdown_pct", 0.172), "17.2%");
assert.equal(SA.formatMetric("return_pct", 0.172), "+17.2%");
assert.equal(SA.formatRuntime(9 * 86400), "9 天");

const fresh = SA.mockAccounts().find((a) => a.id === "copy-new");
assert.equal(SA.engineOnboarding(fresh), true);
assert.equal(SA.engineOnboarding(paper), false);
assert.equal(fresh.state, "running");
assert.equal(SA.onboardMessage("zh"), "暂无净值");
assert.equal(SA.onboardMessage("en"), "No equity yet");
assert.equal(SA.onboardStatus("zh"), "等待运行");
assert.equal(SA.onboardStatus("en"), "Waiting to run");
assert.equal(SA.onboardNote("zh"), "净值从引擎接入后开始计算");
assert.equal(SA.onboardNote("en"), "Equity is tracked once the engine is connected");
const restored = JSON.parse(JSON.stringify(fresh));
restored.series = { points: [{ t: 0, equity_usd: 10000, return_pct: 0 }] };
assert.equal(SA.engineOnboarding(restored), false);
assert.equal(SA.engineOnboarding({ state: "running", reasons: { equity_curve: "no_equity_points" } }), true);
assert.equal(SA.engineOnboarding({ state: "running", reasons: { equity_curve: "no_equity_points" }, series: { points: [{ t: 0 }] } }), false);
assert.equal(SA.engineOnboarding({ state: "stopped", reasons: { equity_curve: "no_equity_points" } }), false);
const onboardCmp = SA.mockCompare(["paper20000", "copy-new"], { axis: "elapsed" });
assert.equal(onboardCmp.series.find((s) => s.account_id === "copy-new").points.length, 0);
assert.ok(onboardCmp.series.find((s) => s.account_id === "paper20000").points.length > 0);
const onboardModel = SA.compareTableModel(onboardCmp.schemas, onboardCmp.table);
const retCells = onboardModel.common.find((r) => r.key === "return_pct").cells;
assert.equal(retCells[1], "暂无净值");
assert.equal(String(retCells[1]).includes("%"), false);
assert.equal(SA.compareTableModel(onboardCmp.schemas, onboardCmp.table, "en").common.find((r) => r.key === "return_pct").cells[1], "No equity yet");
["net_pnl_usd", "gross_pnl_usd", "max_drawdown_pct"].forEach((key) => {
  const cell = onboardModel.common.find((r) => r.key === key).cells[1];
  assert.equal(cell, "暂无净值");
  assert.equal(/[0-9]/.test(cell), false);
});
assert.equal(onboardModel.common.find((r) => r.key === "max_drawdown_pct").cells[0], "17.2%");
assert.equal(String(onboardModel.common.find((r) => r.key === "max_drawdown_pct").cells[0]).includes("+"), false);
assert.match(onboardModel.common.find((r) => r.key === "return_pct").cells[0], /\+13\.5%/);
const lines = SA.chartModel(onboardCmp.series, { focusId: "paper20000", axis: "elapsed" }).lines;
assert.equal(lines.find((l) => l.account_id === "copy-new").onboarding, true);
assert.equal(lines.find((l) => l.account_id === "paper20000").onboarding, false);

const writeSchema = [
  { key: "copy_ratio", label_zh: "跟单比例", type: "number", default: 0.3, min: 0.05, max: 1, unit: "x" },
  { key: "fees_on", label_zh: "计算手续费", type: "bool", default: false },
  {
    key: "risk", type: "object", label_zh: "上限",
    fields: [
      { key: "max_per_trade_usd", label_zh: "单笔上限", type: "number", unit: "usd", default: 5 },
      { key: "max_positions", label_zh: "持仓上限", type: "integer", default: 10 }
    ]
  },
  {
    key: "exit", type: "object", label_zh: "出场",
    properties: {
      stop_loss_pct: { type: "number", unit: "pct", label_zh: "止损", default: 0.12 }
    }
  }
];
const typed = SA.readParams(writeSchema, {
  copy_ratio: "0.5",
  fees_on: "true",
  "risk.max_per_trade_usd": "$15",
  "risk.max_positions": "10",
  "exit.stop_loss_pct": { value: "20%", reason: null }
});
assert.equal(typed.copy_ratio, 0.5);
assert.equal(typeof typed.copy_ratio, "number");
assert.equal(typed.fees_on, true);
assert.equal(typeof typed.fees_on, "boolean");
assert.equal(typed.risk.max_per_trade_usd, 15);
assert.equal(typeof typed.risk.max_per_trade_usd, "number");
assert.equal(typed.risk.max_positions, 10);
assert.equal(typed.exit.stop_loss_pct, 0.2);
assert.equal(typeof typed.exit.stop_loss_pct, "number");

const emptied = SA.readParams(writeSchema, {
  copy_ratio: "[object Object]",
  fees_on: "[object Object]",
  risk: { max_per_trade_usd: {}, max_positions: "" },
  exit: { stop_loss_pct: {} }
});
assert.equal(emptied.copy_ratio, 0.3);
assert.equal(typeof emptied.copy_ratio, "number");
assert.equal(emptied.fees_on, false);
assert.equal(emptied.risk.max_per_trade_usd, 5);
assert.equal(typeof emptied.risk.max_per_trade_usd, "number");
assert.equal(emptied.exit.stop_loss_pct, null);
assert.equal(Object.prototype.hasOwnProperty.call(emptied.exit, "stop_loss_pct"), true);
assert.equal(JSON.stringify(emptied).includes('"stop_loss_pct":null'), true);
assert.equal(JSON.stringify(emptied).includes('"null"'), false);
assert.equal(JSON.stringify(emptied).includes("[object Object]"), false);
assert.equal(JSON.stringify(emptied).includes(":{}"), false);

const posted = SA.launchBody({
  strategy_id: "copy",
  name: "casey",
  schema: writeSchema,
  capital_usd: "10000",
  params: {
    copy_ratio: "0.4",
    risk: { max_per_trade_usd: "8", max_positions: { value: "4", reason: null } },
    exit: { stop_loss_pct: { value: 0.1, reason: null } },
    ignored_empty: {}
  }
});
assert.equal(posted.capital_usd, 10000);
assert.equal(typeof posted.capital_usd, "number");
assert.equal(posted.params.copy_ratio, 0.4);
assert.equal(posted.params.risk.max_per_trade_usd, 8);
assert.equal(posted.params.risk.max_positions, 4);
assert.equal(posted.params.exit.stop_loss_pct, 0.1);
assert.equal(Object.prototype.hasOwnProperty.call(posted.params, "ignored_empty"), false);
assert.equal(JSON.stringify(posted).includes("[object Object]"), false);
assert.equal(JSON.stringify(posted).includes(":{}"), false);
const loose = SA.launchBody({
  strategy_id: "copy",
  name: "loose",
  capital_usd: "$2500",
  params: {
    copy_ratio: "0.2",
    stop_loss_pct: { value: "0.15", reason: null },
    risk: { max_per_trade_usd: "$9", max_positions: "[object Object]" },
    empty_limit: {}
  }
});
assert.equal(loose.capital_usd, 2500);
const blankMoney = SA.launchBody({ strategy_id: "copy", name: "blank", params: { stop_loss_pct: {}, copy_ratio: "[object Object]" }, capital_usd: "" });
assert.equal(blankMoney.capital_usd, undefined);
assert.equal(blankMoney.params.stop_loss_pct, null);
assert.equal(Object.prototype.hasOwnProperty.call(blankMoney.params, "stop_loss_pct"), true);
assert.equal(Object.prototype.hasOwnProperty.call(blankMoney.params, "copy_ratio"), false);
assert.equal(JSON.stringify(blankMoney).includes('"stop_loss_pct":null'), true);
assert.equal(JSON.stringify(blankMoney).includes('"null"'), false);
assert.equal(JSON.stringify(blankMoney).includes("[object Object]"), false);
assert.equal(JSON.stringify(blankMoney).includes("capital_usd"), false);
assert.equal(loose.params.copy_ratio, 0.2);
assert.equal(loose.params.stop_loss_pct, 0.15);
assert.equal(typeof loose.params.stop_loss_pct, "number");
assert.equal(loose.params.risk.max_per_trade_usd, 9);
assert.equal(Object.prototype.hasOwnProperty.call(loose.params.risk, "max_positions"), false);
assert.equal(Object.prototype.hasOwnProperty.call(loose.params, "empty_limit"), false);
assert.equal(JSON.stringify(loose).includes("[object Object]"), false);

assert.equal(SA.formatParam({ value: 0.12, reason: null }, { type: "number", unit: "pct", label_zh: "止损" }), "12.0%");
assert.equal(SA.formatParam({ value: 15, reason: null }, { type: "number", unit: "usd" }), "$15");
assert.equal(SA.formatParam({}, { type: "number", unit: "usd" }), "—");
assert.equal(SA.formatParam({ value: null, reason: "missing" }, null), "—");
assert.equal(SA.formatParam("[object Object]", { type: "number" }), "—");
assert.equal(SA.formatParam("0.25 → 0.3", { type: "number", unit: "x" }), "0.25 → 0.3");
const diffLine = SA.diffText({
  stop_loss_pct: { value: 0.12, reason: null },
  max_per_trade_usd: {},
  exit: { stop_loss_pct: { value: 0.05, reason: null } }
}, writeSchema);
assert.equal(diffLine.includes("[object Object]"), false);
assert.match(diffLine, /止损 12\.0%/);
assert.match(diffLine, /单笔上限 —/);
assert.match(diffLine, /止损 5\.0%/);
const bare = SA.diffText({ stop_loss_pct: { value: 0.12 } }, []);
assert.equal(bare, "stop_loss_pct 0.12");
assert.equal(bare.includes("[object Object]"), false);

function assertStopLoss(body, expected) {
  const value = body.params.exit ? body.params.exit.stop_loss_pct : body.params.stop_loss_pct;
  assert.equal(value, expected);
  assert.equal(value === null || typeof value === "number", true);
  const parsed = JSON.parse(JSON.stringify(body));
  const again = parsed.params.exit ? parsed.params.exit.stop_loss_pct : parsed.params.stop_loss_pct;
  assert.equal(again, expected);
  assert.equal(again === null || typeof again === "number", true);
  assert.equal(JSON.stringify(body).includes('"null"'), false);
  assert.equal(JSON.stringify(body).includes('"stop_loss_pct":"'), false);
}

const stringTyped = [
  { key: "copy_ratio", type: "number", default: 0.3 },
  {
    key: "exit",
    type: "object",
    properties: { stop_loss_pct: { type: "string", label_zh: "止损" } }
  }
];
const unionTyped = [
  {
    key: "exit",
    type: "object",
    properties: { stop_loss_pct: { type: ["number", "null"], unit: "pct", label_zh: "止损", default: 0.12, min: 0, max: 1 } }
  }
];
const topTyped = [{ key: "stop_loss_pct", type: "string", label_zh: "止损" }];

assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: stringTyped, params: { exit: { stop_loss_pct: "0.25" } }, capital_usd: 1000 }), 0.25);
assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: stringTyped, params: { exit: { stop_loss_pct: "25%" } }, capital_usd: 1000 }), 0.25);
assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: unionTyped, params: { exit: { stop_loss_pct: { value: 0.25 } } }, capital_usd: 1000 }), 0.25);
assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: unionTyped, params: { "exit.stop_loss_pct": { value: "0.25" } }, capital_usd: 1000 }), 0.25);
assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: stringTyped, params: { exit: { stop_loss_pct: "" } }, capital_usd: 1000 }), null);
assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: stringTyped, params: { exit: { stop_loss_pct: "关闭" } }, capital_usd: 1000 }), null);
assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: stringTyped, params: { exit: { stop_loss_pct: "null" } }, capital_usd: 1000 }), null);
assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: stringTyped, params: { exit: { stop_loss_pct: null } }, capital_usd: 1000 }), null);
assertStopLoss(SA.launchBody({ strategy_id: "copy", name: "sl", schema: unionTyped, params: { exit: { stop_loss_pct: {} } }, capital_usd: 1000 }), null);
assert.equal(Object.prototype.hasOwnProperty.call(SA.readParams(stringTyped, { exit: { stop_loss_pct: "" } }).exit, "stop_loss_pct"), true);

const topOn = SA.launchBody({ strategy_id: "copy", name: "top", schema: topTyped, params: { stop_loss_pct: "0.25" }, capital_usd: 1000 });
assert.equal(topOn.params.stop_loss_pct, 0.25);
assert.equal(typeof topOn.params.stop_loss_pct, "number");
const topOff = SA.launchBody({ strategy_id: "copy", name: "top", schema: topTyped, params: { stop_loss_pct: "关闭" }, capital_usd: 1000 });
assert.equal(topOff.params.stop_loss_pct, null);
assert.equal(JSON.stringify(topOff).includes('"stop_loss_pct":null'), true);
const topPct = SA.readParams(topTyped, { stop_loss_pct: "25%" });
assert.equal(topPct.stop_loss_pct, 0.25);
assert.equal(typeof topPct.stop_loss_pct, "number");
const topWrap = SA.readParams([{ key: "stop_loss_pct", type: ["number", "null"] }], { stop_loss_pct: { value: 0.25 } });
assert.equal(topWrap.stop_loss_pct, 0.25);
assert.equal(typeof topWrap.stop_loss_pct, "number");

const copied = SA.copyBody({ name: "copy", schema: stringTyped, params: { exit: { stop_loss_pct: "0.25" } }, capital_usd: "1000" });
assert.equal(copied.params_patch.exit.stop_loss_pct, 0.25);
assert.equal(typeof copied.params_patch.exit.stop_loss_pct, "number");
const copiedOff = SA.copyBody({ name: "copy", schema: stringTyped, params: { exit: { stop_loss_pct: "" } } });
assert.equal(copiedOff.params_patch.exit.stop_loss_pct, null);

const slSchema = SA.mockStrategies().items[0].params_schema;
assert.equal(SA.validateParams(slSchema, { copy_ratio: 0.3, fees_on: false, daily_loss_usd: 10, max_positions: 1, exit: { stop_loss_pct: "" } }).some((p) => /止损/.test(p)), false);
assert.equal(SA.validateParams(slSchema, { copy_ratio: 0.3, exit: { stop_loss_pct: null } }).some((p) => /止损/.test(p)), false);
assert.ok(SA.validateParams(slSchema, { copy_ratio: 0.3, exit: { stop_loss_pct: 2 } }).some((p) => /止损/.test(p) && /改小/.test(p)));
assert.equal(SA.fieldInput({ key: "stop_loss_pct", type: "number", default: 0.12 }, null), "");
assert.equal(SA.fieldInput({ key: "stop_loss_pct", type: "number", default: 0.12 }, undefined), "0.12");
assert.equal(SA.fieldInput({ key: "stop_loss_pct", type: "string" }, "0.25"), "0.25");

const card = SA.mockAccounts().find((a) => a.id === "paper20000");
const cardLine = SA.diffText(card.params_diff, SA.mockStrategies().items[0].params_schema);
assert.equal(cardLine.includes("[object Object]"), false);
assert.match(cardLine, /止损 12\.0%/);
assert.match(cardLine, /单笔上限 \$15/);

const UUID = "7cd31570-39a5-47ea-aa0d-1b49d90acad4";
const curve = [
  { t: "2026-10-22T00:00:00Z", equity: 20000, cash: 20000, positions_value: 0 },
  { t: "2026-10-22T12:00:00Z", equity: 20050, cash: 15000, positions_value: 5050 },
  { t: "2026-10-23T00:00:00Z", equity: 20100, cash: 8000, positions_value: 12100 }
];
const envelope = {
  account: {
    id: UUID,
    name: "paper-live",
    state: "running",
    capital_usd: 20000,
    metrics: { equity_usd: 20100, net_pnl_usd: 100, return_pct: 0.005 },
    reasons: { equity_usd: "no_equity_points", equity_curve: "no_equity_points" },
    series: { points: [] }
  },
  equity_curve: curve
};
const merged = SA.mergeDetailCurve(Object.assign({}, envelope.account), envelope);
assert.equal(merged.equity_curve.length, 3);
assert.equal(envelope.account.equity_curve, undefined);
assert.equal(SA.engineOnboarding(merged), false);
assert.equal(SA.engineOnboarding({ state: "running", reasons: { equity_curve: "no_equity_points" }, equity_curve: [] }), true);
assert.equal(SA.engineOnboarding({ state: "running", reasons: { equity_curve: "no_equity_points" }, equity_curve: [{ t: "2026-10-23T00:00:00Z", equity: null }] }), true);
const series = SA.accountDetailSeries(merged);
assert.equal(series.source, "equity_curve");
assert.equal(series.metric, "equity_usd");
assert.equal(series.account_id, UUID);
assert.equal(series.points.length, 3);
assert.equal(series.points[0].equity_usd, 20000);
assert.equal(series.points[2].equity_usd, 20100);
assert.equal(series.points[0].return_pct, undefined);
const drawn = SA.chartModel([series], { focusId: UUID, axis: "calendar", metric: series.metric, width: 720, height: 240 });
assert.equal(drawn.lines[0].points.length, 3);
assert.ok(drawn.lines[0].points[2].x > drawn.lines[0].points[0].x);
assert.ok(drawn.lines[0].points.every((p) => Number.isFinite(p.y)));

assert.equal(SA.accountDetailSeries({ id: "x", equity_curve: [], series: { points: [] }, points: [] }), null);
const fallback = SA.accountDetailSeries({
  id: "x",
  equity_curve: [],
  series: { account_id: "x", points: [{ t: "2026-10-22T00:00:00Z", return_pct: 0.1, equity_usd: 110 }, { t: "2026-10-23T00:00:00Z", return_pct: 0.2, equity_usd: 120 }] }
});
assert.equal(fallback.metric, "return_pct");
assert.equal(fallback.source, "series");
assert.equal(fallback.points[0].return_pct, 0.1);
const wins = SA.accountDetailSeries({
  id: "x",
  equity_curve: curve.slice(0, 2),
  series: { points: [{ t: "2026-10-22T00:00:00Z", return_pct: 0.9 }] }
});
assert.equal(wins.source, "equity_curve");
assert.equal(wins.points[0].equity_usd, 20000);
const lifted = SA.accountDetailSeries({
  id: "x",
  name: "n",
  series: { points: [{ t: "2026-10-22T00:00:00Z", equity: 3 }, { t: "2026-10-22T02:00:00Z", equity: 4, cash: 1, positions_value: 3 }] }
});
assert.equal(lifted.metric, "equity_usd");
assert.equal(lifted.points[1].equity_usd, 4);
const one = SA.accountDetailSeries({
  id: "x",
  equity_curve: [{ t: "2026-10-22T00:00:00Z", equity: null }, { t: 1761177600000, equity: 9, cash: 4, positions_value: 5 }]
});
assert.equal(one.points.length, 1);
assert.equal(one.points[0].equity_usd, 9);
const seconds = SA.accountDetailSeries({
  id: "x",
  equity_curve: [{ t: 1761091200, equity: 1 }, { t: 1761094800, equity: 2 }]
});
assert.equal(seconds.points.length, 2);
assert.equal(seconds.points[0].t, "2025-10-22T00:00:00.000Z");
assert.ok(seconds.points[1].t > seconds.points[0].t);
const equityNamed = SA.accountDetailSeries({ id: "x", equity: [{ t: "2026-10-22T00:00:00Z", equity: 8 }, { t: "2026-10-22T01:00:00Z", equity: 9 }] });
assert.equal(equityNamed.source, "equity_curve");
assert.equal(equityNamed.points[0].equity_usd, 8);
const many = [];
for (let i = 0; i < 1408; i++) {
  many.push({ t: new Date(Date.parse("2026-10-22T00:00:00Z") + i * 60000).toISOString(), equity: 100 + i, cash: 1, positions_value: 2 });
}
const sampled = SA.accountDetailSeries({ id: "x", equity_curve: many });
assert.ok(sampled.points.length <= 480);
assert.ok(sampled.points.length > 2);
assert.equal(sampled.points[0].equity_usd, 100);
assert.equal(sampled.points[sampled.points.length - 1].equity_usd, 100 + 1407);
const flat = SA.mergeDetailCurve({ id: UUID, strategy_id: "copy", metrics: { return_pct: 0.01 }, equity_curve: curve }, { id: UUID, strategy_id: "copy", equity_curve: curve });
assert.equal(SA.accountDetailSeries(flat).points.length, 3);

console.log("sa-core tests ok");
