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
const at = (usd, cents) => new RegExp(usd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '<\\/span><span class="q-at"> @ <\\/span><span class="q-br" aria-hidden="true"><\\/span><span class="q-px">' + cents + "<\\/span>");
assert.match(trades, at("$1,854.00", "42¢"));
assert.match(trades, at("$969.00", "43¢"));
assert.match(trades, /已跟/);
assert.match(trades, at("$300.00", "18¢"));
assert.match(trades, /价格偏移过大/);
const tradeRows = trades.split(/<tr\b/).slice(1);
assert.match(tradeRows[0], /k-hide">[\s\S]*\$1,854\.00[\s\S]*k-primary">[\s\S]*\$969\.00/);
assert.match(tradeRows[0], /class="k-name"/);
const skipped = tradeRows.find((row) => row.includes("$300.00"));
assert.match(skipped, /k-primary">[\s\S]*\$300\.00/);
assert.match(skipped, /k-quote k-hide">[\s\S]*q-amt na/);
assert.match(trades, /湖人 vs 勇士/);
assert.ok(trades.indexOf("$1,854.00") < trades.indexOf("$300.00"));

const pos = PM.leaderPositionBody(detail);
assert.match(pos, /4,410/);
assert.match(pos, /42¢ \/ 44¢/);
assert.match(pos, /\+\$88\.20/);
assert.match(pos, /120 股/);
assert.match(pos, /class="k-name"/);
assert.match(pos, /k-amt"><span class="q-amt">120 股<\/span>/);
assert.match(pos, /data-k="浮动"[^>]*>\+\$88\.20/);
const shareCard = PM.leaderPositionBody({
  open_positions: [{ token_id: "big", question: "Big book", outcome: "Yes", current_size: 5441.15, avg_price: 0.42, last_mark: 0.44, unrealized_pnl: 10 }]
});
assert.match(shareCard, /q-amt">5,441\.15 股</);
assert.doesNotMatch(shareCard, /q-amt">5,441\.15</);
const valued = PM.leaderPositionBody({
  open_positions: [{ token_id: "big", question: "Big book", outcome: "Yes", current_size: 5441.15, current_value_usd: 2394.1, avg_price: 0.42, last_mark: 0.44, unrealized_pnl: 88.2 }],
  our_positions: [{ token_id: "big", outcome: "Yes", current_size: 120, currentValue: 52.8 }]
});
assert.match(valued, /q-usd q-amt">\$2,394\.10</);
assert.match(valued, /q-shares">5,441\.15 股</);
assert.match(valued, /data-k="我方"[^>]*>120 股</);
assert.doesNotMatch(valued, /q-amt">5,441\.15/);
assert.doesNotMatch(valued, /q-amt">\$52\.80/);
const ourValue = PM.leaderPositionBody({
  open_positions: [{ token_id: "p", question: "Ours", outcome: "Yes", current_size: 80, unrealized_pnl: 1 }],
  our_positions: [{ token_id: "p", outcome: "Yes", current_size: 12.5, market_value_usd: 6.4 }]
});
assert.match(ourValue, /q-usd q-amt">\$6\.40</);
assert.match(ourValue, /q-shares">12\.5 股</);

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
assert.equal(PM.leaderPriceQuery("yes-tok", "0xabc", "all"), "/v1/markets/yes-tok/prices?range=max&bucket=1d&leader=0xabc");
assert.equal(PM.leaderPriceQuery("yes-tok", "0xabc", "全部"), "/v1/markets/yes-tok/prices?range=max&bucket=1d&leader=0xabc");
assert.equal(PM.leaderPriceQuery("yes-tok", "0xabc", "1w"), "/v1/markets/yes-tok/prices?range=1w&bucket=1h&leader=0xabc");
assert.doesNotMatch(PM.leaderPriceQuery("yes-tok", "0xabc", "all"), /range=all/);

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
assert.match(emptyPnl, /暂无数据/);
assert.match(emptyPnl, /—/);
assert.doesNotMatch(emptyPnl, /暂未汇总|待新增只读接口|未命名市场|需后端按市场汇总/);

const slugTrade = PM.leaderTradeBody({
  trades: [{ id: "s", token_id: "slug-tok", market: "will-the-fed-cut-rates-in-december", slug: "will-the-fed-cut-rates-in-december", outcome: "Yes", side: "BUY", notional_usd: 15, price: 0.37, t: 1 }]
});
assert.match(slugTrade, /title="Will The Fed Cut Rates In December"/);
assert.match(slugTrade, />Will The Fed Cut Rates In December</);
assert.match(slugTrade, /class="mkt-ell"/);
assert.doesNotMatch(slugTrade, />will-the-fed-cut-rates-in-december</);

const slugPos = PM.leaderPositionBody({
  open_positions: [{ token_id: "p", slug: "bitcoin-above-150k", question: "Bitcoin above $150,000?", outcome: "Yes", current_size: 2, avg_price: 0.4, last_mark: 0.42, unrealized_pnl: 1 }]
});
assert.match(slugPos, />Bitcoin above \$150,000\?</);
assert.match(slugPos, /class="mkt-line"/);
assert.doesNotMatch(slugPos, />bitcoin-above-150k</);

const linkedTitle = PM.leaderTradeBody({
  markets: [{ condition_id: "c-link", question: "Strait of Hormuz traffic returns to normal by October 31?" }],
  trades: [{ id: "sl", token_id: "sl-tok", condition_id: "c-link", slug: "strait-of-hormuz-traffic", outcome: "Yes", side: "BUY", notional_usd: 8, price: 0.5, t: 2 }]
});
assert.match(linkedTitle, />Strait of Hormuz traffic returns to normal by October 31\?</);
assert.doesNotMatch(linkedTitle, />strait-of-hormuz-traffic</);

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
assert.doesNotMatch(html, /待新增只读接口|暂未汇总|未命名市场|需后端按市场汇总|待后端计算/);
const css = fs.readFileSync(new URL("./app.css", import.meta.url), "utf8");
assert.match(css, /body\[data-page="leader"\] #pc \.pchart\{height:240px;min-height:200px\}/);
assert.match(css, /@media\(max-width:480px\)\{[\s\S]*\.pc-pill\{flex:1 1 auto;max-width:none/);
assert.match(api, /显示更多/);
assert.match(css, /@media\(max-width:900px\)\{[\s\S]*\.rowcards tr:has\(\.k-name\)\{/);
assert.equal(css.includes("min-width:640px"), false);
assert.match(html, /class="card rowcards" id="ld-trades"/);
assert.match(html, /class="card rowcards" id="ld-pos"/);
assert.match(html, /class="card rowcards" id="ld-pnl"/);
assert.match(css, /\.inflow\{position:static/);
assert.match(pc, /id="pc-sides"/);

const cfbMarkets = PM.leaderMarkets({
  trades: [
    { token_id: "alb", condition_id: "cfb", outcome: "Alabama", side: "BUY", notional_usd: 80, t: 1700001800000 },
    { token_id: "aub", condition_id: "cfb", outcome: "Auburn", side: "SELL", notional_usd: 20, t: 1700001900000 }
  ],
  markets: [{ condition_id: "cfb", slug: "alabama-auburn", question: "Alabama vs Auburn" }]
});
assert.equal(cfbMarkets[0].title, "Alabama vs Auburn");
assert.equal(cfbMarkets[0].title.includes("未命名"), false);
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
assert.equal(unnamed[0].title, "市场 z");
assert.equal(unnamed[0].title.includes("未命名"), false);

const prefixed = PM.leaderMarkets({
  trades: [{ token_id: "0x12ab89cdef0123456789", outcome: "Yes", side: "BUY", notional_usd: 3 }]
});
assert.equal(prefixed[0].title, "市场 0x12ab…");

const fromSlug = PM.leaderMarkets({
  trades: [{ token_id: "slug-tok", slug: "will-the-fed-cut-rates", outcome: "Yes", side: "BUY", notional_usd: 4 }]
});
assert.equal(fromSlug[0].title, "Will The Fed Cut Rates");

const longTitles = [
  "US x Iran ceasefire continues through October 22?",
  "US x Iran ceasefire continues through November 8?",
  "Will the Democratic Party control the Senate after the 2026 Midterm elections?",
  "Will the Republican Party control the Senate after the 2026 Midterm elections?",
  "US x Iran ceasefire continues through October 28?",
  "US x Iran ceasefire continues through November 30?",
  "US x Iran ceasefire continues through November 15?",
  "US–Iran Hormuz Agreement by November 30?",
  "Israel x Iran ceasefire continues through October 24?",
  "Israel x Iran ceasefire continues through October 27?",
  "Will Benjamin Netanyahu be the next Prime Minister of Israel?",
  "Strait of Hormuz traffic returns to normal by October 31?",
  "Any G20 leader out in 2026?",
  "Will Iran's nuclear program be constrained through December 2026?",
  "Will a US Navy vessel transit the Strait of Hormuz in November 2026?",
  "Bitcoin above $150,000 on December 31, 2026?"
];
const many = PM.leaderMarkets({
  trades: longTitles.map((question, i) => ({
    token_id: "m" + i,
    condition_id: "mc" + i,
    question,
    outcome: "Yes",
    side: "BUY",
    notional_usd: (longTitles.length - i) * 1000
  })).concat([{ token_id: "0x12ab89cdef0123456789", outcome: "Yes", side: "BUY", notional_usd: 1 }])
});
assert.ok(many.length > 10);
assert.equal(many[0].title, longTitles[0]);
const switchHtml = PM.marketSwitcherHtml(many, 0);
const pillZone = switchHtml.split('id="pc-pop"')[0];
const pills = pillZone.match(/class="pc-pill/g) || [];
assert.equal(pills.length, 4);
assert.ok(pills.length < many.length);
assert.match(switchHtml, /更多 /);
assert.match(switchHtml, /搜索市场/);
assert.equal((switchHtml.match(/data-k="mkt:/g) || []).length, 4);
assert.doesNotMatch(pillZone, /class="seg"/);
assert.match(pillZone, /title="US x Iran ceasefire continues through October 22\?"/);
longTitles.slice(4).forEach((title) => assert.equal(pillZone.includes(title), false));
assert.equal(switchHtml.includes("未命名"), false);
assert.doesNotMatch(api, /seg\.id="pc-mkts"/);
const morePlan = PM.marketSwitcherPlan(many, 0);
const firstPage = PM.marketSwitcherSlice(morePlan.more, "", 0, 50);
const secondPage = PM.marketSwitcherSlice(morePlan.more, "", 50, 50);
assert.equal(firstPage.total, morePlan.moreCount);
assert.equal(firstPage.rows.length, Math.min(50, morePlan.moreCount));
assert.equal(secondPage.rows.length, Math.max(0, morePlan.moreCount - 50));
assert.ok(firstPage.rows.some((row) => String(row.m.title).includes("0x12ab")));
const big = Array.from({ length: 437 }, (_, i) => ({ title: "Long polymarket question " + i + " ".repeat(40) + "ceasefire elections senate", notional: 437 - i }));
const bigPlan = PM.marketSwitcherPlan(big, 0);
assert.equal(bigPlan.inline.length, 4);
assert.equal(bigPlan.moreCount, 433);
const bigPage = PM.marketSwitcherSlice(bigPlan.more, "", 0, 50);
assert.equal(bigPage.rows.length, 50);
assert.equal(bigPage.total, 433);
const bigNext = PM.marketSwitcherSlice(bigPlan.more, "", 50, 50);
assert.equal(bigNext.rows.length, 50);
assert.equal(bigNext.rows[0].i, bigPlan.more[50].i);
const found = PM.marketSwitcherSlice(bigPlan.more, "question 120", 0, 50);
assert.ok(found.total >= 1);
assert.ok(found.total < bigPlan.moreCount);
assert.ok(found.rows.every((row) => /120/.test(row.m.title)));
const bigHtml = PM.marketSwitcherHtml(big, 0);
assert.equal((bigHtml.match(/class="pc-pill/g) || []).length, 4);
assert.equal((bigHtml.match(/data-k="mkt:/g) || []).length, 4);
assert.equal(bigHtml.includes("question 200"), false);
const narrowPlan = PM.marketSwitcherPlan(many, 2, 1);
assert.equal(narrowPlan.inline.length, 1);
assert.equal(narrowPlan.inline[0].i, 2);
assert.equal(narrowPlan.moreCount, many.length - 1);
const narrowHtml = PM.marketSwitcherHtml(many, 2, 1);
const narrowZone = narrowHtml.split('id="pc-pop"')[0];
assert.equal((narrowZone.match(/class="pc-pill/g) || []).length, 1);
assert.match(narrowZone, /data-k="mkt:2"/);
assert.match(narrowHtml, new RegExp("更多 " + (many.length - 1)));
const pagedTrades = PM.leaderTradeBody({
  trades: Array.from({ length: 45 }, (_, i) => ({
    id: "r" + i,
    token_id: "tok" + i,
    question: "Market " + i,
    outcome: "Yes",
    side: "BUY",
    notional_usd: 10,
    price: 0.4,
    t: 1700000000000 + i * 1000
  }))
});
assert.equal((pagedTrades.match(/<tr/g) || []).length, 45);
assert.equal((pagedTrades.match(/class="more"/g) || []).length, 25);
assert.match(pagedTrades, /显示更多|class="more"/);
const step = PM.leaderRevealCount(45, 20);
assert.equal(step.shown, 40);
assert.equal(step.more, true);
const done = PM.leaderRevealCount(45, 40);
assert.equal(done.shown, 45);
assert.equal(done.more, false);
const pagedPos = PM.leaderPositionBody({
  open_positions: Array.from({ length: 25 }, (_, i) => ({
    token_id: "p" + i,
    question: "Pos " + i,
    outcome: "Yes",
    current_size: 1,
    avg_price: 0.4,
    last_mark: 0.41,
    unrealized_pnl: 1
  }))
});
assert.equal((pagedPos.match(/<tr/g) || []).length, 25);
assert.equal((pagedPos.match(/class="more"/g) || []).length, 5);

for (const page of ["leader.html", "leader-5c1e.html", "leader-91d4.html", "leader-avalon.html", "leader-lunadegen.html"]) {
  const pageHtml = fs.readFileSync(new URL("./" + page, import.meta.url), "utf8");
  assert.doesNotMatch(pageHtml, /prices（待建）/);
  assert.doesNotMatch(pageHtml, /校准中|Calibrating|ld-curve-label|data-cal="equity"/);
}

const curveAt = html.indexOf("他的累计盈亏（已实现+浮动）");
assert.ok(curveAt > 0);
const curve = html.slice(curveAt, html.indexOf('id="ld-pnl"'));
assert.match(curve, /<svg/);
assert.match(curve, /<polyline/);

const lang = fs.readFileSync(new URL("./lang.js", import.meta.url), "utf8");
assert.doesNotMatch(lang, /校准中|Calibrating/);
assert.doesNotMatch(api, /校准中|Calibrating|ld-curve-label/);

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
