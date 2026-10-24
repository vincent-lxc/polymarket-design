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

const PM = loadApi();
const detail = {
  trades: [
    { id: "t1", token_id: "yes-tok", condition_id: "c1", market: "Fed 12 月降息？", outcome: "Yes", side: "BUY", notional_usd: 1854, price: 0.42, t: "2026-10-21T04:00:00Z" },
    { id: "t2", token_id: "no-tok", condition_id: "c1", market: "Fed 12 月降息？", outcome: "No", side: "SELL", notional_usd: 300, price: 0.18, t: "2026-10-21T02:14:00Z" },
    { id: "t3", token_id: "yes-b", condition_id: "c2", market: "湖人 vs 勇士", outcome: "Yes", side: "BUY", notional_usd: 420, price: 0.61, t: "2026-10-21T03:00:00Z" }
  ],
  mirrors: [
    { leader_trade_id: "t1", fill_usd: 969, fill_price: 0.43, decision: "copied", side: "BUY" },
    { leader_trade_id: "t2", decision: "rejected", reason: "slippage", reason_zh: "价格偏移过大", side: "SELL" }
  ],
  open_positions: [
    { token_id: "yes-tok", market: "Fed 12 月降息？", outcome: "Yes", current_size: 4410, avg_price: 0.42, last_mark: 0.44, unrealized_pnl: 88.2 }
  ],
  our_positions: [
    { token_id: "yes-tok", outcome: "Yes", current_size: 120 }
  ],
  pnl: {
    by_strategy: [
      { strategy: "catsports20000", realized_usd: 10, unrealized_usd: 2, total_usd: 12 },
      { strategy: "paper20000", realized_usd: -3, unrealized_usd: 1, total_usd: -2 }
    ],
    copy_rate: { copied: 3, signals: 8 },
    our_share: 0.35,
    recent_closed: { wins: 12, losses: 8 }
  }
};

const trades = PM.leaderTradeBody(detail);
assert.match(trades, /Fed 12 月降息？/);
assert.match(trades, /\$1,854\.00 @ 42¢/);
assert.match(trades, /\$969\.00 @ 43¢/);
assert.match(trades, /已跟/);
assert.match(trades, /\$300\.00 @ 18¢/);
assert.match(trades, /价格偏移过大/);
assert.match(trades, /湖人 vs 勇士/);
assert.ok(trades.indexOf("$1,854.00") < trades.indexOf("$300.00"));

const pos = PM.leaderPositionBody(detail);
assert.match(pos, /4,410/);
assert.match(pos, /42¢ \/ 44¢/);
assert.match(pos, /\+\$88\.20/);
assert.match(pos, /120 股/);
assert.match(pos, /我方镜像持仓|120 股/);

const pnl = PM.leaderPnlBody(detail);
assert.match(pnl, /catsports20000/);
assert.match(pnl, /paper20000/);
assert.match(pnl, /合计/);
assert.match(pnl, /\+\$7\.00/);
assert.match(pnl, /\+\$3\.00/);
assert.match(pnl, /\+\$10\.00/);
const bag = PM.leaderPnlBag(detail);
assert.equal(bag.by.length, 2);
assert.equal(bag.copy_rate.copied, 3);
assert.equal(bag.copy_rate.signals, 8);
assert.equal(bag.share, 0.35);
assert.equal(bag.recent.wins, 12);

const markets = PM.leaderMarkets(detail);
assert.equal(markets[0].title, "Fed 12 月降息？");
assert.equal(PM.dominantSide(markets[0]), "Yes");
assert.equal(PM.tokenFor(markets[0], "Yes"), "yes-tok");
assert.equal(PM.tokenFor(markets[0], "No"), "no-tok");
assert.equal(PM.leaderPriceQuery("yes-tok", "0xabc", "1d"), "/v1/markets/yes-tok/prices?range=1d&bucket=1h&leader=0xabc");
assert.equal(PM.leaderPriceQuery("yes-tok", "0xabc", "1h"), "/v1/markets/yes-tok/prices?range=1h&bucket=1m&leader=0xabc");

const book = PM.normalizePriceBook({
  history: [{ t: 1000, p: 0.4 }, { t: 2000, p: 0.42 }],
  ohlc: [{ t: 1000, o: 0.4, h: 0.5, l: 0.3, c: 0.42 }],
  leader_trades: [{ t: 1500, side: "BUY", price: 0.42, outcome: "Yes", notional_usd: 1854 }],
  our_fills: [{ t: 1600, side: "BUY", price: 0.43, outcome: "Yes", fill_usd: 969 }]
});
assert.equal(book.history.length, 2);
assert.equal(book.ohlc.length, 1);
assert.equal(book.ohlc[0].h, 0.5);
assert.equal(book.marks.length, 2);
assert.equal(book.marks[0].who, "L");
assert.equal(book.marks[1].who, "M");
assert.equal(book.marks[1].notional, 969);

const emptyPnl = PM.leaderPnlBody({});
assert.match(emptyPnl, /合计/);
assert.match(emptyPnl, /无数据|暂未汇总/);

const api = fs.readFileSync(new URL("./api.js", import.meta.url), "utf8");
assert.match(api, /if\(PAGE==="leader"\) return;/);
assert.match(api, /\/v1\/markets\/\$\{encodeURIComponent\(tokenId\)\}\/prices/);
assert.doesNotMatch(api, /secs\.forEach\(s=>s\.remove\(\)\)/);

const html = fs.readFileSync(new URL("./leader.html", import.meta.url), "utf8");
for (const id of ["ld-perf", "ld-pnl", "pc", "ld-trades", "ld-pos"]) assert.match(html, new RegExp(`id="${id}"`));
assert.match(html, /他买入/);
assert.match(html, /他卖出/);
assert.match(html, /我方镜像/);
assert.match(html, /需要注意/);
assert.match(html, /持仓占用 Top/);
assert.match(html, /我方对他的累计盈亏/);
assert.match(html, /他的交易 · 我方镜像/);
assert.match(html, /他的当前持仓/);
assert.match(html, /市场价格 · 买卖点/);
const pc = html.slice(html.indexOf('id="pc"'), html.indexOf('id="pc"') + 2500);
assert.match(pc, /\/v1\/markets\/\{token_id\}\/prices/);
assert.doesNotMatch(pc, /待建/);
assert.match(pc, /id="pc-sides"/);

const cfbMarkets = PM.leaderMarkets({
  trades: [
    { token_id: "alb", condition_id: "cfb", outcome: "Alabama", side: "BUY", notional_usd: 80, t: 1700001800000 },
    { token_id: "aub", condition_id: "cfb", outcome: "Auburn", side: "SELL", notional_usd: 20, t: 1700001900000 }
  ],
  markets: [{ condition_id: "cfb", slug: "alabama-auburn", question: "Alabama vs Auburn" }]
});
assert.equal(cfbMarkets[0].title, "Alabama vs Auburn");
assert.notEqual(cfbMarkets[0].title, "未命名市场");
assert.equal(PM.dominantSide(cfbMarkets[0]), "Alabama");
assert.equal(PM.tokenFor(cfbMarkets[0], "Alabama"), "alb");
assert.equal(PM.tokenFor(cfbMarkets[0], "Auburn"), "aub");

const lateName = PM.leaderMarkets({
  trades: [
    { token_id: "y", condition_id: "c", outcome: "Yes", notional_usd: 5 },
    { token_id: "n", condition_id: "c", outcome: "No", notional_usd: 1, question: "Fed 12 月降息？" }
  ]
});
assert.equal(lateName[0].title, "Fed 12 月降息？");

const sized = PM.leaderMarkets({
  trades: [
    { token_id: "alb", condition_id: "g", outcome: "Alabama", side: "BUY", usdcSize: 10 },
    { token_id: "aub", condition_id: "g", outcome: "Auburn", side: "BUY", usdcSize: 90 }
  ]
});
assert.equal(PM.dominantSide(sized[0]), "Auburn");
assert.equal(PM.tokenFor(sized[0], "Auburn"), "aub");

const unnamed = PM.leaderMarkets({
  trades: [{ token_id: "z", outcome: "Yes", side: "BUY", notional_usd: 1 }]
});
assert.equal(unnamed[0].title, "未命名市场");

for (const page of ["leader.html", "leader-5c1e.html", "leader-91d4.html", "leader-avalon.html", "leader-lunadegen.html"]) {
  const pageHtml = fs.readFileSync(new URL("./" + page, import.meta.url), "utf8");
  assert.doesNotMatch(pageHtml, /prices（待建）/);
}

const curveAt = html.indexOf('id="ld-curve-label"');
assert.ok(curveAt > 0);
const curve = html.slice(curveAt, html.indexOf('id="ld-pnl"'));
assert.match(curve, /他的累计盈亏（已实现\+浮动）/);
assert.match(curve, /data-cal="equity"[^>]*>校准中/);
assert.match(curve, /<svg/);
assert.match(curve, /<polyline/);
assert.doesNotMatch(curve.slice(0, 700), /display:\s*none|visibility:\s*hidden|opacity:\s*0/);
const pcCard = html.slice(html.indexOf('id="pc"'), html.indexOf('id="ld-trades"'));
assert.doesNotMatch(pcCard, /校准中/);

const lang = fs.readFileSync(new URL("./lang.js", import.meta.url), "utf8");
assert.match(lang, /"校准中": "Calibrating"/);

const paint = api.slice(api.indexOf("function paintLeaderPerfCurve"), api.indexOf("function numOrNull"));
assert.match(paint, /<polyline/);
assert.doesNotMatch(paint, /ld-curve-label|校准中|display:\s*none/);

const cfbBook = PM.normalizePriceBook({
  history: [{ t: 1700000000, p: 0.41 }, { t: 1700003600, p: 0.46 }],
  leader_trades: [{ timestamp: 1700001800, side: "BUY", price: 0.44, outcome: "Alabama", usdcSize: 120 }],
  our_fills: []
});
assert.equal(cfbBook.marks.length, 1);
assert.equal(cfbBook.marks[0].who, "L");
assert.equal(cfbBook.marks[0].side, "BUY");
assert.equal(cfbBook.marks[0].outcome, "Alabama");
assert.ok(cfbBook.marks.every((m) => m.who !== "M"));
assert.equal(cfbBook.marks[0].notional, 120);

const wrapped = PM.normalizePriceBook({
  history: [{ t: 1700000000, p: 0.4 }, { t: 1700003600, p: 0.5 }],
  leader_trades: { trades: [{ timestamp: 1700001800, side: "sell", price: 42, outcome: "Auburn" }] },
  our_fills: null
});
assert.equal(wrapped.marks.length, 1);
assert.equal(wrapped.marks[0].who, "L");
assert.equal(wrapped.marks[0].side, "SELL");
assert.equal(wrapped.marks[0].price, 0.42);
assert.ok(wrapped.marks.every((m) => m.who !== "M"));

const uuid = "6f1c0c3e-1b7a-4c2d-9a10-aabbccddeeff";
assert.equal(PM.overviewInstanceHref({ id: uuid, strategy: "paper20000" }, []), "/account?id=" + uuid);
assert.match(PM.accountDetailHref(uuid), /\/account\?id=/);

console.log("leader-detail tests ok");
