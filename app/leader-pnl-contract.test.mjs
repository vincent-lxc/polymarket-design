import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadApi() {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Intl,
    Date,
    history: { replaceState() {} },
    location: {
      search: "",
      pathname: "/leader",
      origin: "https://app.example",
      href: "https://app.example/leader",
      hash: "",
      host: "app.example",
      replace() {}
    },
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    readyState: "loading",
    body: { dataset: { page: "leader" }, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
    documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {} } },
    addEventListener() {},
    createElement() { return { className: "", style: {}, innerHTML: "", appendChild() {}, setAttribute() {} }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; }
  };
  vm.runInNewContext(fs.readFileSync(new URL("./api.js", import.meta.url), "utf8"), sandbox);
  return sandbox.PM;
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(new URL("../test/fixtures/" + name, import.meta.url), "utf8"));
}

const appNames = fs.readdirSync(new URL(".", import.meta.url));
assert.equal(appNames.some((name) => name.endsWith(".json")), false);

const PM = loadApi();
const present = readFixture("leader-pnl-present.json");
const absent = readFixture("leader-pnl-absent.json");
const blanks = readFixture("leader-pnl-null.json");

assert.equal(present.address, "0x1111111111111111111111111111111111111111");
assert.equal(absent.address, "0x2222222222222222222222222222222222222222");
assert.equal(blanks.address, "0x3333333333333333333333333333333333333333");

assert.equal(PM.copyRateText(0.25), "25%");
assert.equal(PM.copyRateText({ copied: 3, followed: 1, signals: 8, rate: 0.5 }), "50%");
assert.equal(PM.copyRateText({ copied: 3, followed: 5, signals: 8 }), null);
assert.equal(String(PM.copyRateText({ copied: 3, signals: 8 }) || "").includes("/"), false);

const presentBag = PM.leaderPnlBag(present);
assert.equal(presentBag.copy_rate, 0.25);
assert.equal(presentBag.copy_rate_detail.rate, 0.5);
assert.equal(presentBag.n, 20);
const presentRate = PM.copyRateView(present);
assert.equal(presentRate.text, "50%");
assert.equal(presentRate.hover, "跟了 4 / 信号 8");
const presentClosed = PM.recentClosedView(presentBag.recent, presentBag.recentReason);
assert.equal(presentClosed.n, 20);
assert.equal(presentClosed.count, 4);
assert.equal(presentClosed.text, "3 胜 1 负 · 合计 +$12.50 · 10-21~10-23");
assert.equal(PM.recentWindowTitle(presentClosed.n), "他近 20 笔输赢");
assert.notEqual(PM.recentWindowTitle(presentBag.n), "他近 4 笔输赢");
assert.equal(/\bN\b/.test(PM.recentWindowTitle(presentClosed.n)), false);
const mixed = { recent_n: 50, pnl: { recent_n: 20, recent_closed: { n: 7, count: 3, wins: 2, losses: 1, pnl_usd: 1 } } };
assert.equal(PM.leaderPnlBag(mixed).n, 7);
assert.equal(PM.recentWindowTitle(PM.leaderPnlBag(mixed).n), "他近 7 笔输赢");
const countOnly = { recent_n: 20, pnl: { recent_closed: { count: 4, wins: 1, losses: 0, pnl_usd: 1 } } };
assert.equal(PM.leaderPnlBag(countOnly).n, null);
assert.equal(PM.recentClosedView(countOnly.pnl.recent_closed).n, null);
const presentBody = PM.leaderPnlBody(present);
assert.match(presentBody, /\+\$4\.50/);
assert.match(presentBody, /title="缺最新价"/);
assert.doesNotMatch(presentBody, /\$80|\$9\.90/);
assert.equal(PM.leaderProfitShare(present).text, "57.9%");
assert.equal(PM.leaderProfitShare(present).show, true);
const offHover = "占所有赚钱 leader 盈利之和，未扣估算手续费";
const onHover = "占所有赚钱 leader 盈利之和，已扣估算手续费";
assert.equal(PM.leaderFeeHover(present), offHover);
assert.equal(PM.leaderFeeHover({ pnl: { fees_deducted: false } }), offHover);
assert.equal(PM.leaderFeeHover({}), offHover);
assert.match(presentBody, new RegExp('title="' + offHover + '"'));
assert.doesNotMatch(presentBody, /已扣估算手续费/);
const deducted = { pnl: { fees_deducted: true, by_strategy: [{ strategy: "paper", realized_usd: 2, unrealized_usd: 1, total_usd: 3 }], total: { realized_usd: 2, unrealized_usd: 1, total_usd: 3 } } };
assert.equal(PM.leaderFeeHover(deducted), onHover);
const deductedBody = PM.leaderPnlBody(deducted);
assert.match(deductedBody, new RegExp('title="' + onHover + '"'));
assert.doesNotMatch(deductedBody, /未扣估算手续费/);

const absentBag = PM.leaderPnlBag(absent);
assert.equal(absentBag.n, null);
assert.equal(absentBag.copy_rate_detail, null);
assert.equal(absentBag.recent, undefined);
const absentRate = PM.copyRateView(absent);
assert.equal(absentRate.text, "25%");
assert.equal(absentRate.hover, "");
const absentClosed = PM.recentClosedView(absentBag.recent, absentBag.recentReason);
assert.equal(absentClosed.count, null);
assert.equal(absentClosed.text, null);
assert.equal(PM.recentWindowTitle(absentClosed.count), "他近期输赢");
assert.equal(PM.leaderProfitShare(absent).show, false);
const absentBody = PM.leaderPnlBody(absent);
const absentFoot = absentBody.split("合计")[1];
assert.match(absentFoot, /\+\$7\.00/);
assert.match(absentFoot, /\+\$3\.00/);
assert.match(absentFoot, /\+\$10\.00/);

const markBody = PM.leaderPnlBody(blanks.mark);
assert.match(markBody, /\+\$1\.25/);
assert.match(markBody, /title="缺最新价"/);
assert.doesNotMatch(markBody, /\$40/);
const lossShare = PM.leaderProfitShare(blanks.loss);
assert.equal(lossShare.show, true);
assert.equal(lossShare.text, "亏损 −$2.50");
const notFollowed = PM.leaderPnlBody(blanks.not_followed);
assert.match(notFollowed, /未跟过/);
assert.doesNotMatch(notFollowed, /合计/);
assert.equal(PM.leaderProfitShare(blanks.not_followed).text, "未跟过");
const closed = PM.recentClosedView(blanks.no_closed.pnl.recent_closed, "no_closed");
assert.equal(closed.text, "暂无已平仓记录");
assert.equal(closed.count, null);
assert.equal(PM.recentWindowTitle(PM.leaderPnlBag(blanks.no_closed).n), "他近期输赢");
assert.equal(PM.leaderPnlBag(blanks.no_closed).n, null);
const signals = PM.copyRateView(blanks.no_signals);
assert.equal(signals.text, null);
assert.equal(signals.reason, "没有信号");
assert.equal(signals.hover, "");
const other = PM.leaderProfitShare(blanks.no_profitable);
assert.equal(other.show, true);
assert.equal(other.text, "—");
assert.equal(other.hover, "没有赚钱的 leader");
const fills = PM.leaderPnlBody(blanks.fills_only);
assert.match(fills, /未跟过/);
assert.doesNotMatch(fills, /\$80|合计/);

assert.equal(PM.recentClosedView(null, "no_closed_at").hover, "没有平仓时间");
assert.equal(PM.recentClosedView(null, "no_closed_at").text, null);
assert.equal(PM.recentClosedView(null, "analytics_unavailable").hover, "分析库不可用");
assert.equal(PM.recentWindowTitle(null, "overview"), "近期输赢");
assert.equal(PM.recentWindowTitle(4, "overview"), "他近 4 笔输赢");

const objectOnly = PM.copyRateView({
  pnl: {
    by_strategy: [{ strategy: "paper", realized_usd: 1, unrealized_usd: 0, total_usd: 1 }],
    copy_rate: { copied: 3, followed: 1, signals: 8, rate: 0.5 }
  }
});
assert.equal(objectOnly.text, "50%");
assert.equal(objectOnly.hover, "");
