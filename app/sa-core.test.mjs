import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("./sa-core.js", import.meta.url), "utf8");
const sandbox = { window: {}, globalThis: null, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox);
const SA = sandbox.PMSA;

const codes = [
  "unauthorized", "account_not_found", "strategy_not_found", "invalid_params", "invalid_capital",
  "invalid_limit", "invalid_cursor", "cursor_mismatch", "confirm_name_mismatch", "compare_count_invalid",
  "duplicate_account_ids", "invalid_axis", "strategy_not_launchable", "wallet_accounts_not_enabled",
  "params_locked", "account_running", "account_archived", "account_name_taken", "insufficient_wallet_balance",
  "wallet_has_positions", "wallet_funds_not_withdrawn", "legacy_account_readonly", "account_limit_reached",
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

assert.equal(SA.isStrategyCatalog({ items: [{ strategy_id: "copy" }], next_cursor: null, total: 1 }), true);
assert.equal(SA.isStrategyCatalog({ strategies: [{ name: "paper" }] }), false);
assert.equal(SA.isAccountListV2({ accounts: [{ strategy: "paper20000" }] }), false);
assert.equal(SA.isAccountListV2({ items: [], next_cursor: null, total: 0, summary: { mode: "paper" } }), true);
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
assert.match(legacy.note, /存量账户/);

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
assert.equal(page.total, 46);
assert.ok(page.next_cursor);
const page2 = SA.mockPage(SA.mockAccounts(), { archived: false, strategy_id: "copy", limit: 20, cursor: page.next_cursor });
assert.equal(page2.items[0].id !== page.items[0].id, true);
assert.equal(SA.mockPage(SA.mockAccounts(), { archived: false, strategy_id: "zerofeetrend", limit: 20 }).total, 1);

const leadersOld = { active: [{ address: "0xabc" }] };
const leadersNew = { active: [{ address: "0xabc" }], next_cursor: "n", total: 40 };
assert.equal(SA.hasCursorPage(leadersOld), false);
assert.equal(SA.hasCursorPage(leadersNew), true);

assert.match(SA.formatPct(0.135), /\+13\.5%/);
assert.equal(SA.formatRuntime(9 * 86400), "9 天");

console.log("sa-core tests ok");
