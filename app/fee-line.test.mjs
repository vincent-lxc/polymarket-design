import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const core = fs.readFileSync(new URL("./sa-core.js", import.meta.url), "utf8");
const coreBox = { window: {}, globalThis: null, console, URLSearchParams };
coreBox.globalThis = coreBox;
coreBox.window = coreBox;
vm.runInNewContext(core, coreBox);
const SA = coreBox.PMSA;

function node(leaf) {
  const el = {
    innerHTML: "",
    outerHTML: "",
    textContent: "",
    hidden: false,
    title: "",
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    getAttribute() { return ""; },
    removeAttribute() {},
    remove() {},
    prepend() {},
    appendChild() {},
    dispatchEvent() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  if (!leaf) {
    el._table = node(true);
    el._hd = node(true);
    el.querySelector = (sel) => {
      if (sel === "table") return el._table;
      if (sel === ".hd") return el._hd;
      return null;
    };
    el.querySelectorAll = () => [];
  }
  return el;
}

function loadApi() {
  const store = {};
  function ensure(sel) {
    if (!store[sel]) store[sel] = node(false);
    return store[sel];
  }
  const sandbox = {
    console,
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
    URL,
    URLSearchParams,
    Intl,
    Date,
    history: { replaceState() {} },
    location: {
      search: "",
      pathname: "/overview",
      origin: "https://app.example",
      href: "https://app.example/overview",
      hash: "",
      host: "app.example",
      replace() {}
    },
    localStorage: { getItem() { return "tok"; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    readyState: "loading",
    body: { dataset: { page: "overview" }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
    documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
    addEventListener() {},
    createElement() { return node(true); },
    querySelector: (sel) => ensure(sel),
    querySelectorAll: () => [],
    getElementById: (id) => ensure("#" + id)
  };
  vm.runInNewContext(fs.readFileSync(new URL("./api.js", import.meta.url), "utf8"), sandbox);
  sandbox.store = store;
  return sandbox;
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(new URL("./fixtures/fee-line/" + name, import.meta.url), "utf8"));
}

const pm = loadApi();
const PM = pm.PM;
const overview = readFixture("paper20000-overview.json");
const list = readFixture("paper20000-list.json");
const paperUuid = readFixture("paper20000-uuid-detail.json");
const feesUuid = readFixture("paper20000fees-uuid-detail.json");
const paperLegacy = readFixture("paper20000-legacy-detail.json").account;
const feesLegacy = readFixture("paper20000fees-legacy-detail.json").account;
const paperList = list.items.find((a) => a.name === "paper20000");
const feesList = list.items.find((a) => a.name === "paper20000fees");
const paperRow = overview.accounts.find((a) => a.strategy === "paper20000");
const feesRow = overview.accounts.find((a) => a.strategy === "paper20000fees");

const NET = "净收益 +$5,889.41（已扣估算手续费 $1,997.46）";
const EQ = "$27,886.86";
const PCT = "+29.45%";
const FEES_NET = "−$1,801.11";
const FEES_PCT = "−9.01%";

function assertPaper(copy, place) {
  assert.equal(copy.place, place);
  assert.equal(copy.estimated, true);
  assert.equal(copy.equity_text, EQ);
  assert.equal(copy.pct_text, PCT);
  assert.equal(copy.net_text, NET);
  assert.equal(copy.fee_text, "");
  assert.equal(copy.card_fee_text, "估算");
  assert.equal(copy.net_text.includes("9,999"), false);
  assert.equal(copy.net_text.includes("fees_estimated_usd"), false);
}

function assertFees(copy) {
  assert.equal(copy.estimated, false);
  assert.equal(copy.show_paren, false);
  assert.equal(copy.net_text, "净收益 " + FEES_NET);
  assert.equal(copy.pct_text, FEES_PCT);
  assert.equal(copy.fee_text, "手续费 $1,020.94");
  assert.equal(copy.net_text.includes("估算"), false);
  assert.equal(copy.net_text.includes("已扣估算手续费"), false);
  assert.equal(copy.fee_text.includes("估算"), false);
  assert.equal(copy.card_fee_text.includes("估算"), false);
}

assertPaper(SA.feeCopy(paperList, "metrics"), "metrics");
assert.equal(SA.feeCopy(paperList, "metrics").pct_field, "return_pct");
assert.equal(SA.feeCopy(paperList, "metrics").pct_value, paperList.metrics.return_pct);
assertPaper(SA.feeCopy(paperUuid, "metrics"), "metrics");
assertFees(SA.feeCopy(feesList, "metrics"));
assertFees(SA.feeCopy(feesUuid, "metrics"));
assert.equal(SA.feeCopy(feesList, "metrics").net_text.includes("$0"), false);

assertPaper(SA.feeCopy(paperRow, "overview"), "overview");
assert.equal(SA.feeLine(paperRow, "overview").pct_field, "net_pct");
assert.equal(SA.feeLine(paperRow, "overview").pct_value, paperRow.net_pct);
assert.equal(SA.feeLine(paperRow, "overview").pct_value === (paperRow.equity_usd - paperRow.capital_usd) / paperRow.capital_usd, false);
assertFees(SA.feeCopy(feesRow, "overview"));
assertPaper(SA.feeCopy(paperLegacy, "legacy"), "legacy");
assert.equal(SA.feeLine(paperLegacy, "legacy").pct_field, "net_pct");
assertFees(SA.feeCopy(feesLegacy, "legacy"));

const totals = overview.totals;
assert.equal(totals.fees_estimated, true);
assert.equal(PM.overviewHeadline(totals), "净收益 +$10,150.68（含估算手续费） · +7.25%");
assert.equal(PM.overviewHeadline(totals).includes("已扣估算手续费"), false);
assert.equal(PM.overviewHeadline(totals).includes("1,997.46"), false);
assert.equal(PM.overviewHeadline(totals).includes("6,913.88"), false);
assert.equal(PM.feeLine(totals, "overview").pct_value, totals.net_pct);
assert.equal(PM.feeLine(totals, "overview").net_pnl_usd, totals.net_pnl_usd);

const totalsOff = Object.assign({}, totals, { fees_estimated: false });
assert.equal(PM.overviewHeadline(totalsOff).includes("含估算手续费"), false);
assert.equal(PM.overviewHeadline(totalsOff).includes("估算"), false);
assert.match(PM.overviewHeadline(totalsOff), /扣费净盈亏 \+\$10,150\.68 · \+7\.25%/);

const totalsMissing = Object.assign({}, totals);
delete totalsMissing.fees_estimated;
assert.equal(PM.overviewHeadline(totalsMissing).includes("含估算手续费"), false);
assert.equal(PM.overviewHeadline(totalsMissing).includes("估算"), false);
assert.match(PM.overviewHeadline(totalsMissing), /扣费净盈亏/);

const paperCell = PM.overviewNetCell(paperRow);
assert.match(paperCell.html, /\+\$5,889\.41/);
assert.match(paperCell.html, /已扣估算手续费 \$1,997\.46/);
assert.match(paperCell.html, /估算/);
assert.equal(paperCell.pct, PCT);
assert.equal(paperCell.html.includes("39.4"), false);
const feesCell = PM.overviewNetCell(feesRow);
assert.match(feesCell.html, /−\$1,801\.11/);
assert.equal(feesCell.pct, FEES_PCT);
assert.equal(feesCell.html.includes("估算"), false);
assert.equal(feesCell.html.includes("已扣估算手续费"), false);

const legacy = PM.legacyFeeSpan(paperLegacy);
assert.match(legacy, /净收益 \+\$5,889\.41（已扣估算手续费 \$1,997\.46） · \+29\.45% · 估算/);
const legacyFees = PM.legacyFeeSpan(feesLegacy);
assert.match(legacyFees, /扣费净盈亏 −\$1,801\.11 · −9\.01%/);
assert.equal(legacyFees.includes("估算"), false);
assert.equal(legacyFees.includes("已扣估算手续费"), false);

const quiet = { equity_usd: 10, capital_usd: 8, net_pnl_usd: 2, net_pct: 0.25, fees_usd: 1, fees_uncharged_usd: 9, fees_estimated_usd: 9 };
assert.equal(PM.overviewHeadline(quiet).includes("含估算手续费"), false);
assert.equal(PM.overviewHeadline(quiet).includes("估算"), false);
assert.match(PM.overviewHeadline(quiet), /扣费净盈亏/);
assert.match(PM.overviewHeadline(quiet), /\+\$2\.00/);

const bare = { fees_estimated: true, equity_usd: 27886.86, capital_usd: 20000, net_pct: 0.2944702840000014 };
assert.equal(PM.feeLine(bare, "overview").net_pnl_usd, null);
assert.equal(PM.overviewHeadline(bare).includes("$0"), false);
assert.match(PM.overviewHeadline(bare), /净收益 <span class="na">—<\/span>（含估算手续费）/);
assert.equal(PM.overviewHeadline(bare).includes("已扣估算手续费"), false);
assert.equal(PM.overviewNetCell(bare).html.includes("（"), false);
assert.match(PM.overviewNetCell(bare).html, /估算/);

const trap = {
  metrics: {
    equity_usd: paperList.metrics.equity_usd,
    net_pnl_usd: paperList.metrics.net_pnl_usd,
    return_pct: paperList.metrics.return_pct,
    fees_estimated: true,
    fees_uncharged_usd: paperList.metrics.fees_uncharged_usd,
    fees_estimated_usd: 9999,
    fees_usd: 312
  }
};
const trapped = SA.feeCopy(trap, "metrics");
assert.equal(trapped.net_text, NET);
assert.equal(trapped.net_text.includes("9,999"), false);
assert.equal(trapped.net_text.includes("312"), false);
assert.equal(SA.feeCopy({ metrics: { fees_estimated: "true", fees_uncharged_usd: 1997.46, net_pnl_usd: 1, return_pct: 0.1 } }, "metrics").estimated, false);
assert.equal(SA.feeCopy({ metrics: { fees_estimated: 1, fees_uncharged_usd: 1997.46, net_pnl_usd: 1, return_pct: 0.1 } }, "metrics").estimated, false);

const noUncharged = SA.feeCopy({
  metrics: { equity_usd: 27886.86, net_pnl_usd: 5889.41, return_pct: 0.294470284, fees_estimated: true, fees_estimated_usd: 1997.46 }
}, "metrics");
assert.equal(noUncharged.show_paren, false);
assert.equal(noUncharged.net_text, "净收益 +$5,889.41");
assert.equal(noUncharged.net_text.includes("（"), false);
assert.equal(noUncharged.net_text.includes("$0"), false);
assert.equal(noUncharged.card_fee_text, "估算");

const noNet = SA.feeCopy({
  metrics: { equity_usd: 27886.86, return_pct: 0.294470284, fees_estimated: true, fees_uncharged_usd: 1997.46 }
}, "metrics");
assert.equal(noNet.net_text, "净收益 —（已扣估算手续费 $1,997.46）");
assert.equal(SA.feeCopy({ metrics: { equity_usd: 1, net_pnl_usd: 1, fees_estimated: true, fees_uncharged_usd: 1 } }, "metrics").pct_text, "—");
assert.equal(SA.feeCopy({ fees_estimated: true, net_pnl_usd: 1, return_pct: 0.1 }, "metrics").net_pnl_usd, null);

const view = {
  totals: overview.totals,
  accounts: overview.accounts,
  reasons: overview.reasons || {},
  equity_curve: [],
  attribution: null,
  main_leader: null,
  recent_mirrors: []
};
await PM.renderOverview(view);
const sub = pm.store["#ov-sub"].innerHTML;
const eq = pm.store["#ov-eq"].innerHTML;
assert.match(eq, /\$152,148\.14/);
assert.match(sub, /净收益 \+\$10,150\.68（含估算手续费） · \+7\.25%/);
assert.equal(sub.includes("已扣估算手续费"), false);
assert.equal(sub.includes("8.68"), false);
const table = pm.store["#ov-accts"]._table.innerHTML;
assert.match(table, /已扣估算手续费 \$1,997\.46/);
assert.match(table, /\+29\.45%/);
assert.match(table, /\$27,886\.86/);
assert.match(table, /−\$1,801\.11/);
assert.match(table, /−9\.01%/);

const banned = /待建|校准中|S0|未命名|示意/;
assert.equal(banned.test(NET + PM.overviewHeadline(totals) + legacy + legacyFees), false);

console.log("fee line tests ok");
