import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function el() {
  const node = {
    innerHTML: "",
    outerHTML: "",
    textContent: "",
    hidden: false,
    title: "",
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() { return ""; },
    removeAttribute() {},
    remove() { this.removed = true; },
    prepend() {},
    appendChild() {},
    insertBefore() {},
    dispatchEvent() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  return node;
}

function load(page, fetchImpl) {
  const store = {};
  function ensure(sel) {
    if (!store[sel]) store[sel] = el();
    return store[sel];
  }
  function nest(sel, kids) {
    const node = ensure(sel);
    node._kids = {};
    for (const kid of kids) node._kids[kid] = ensure(sel + " " + kid);
    node.querySelector = (s) => node._kids[s] || null;
    return node;
  }
  nest("#ov-mirrors", ["table", ".hd", ".hd .r"]);
  nest("#ac-main", [".big", ".sub", ".kv", ".hd"]);
  nest("#ac-pos", ["table", ".hd", ".hd .lbl"]);
  nest("#ac-act", ["table", ".hd"]);
  const sandbox = {
    console,
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
    URL,
    URLSearchParams,
    Intl,
    Date,
    Map,
    Set,
    history: { replaceState() {} },
    location: {
      search: "",
      pathname: "/" + page,
      origin: "https://app.example",
      href: "https://app.example/" + page,
      hash: "",
      host: "app.example",
      replace() {}
    },
    localStorage: { getItem() { return "tok"; }, setItem() {}, removeItem() {} },
    fetch: fetchImpl
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    readyState: "loading",
    body: { dataset: { page }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, appendChild() {} },
    documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
    addEventListener() {},
    createElement() { return el(); },
    querySelector: (sel) => ensure(sel),
    querySelectorAll: () => [],
    getElementById: (id) => ensure("#" + id)
  };
  vm.runInNewContext(fs.readFileSync(new URL("./market.js", import.meta.url), "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(new URL("./api.js", import.meta.url), "utf8"), sandbox);
  sandbox.store = store;
  return sandbox;
}

function json(body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const calls = [];
const UUID = "11111111-1111-4111-8111-111111111111";
const accountDetail = {
  account: {
    equity_usd: 100,
    capital_usd: 80,
    net_pnl_usd: 20,
    net_pct: 0.25,
    cash_usd: 10,
    positions_value_usd: 90,
    exposure_usd: 5,
    daily_realized_usd: 1,
    unrealized_usd: 2,
    realized_usd: 3,
    open_positions: 1,
    max_open_positions: 10,
    strategy_name: "跟单稳健",
    name: "S0 现行规则",
    params: {
      sizing_ratio: { value: 0.3 },
      max_per_trade_usd: { value: 5 },
      max_open_positions: { value: 10 },
      daily_loss_limit_usd: { value: 10 },
      leaders_mode: { value: "S0", zh: "现行规则" }
    }
  },
  positions: [{ slug: "ipswich-town-ou", outcome: "Yes", shares: 2, avg_price: 0.5, last_mark: 0.4, unrealized_usd: -1 }],
  activity: [{ market: null, token_id: "0x12abcdef9999", side: "BUY", fill_usd: 4, decision: "copied", decided_at: "2026-10-24T01:00:00Z" }]
};

const pm = load("overview", async (url) => {
  calls.push(String(url));
  const u = String(url);
  if (u.includes("cursor=more")) {
    return json({
      recent_mirrors: [
        { title: "Second fill", decision: "copied", side: "BUY", fill_usd: 8, leader_notional_usd: 9 },
        { title: "Second skip", decision: "skipped", side: "BUY" }
      ]
    });
  }
  if (u.includes("/v1/accounts/" + UUID)) return json(accountDetail);
  if (u.includes("/v1/accounts")) return json({ accounts: [{ id: UUID, strategy: "catsports20000", name: "S0 现行规则" }] });
  return json({}, 404);
});
const PM = pm.PM;

assert.equal(PM.strategyFacingName({ strategy_name: "跟单" }), "跟单");
assert.equal(PM.strategyFacingName({ name: "S0 现行规则" }), "当前策略");
assert.equal(PM.strategyFacingName({ leaders_mode: { value: "S0" } }), "当前策略");
assert.equal(PM.strategyFacingName({ leaders_mode: { zh: "现行规则" } }), "现行规则");
assert.equal(PM.strategyFacingName({ leaders_mode: { value: "category_score", zh: "S0 现行规则" } }), "现行规则");
assert.equal(PM.strategyFacingName({ params: { leaders_mode: { value: "category_score", zh: "S0 现行规则" } } }), "现行规则");
assert.equal(PM.strategyFacingName({ leaders_mode: { value: "category_score" } }), "当前策略");
assert.equal(/category_score|S\d/.test(PM.strategyFacingName({ leaders_mode: { value: "category_score", zh: "S0 现行规则" } })), false);
assert.equal(/S\d/.test(PM.strategyFacingName({ name: "S0 现行规则", leaders_mode: { value: "S1" } })), false);

assert.equal(PM.mirrorSignalKind({ decision: "copied", side: "BUY" }), "follow");
assert.equal(PM.mirrorSignalKind({ decision: "followed", side: "SELL" }), "follow");
assert.equal(PM.mirrorSignalKind({ status: "filled", side: "SELL" }), "");
assert.equal(PM.mirrorSignalKind({ status: "confirmed", decision: "copied" }), "follow");
assert.equal(PM.mirrorSignalKind({ status: "pending", decision: "rejected", reason: "slippage", reason_zh: "价格偏移过大" }), "reject");
assert.equal(PM.mirrorSignalKind({ decision: "failed" }), "fail");
assert.equal(PM.mirrorSignalKind({ decision: "rejected", reason: "max_positions", reason_zh: "持仓已满" }), "reject");
assert.equal(PM.mirrorSignalKind({ decision: "skipped", reason_zh: "价格偏移过大" }), "skip");
assert.equal(PM.mirrorSignalKind({ status: "skipped", decision: "rejected" }), "reject");
assert.equal(PM.mirrorSignalKind({ outcome: "Yes", decision: "copied" }), "follow");
assert.equal(PM.mirrorSignalKind({ outcome: "skipped" }), "");
assert.equal(PM.mirrorSignalKind({ reason_zh: "跳过 · 盘口太薄" }), "skip");
assert.equal(PM.mirrorSignalKind({ reason_zh: "风控拒绝", reason: "slippage" }), "reject");
assert.equal(PM.mirrorSignalKind({ reason_zh: "失败", reason: "slippage" }), "fail");
assert.equal(PM.mirrorSignalKind({ decision: "pending" }), "");
assert.equal(PM.mirrorSignalKind({ decision: "resting" }), "");
assert.equal(PM.mirrorSignalKind({ status: "reorged" }), "");
assert.notEqual(PM.mirrorSignalKind({ decision: "confirmed" }), "skip");
assert.equal(PM.visibleMirrors([
  { title: "Keep", decision: "copied" },
  { title: "Drop", decision: "skipped" }
]).map((m) => m.title).join(","), "Keep");

const mirrors = [
  { title: "Fed decision", market: null, side: "BUY", decision: "copied", fill_usd: 10, leader_notional_usd: 20 },
  { market: null, slug: "ipswich-town-ou", side: "BUY", decision: "copied", fill_usd: 2, leader_notional_usd: 3 },
  { market: null, token_id: "0x12abcdef9999", side: "SELL", decision: "failed", status: "pending", reason_zh: "下单失败" },
  { title: "Risk cap", side: "BUY", decision: "rejected", status: "confirmed", reason: "slippage", reason_zh: "持仓已满" },
  { title: "Yes book", outcome: "Yes", side: "BUY", decision: "copied", fill_usd: 1, leader_notional_usd: 1 },
  { title: "Sold book", side: "SELL", decision: "followed", status: "reorged", fill_usd: 4, leader_notional_usd: 5 },
  { title: "Skip me", side: "BUY", decision: "skipped", status: "confirmed", reason_zh: "跳过 · 盘口太薄" }
];
await PM.renderOverview({
  totals: { cash_usd: 1, positions_value_usd: 1, unrealized_usd: 1, realized_usd: 1, today_pnl_usd: 1, fills: 2, open_positions: 1 },
  reasons: {},
  accounts: [],
  equity_curve: [],
  recent_mirrors: mirrors,
  attribution: null,
  main_leader: null
});
const mirrorHtml = pm.store["#ov-mirrors table"].innerHTML;
assert.match(mirrorHtml, /Fed decision/);
assert.match(mirrorHtml, /ipswich town ou/);
assert.match(mirrorHtml, /0x12ab…9999/);
assert.match(mirrorHtml, /Risk cap/);
assert.match(mirrorHtml, /Yes book/);
assert.match(mirrorHtml, /已跟/);
assert.match(mirrorHtml, /跟卖/);
assert.match(mirrorHtml, /失败·下单失败/);
assert.match(mirrorHtml, /被拒·持仓已满/);
assert.match(mirrorHtml, /未下单/);
assert.equal(mirrorHtml.includes("无数据"), false);
assert.equal(mirrorHtml.includes("Skip me"), false);
assert.equal(mirrorHtml.includes("未命名"), false);
assert.equal(mirrorHtml.includes("盘口太薄"), false);
assert.equal(mirrorHtml.includes("暂无数据"), false);
assert.equal(pm.store["#ov-attr"], undefined);
assert.equal(mirrorHtml.includes("利润归属"), false);

await PM.renderOverview({
  totals: { cash_usd: 1, positions_value_usd: 1, unrealized_usd: null, realized_usd: null, today_pnl_usd: null, fills: null, open_positions: null },
  reasons: { unrealized_usd: "not_yet_aggregated" },
  accounts: [],
  equity_curve: [],
  recent_mirrors: [{ title: "Only skip", decision: "skipped" }],
  attribution: [],
  main_leader: null
});
assert.equal(pm.store["#ov-mirrors"].hidden, true);
assert.equal(pm.store["#ov-mirrors"].innerHTML.includes("暂无数据"), false);
assert.equal(pm.store["#ov-mirrors"].innerHTML.includes("Only skip"), false);
assert.equal(pm.store["#ov-attr"], undefined);

const skipped = Array.from({ length: 7 }, (_, i) => ({ title: "Skip " + i, decision: "skipped", side: "BUY" }));
await PM.renderOverview({
  totals: { cash_usd: 1, positions_value_usd: 1, unrealized_usd: 1, realized_usd: 1, today_pnl_usd: 1, fills: 1, open_positions: 1 },
  reasons: {},
  accounts: [],
  equity_curve: [],
  recent_mirrors: { items: [{ title: "Only one", decision: "copied", side: "BUY", fill_usd: 1, leader_notional_usd: 2 }].concat(skipped), next_cursor: "more" },
  attribution: [{ name: "跟单稳健", realized_usd: 12, pnl_usd: 1 }],
  main_leader: null
});
const paged = pm.store["#ov-mirrors table"].innerHTML;
assert.match(paged, /Only one/);
assert.match(paged, /Second fill/);
assert.equal(paged.includes("Second skip"), false);
assert.equal(paged.includes("Skip 0"), false);
assert.ok(calls.some((u) => u.includes("cursor=more")));
assert.equal(calls.some((u) => /[?&]status=/.test(u) || /[?&]decision=/.test(u)), false);
assert.equal(pm.store["#ov-attr"], undefined);
assert.equal(paged.includes("利润归属"), false);
assert.equal(paged.includes("跟单稳健"), false);

await PM.renderOverview({
  totals: { cash_usd: 1, positions_value_usd: 1, unrealized_usd: 1, realized_usd: 1, today_pnl_usd: 1, fills: 1, open_positions: 1 },
  reasons: {},
  accounts: [],
  equity_curve: [],
  recent_mirrors: [{ title: "Keep", decision: "copied", side: "BUY", fill_usd: 1, leader_notional_usd: 2 }],
  attribution: [
    { name: "跟单稳健", realized_usd: 30 },
    { address: "0x" + "ab".repeat(20) + "-1710000000000", realized_usd: 12 }
  ],
  main_leader: null
});
assert.equal(pm.store["#ov-attr"], undefined);
const apiSrc = fs.readFileSync(new URL("./api.js", import.meta.url), "utf8");
const cssSrc = fs.readFileSync(new URL("./app.css", import.meta.url), "utf8");
assert.equal(apiSrc.includes("fillAttr"), false);
assert.equal(apiSrc.includes("ov-attr"), false);
assert.equal(apiSrc.includes("利润归属"), false);
assert.equal(cssSrc.includes(".attr-row"), false);
assert.equal(cssSrc.includes(".attr-list"), false);

await PM.renderAccount();
const accountBits = [
  pm.store["#ac-strategy"].textContent,
  pm.store["#ac-rule"].textContent,
  pm.store[".top h1"].textContent,
  pm.store["#ac-pos table"].innerHTML,
  pm.store["#ac-act table"].innerHTML
].join("\n");
assert.match(accountBits, /跟单稳健/);
assert.match(accountBits, /Ipswich Town Ou/);
assert.match(accountBits, /0x12ab…9999/);
assert.equal(accountBits.includes("未命名"), false);
assert.equal(accountBits.includes("S0"), false);
assert.equal(accountBits.includes("接入 attribution"), false);
assert.equal(accountBits.includes("暂无数据"), false);

for (const file of ["overview.html", "account.html"]) {
  const html = fs.readFileSync(new URL("./" + file, import.meta.url), "utf8");
  assert.equal(html.includes("未命名"), false, file);
  assert.equal(html.includes("S0"), false, file);
  assert.equal(html.includes("接入 attribution"), false, file);
  assert.equal(html.includes("暂无数据"), false, file);
  assert.equal(html.includes("示意分配"), false, file);
}
const overviewHtml = fs.readFileSync(new URL("./overview.html", import.meta.url), "utf8");
assert.equal(overviewHtml.includes("Skip"), false);
assert.equal(overviewHtml.includes("利润归属"), false);
assert.equal(overviewHtml.includes('id="ov-attr"'), false);
assert.equal(fs.readFileSync(new URL("./strategies.html", import.meta.url), "utf8").includes("S0"), false);

console.log("copy-facing.test.mjs ok");
