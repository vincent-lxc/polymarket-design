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
  return JSON.parse(fs.readFileSync(new URL("../test/fixtures/fee-line/" + name, import.meta.url), "utf8"));
}

const pm = loadApi();
const PM = pm.PM;
const overview = readFixture("demo-overview.json");
const list = readFixture("demo-list.json");
const paperUuid = readFixture("demo-alpha-uuid.json");
const feesUuid = readFixture("demo-beta-uuid.json");
const paperLegacy = readFixture("demo-alpha-legacy.json").account;
const feesLegacy = readFixture("demo-beta-legacy.json").account;
const paperList = list.items.find((a) => a.name === paperLegacy.strategy);
const feesList = list.items.find((a) => a.name === feesLegacy.strategy);
const paperRow = overview.accounts.find((a) => a.strategy === paperList.name);
const feesRow = overview.accounts.find((a) => a.strategy === feesList.name);

function money(n, sign) { return SA.formatUsd(n, !!sign); }
function rateOf(n) {
  if (n == null || n === "" || !isFinite(Number(n))) return "—";
  const v = Number(n) * 100;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return sign + Math.abs(v).toFixed(2) + "%";
}
function bagOf(source, place) { return place === "metrics" ? source.metrics : source; }
function pctKey(place) { return place === "metrics" ? "return_pct" : "net_pct"; }
function paperNet(bag) {
  return "净收益 " + money(bag.net_pnl_usd, true) + "（已扣估算手续费 " + money(bag.fees_uncharged_usd, false) + "）";
}
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function assertPaper(copy, source, place) {
  const bag = bagOf(source, place);
  assert.equal(copy.place, place);
  assert.equal(copy.estimated, true);
  assert.equal(copy.equity_text, money(bag.equity_usd, false));
  assert.equal(copy.pct_text, rateOf(bag[pctKey(place)]));
  assert.equal(copy.net_text, paperNet(bag));
  assert.equal(copy.fee_text, "");
  assert.equal(copy.card_fee_text, "估算");
  assert.equal(copy.net_text.includes(money(9999, false)), false);
  assert.equal(copy.net_text.includes("fees_estimated_usd"), false);
}

function assertFees(copy, source, place) {
  const bag = bagOf(source, place);
  assert.equal(copy.estimated, false);
  assert.equal(copy.show_paren, false);
  assert.equal(copy.net_text, "净收益 " + money(bag.net_pnl_usd, true));
  assert.equal(copy.pct_text, rateOf(bag[pctKey(place)]));
  assert.equal(copy.fee_text, "手续费 " + money(bag.fees_usd, false));
  assert.equal(copy.net_text.includes("估算"), false);
  assert.equal(copy.net_text.includes("已扣估算手续费"), false);
  assert.equal(copy.fee_text.includes("估算"), false);
  assert.equal(copy.card_fee_text.includes("估算"), false);
}

assertPaper(SA.feeCopy(paperList, "metrics"), paperList, "metrics");
assert.equal(SA.feeCopy(paperList, "metrics").pct_field, "return_pct");
assert.equal(SA.feeCopy(paperList, "metrics").pct_value, paperList.metrics.return_pct);
assertPaper(SA.feeCopy(paperUuid, "metrics"), paperUuid, "metrics");
assertFees(SA.feeCopy(feesList, "metrics"), feesList, "metrics");
assertFees(SA.feeCopy(feesUuid, "metrics"), feesUuid, "metrics");
assert.equal(SA.feeCopy(feesList, "metrics").net_text.includes("$0"), false);

assertPaper(SA.feeCopy(paperRow, "overview"), paperRow, "overview");
assert.equal(SA.feeLine(paperRow, "overview").pct_field, "net_pct");
assert.equal(SA.feeLine(paperRow, "overview").pct_value, paperRow.net_pct);
assert.equal(SA.feeLine(paperRow, "overview").pct_value === (paperRow.equity_usd - paperRow.capital_usd) / paperRow.capital_usd, false);
assertFees(SA.feeCopy(feesRow, "overview"), feesRow, "overview");
assertPaper(SA.feeCopy(paperLegacy, "legacy"), paperLegacy, "legacy");
assert.equal(SA.feeLine(paperLegacy, "legacy").pct_field, "net_pct");
assertFees(SA.feeCopy(feesLegacy, "legacy"), feesLegacy, "legacy");

const totals = overview.totals;
const headMoney = money(totals.net_pnl_usd, true);
const headRate = rateOf(totals.net_pct);
assert.equal(totals.fees_estimated, true);
assert.equal(PM.overviewHeadline(totals), `净收益 ${headMoney}（含估算手续费） · ${headRate}`);
assert.equal(PM.overviewHeadline(totals).includes("已扣估算手续费"), false);
assert.equal(PM.overviewHeadline(totals).includes(money(totals.fees_uncharged_usd, false)), false);
assert.equal(PM.overviewHeadline(totals).includes(money(totals.fees_usd, false)), false);
assert.equal(PM.feeLine(totals, "overview").pct_value, totals.net_pct);
assert.equal(PM.feeLine(totals, "overview").net_pnl_usd, totals.net_pnl_usd);

const totalsOff = Object.assign({}, totals, { fees_estimated: false });
assert.equal(PM.overviewHeadline(totalsOff).includes("含估算手续费"), false);
assert.equal(PM.overviewHeadline(totalsOff).includes("估算"), false);
assert.equal(PM.overviewHeadline(totalsOff), `扣费净盈亏 ${headMoney} · ${headRate}`);

const totalsMissing = Object.assign({}, totals);
delete totalsMissing.fees_estimated;
assert.equal(PM.overviewHeadline(totalsMissing).includes("含估算手续费"), false);
assert.equal(PM.overviewHeadline(totalsMissing).includes("估算"), false);
assert.match(PM.overviewHeadline(totalsMissing), /扣费净盈亏/);

const paperCell = PM.overviewNetCell(paperRow);
assert.match(paperCell.html, new RegExp(escRe(money(paperRow.net_pnl_usd, true))));
assert.match(paperCell.html, new RegExp(escRe("已扣估算手续费 " + money(paperRow.fees_uncharged_usd, false))));
assert.match(paperCell.html, /fee-tag/);
assert.match(paperCell.html, /估算/);
assert.equal(paperCell.pct, rateOf(paperRow.net_pct));
const rowTrap = SA.formatPct((paperRow.equity_usd - paperRow.capital_usd) / paperRow.capital_usd);
if (rowTrap !== paperCell.pct) assert.equal(paperCell.html.includes(rowTrap), false);
const feesCell = PM.overviewNetCell(feesRow);
assert.match(feesCell.html, new RegExp(escRe(money(feesRow.net_pnl_usd, true))));
assert.equal(feesCell.pct, rateOf(feesRow.net_pct));
assert.equal(feesCell.html.includes("估算"), false);
assert.equal(feesCell.html.includes("已扣估算手续费"), false);

const legacy = PM.legacyFeeSpan(paperLegacy);
assert.match(legacy, new RegExp(escRe("净收益 " + money(paperLegacy.net_pnl_usd, true) + " · " + rateOf(paperLegacy.net_pct))));
assert.match(legacy, /fee-tag/);
assert.match(legacy, new RegExp(escRe("已扣估算手续费 " + money(paperLegacy.fees_uncharged_usd, false))));
assert.match(legacy, /估算/);
const legacyFees = PM.legacyFeeSpan(feesLegacy);
assert.match(legacyFees, new RegExp(escRe("净收益 " + money(feesLegacy.net_pnl_usd, true) + " · " + rateOf(feesLegacy.net_pct))));
assert.equal(legacyFees.includes("扣费净盈亏"), false);
assert.equal(legacyFees.includes("估算"), false);
assert.equal(legacyFees.includes("已扣估算手续费"), false);

const quiet = { equity_usd: 10, capital_usd: 8, net_pnl_usd: 2, net_pct: 0.25, fees_usd: 1, fees_uncharged_usd: 9, fees_estimated_usd: 9 };
assert.equal(PM.overviewHeadline(quiet).includes("含估算手续费"), false);
assert.equal(PM.overviewHeadline(quiet).includes("估算"), false);
assert.match(PM.overviewHeadline(quiet), /扣费净盈亏/);
assert.match(PM.overviewHeadline(quiet), /\+\$2\.00/);

const bare = { fees_estimated: true, equity_usd: paperRow.equity_usd, capital_usd: paperRow.capital_usd, net_pct: paperRow.net_pct };
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
assert.equal(trapped.net_text, paperNet(paperList.metrics));
assert.equal(trapped.net_text.includes(money(9999, false)), false);
assert.equal(trapped.net_text.includes(money(312, false)), false);
assert.equal(SA.feeCopy({ metrics: { fees_estimated: "true", fees_uncharged_usd: paperList.metrics.fees_uncharged_usd, net_pnl_usd: 1, return_pct: 0.1 } }, "metrics").estimated, false);
assert.equal(SA.feeCopy({ metrics: { fees_estimated: 1, fees_uncharged_usd: paperList.metrics.fees_uncharged_usd, net_pnl_usd: 1, return_pct: 0.1 } }, "metrics").estimated, false);

const noUncharged = SA.feeCopy({
  metrics: {
    equity_usd: paperList.metrics.equity_usd,
    net_pnl_usd: paperList.metrics.net_pnl_usd,
    return_pct: paperList.metrics.return_pct,
    fees_estimated: true,
    fees_estimated_usd: paperList.metrics.fees_uncharged_usd
  }
}, "metrics");
assert.equal(noUncharged.show_paren, false);
assert.equal(noUncharged.net_text, "净收益 " + money(paperList.metrics.net_pnl_usd, true));
assert.equal(noUncharged.net_text.includes("（"), false);
assert.equal(noUncharged.net_text.includes("$0"), false);
assert.equal(noUncharged.card_fee_text, "估算");

const noNet = SA.feeCopy({
  metrics: {
    equity_usd: paperList.metrics.equity_usd,
    return_pct: paperList.metrics.return_pct,
    fees_estimated: true,
    fees_uncharged_usd: paperList.metrics.fees_uncharged_usd
  }
}, "metrics");
assert.equal(noNet.net_text, "净收益 —（已扣估算手续费 " + money(paperList.metrics.fees_uncharged_usd, false) + "）");
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
const eqSum = overview.accounts.reduce((s, a) => s + (a.equity_usd || 0), 0);
const capSum = overview.accounts.reduce((s, a) => s + (a.capital_usd || 0), 0);
assert.match(eq, new RegExp(escRe(money(eqSum, false))));
assert.match(sub, new RegExp(escRe(`净收益 ${headMoney} · ${headRate}`)));
assert.match(sub, /fee-tag">（含估算手续费）/);
assert.equal(sub.includes("已扣估算手续费"), false);
const totalTrap = rateOf((eqSum - capSum) / capSum);
if (totalTrap !== headRate) assert.equal(sub.includes(totalTrap), false);
const table = pm.store["#ov-accts"]._table.innerHTML;
assert.match(table, new RegExp(escRe("已扣估算手续费 " + money(paperRow.fees_uncharged_usd, false))));
assert.match(table, new RegExp(escRe(rateOf(paperRow.net_pct))));
assert.match(table, new RegExp(escRe(money(paperRow.equity_usd, false))));
assert.match(table, new RegExp(escRe(money(feesRow.net_pnl_usd, true))));
assert.match(table, new RegExp(escRe(rateOf(feesRow.net_pct))));

const banned = /待建|校准中|S0|未命名|示意/;
assert.equal(banned.test(paperNet(paperList.metrics) + PM.overviewHeadline(totals) + legacy + legacyFees), false);

const fixtureDir = new URL("../test/fixtures/fee-line/", import.meta.url);
const fixtureNames = fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json"));
assert.deepEqual(fixtureNames.sort(), [
  "demo-alpha-legacy.json",
  "demo-alpha-uuid.json",
  "demo-beta-legacy.json",
  "demo-beta-uuid.json",
  "demo-list.json",
  "demo-overview.json"
]);
for (const name of fixtureNames) {
  const text = fs.readFileSync(new URL(name, fixtureDir), "utf8");
  assert.ok(text.length < 25000, name);
  const addrs = text.match(/0x[0-9a-fA-F]+/g) || [];
  assert.ok(addrs.length > 0, name);
  for (const addr of addrs) assert.equal(addr, "0x0000000000000000000000000000000000000001");
  assert.equal(/paper20000|7cd31570|d9e9f8b4|2026-10-24|Umraniye|76ers/.test(text), false, name);
}
assert.equal(fs.existsSync(new URL("./fixtures/fee-line", import.meta.url)), false);
const ignore = fs.readFileSync(new URL("./.assetsignore", import.meta.url), "utf8");
for (const line of ["fixtures/", "*.test.mjs", "*.test.js", "*.md"]) assert.equal(ignore.includes(line), true, line);
const apiSrc = fs.readFileSync(new URL("./api.js", import.meta.url), "utf8");
const saSrc = fs.readFileSync(new URL("./sa.js", import.meta.url), "utf8");
assert.equal(apiSrc.includes("利润归属"), false);
assert.equal(saSrc.includes("return_pct * 0.35"), false);
assert.equal(saSrc.includes("sa-chart hero"), false);
assert.equal(saSrc.includes("function detailFeeBlock"), true);
assert.equal(saSrc.includes("function legacyChartHtml"), true);
assert.equal(saSrc.includes("function segListHtml"), true);

console.log("fee line tests ok");
