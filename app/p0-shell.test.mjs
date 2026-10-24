import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

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
    el._svg = node(true);
    el.querySelector = (sel) => {
      if (sel === "table") return el._table;
      if (sel === ".hd") return el._hd;
      if (sel === "svg") return el._svg;
      return null;
    };
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
  const code = fs.readFileSync(new URL("./api.js", import.meta.url), "utf8");
  vm.runInNewContext(code, sandbox);
  sandbox.store = store;
  return sandbox;
}

const pm = loadApi();
const PM = pm.PM;

assert.equal(PM.heartbeatLabel(null), "");
assert.equal(PM.heartbeatLabel({}), "");
assert.equal(PM.heartbeatLabel({ as_of: null, heartbeat: null }), "");
assert.match(PM.heartbeatLabel({ as_of: "2026-10-24T04:36:00Z" }), /^更新 \d{2}-\d{2} \d{2}:\d{2}$/);
assert.match(PM.heartbeatLabel({ heartbeat: { as_of: "2026-10-24T04:36:12Z", age_sec: 20 } }), /^心跳 \d{2}-\d{2} \d{2}:\d{2} · 20 秒内$/);
assert.match(PM.heartbeatLabel({ services: { copy: { last_signal_at: "2026-10-24T04:36:00Z" } } }), /^更新 /);
assert.equal(PM.heartbeatLabel({ heartbeat: { as_of: "not-a-time" } }).includes("10-21"), false);

assert.equal(PM.normalizeOverviewRange("1H"), "1h");
assert.equal(PM.normalizeOverviewRange("7d"), "7d");
assert.equal(PM.normalizeOverviewRange("90d"), "");
assert.equal(PM.overviewRangeEcho({ range: "24h" }), "24h");
assert.equal(PM.overviewRangeEcho({ window: "1h" }), "1h");
assert.equal(PM.overviewRangeEcho({}), "");

function hours(n) {
  return new Date(Date.UTC(2026, 9, 24, 0, 0, 0) + n * 3600000).toISOString();
}
const day = [];
for (let i = 0; i < 24; i++) day.push({ t: hours(i), equity: 1000 + i });

const h1 = PM.sliceOverviewCurve(day, "1h", "");
assert.equal(h1.mode, "on");
assert.ok(h1.curve.length >= 2 && h1.curve.length < day.length);
assert.equal(h1.curve[h1.curve.length - 1].equity, 1023);
assert.equal(h1.curve.some((p) => p.equity === 1000), false);

const echoedHour = PM.sliceOverviewCurve(day, "1h", "24h");
assert.equal(echoedHour.mode, "on");
assert.equal(echoedHour.curve[echoedHour.curve.length - 1].equity, 1023);

const week = PM.sliceOverviewCurve(day, "7d", "");
assert.equal(week.mode, "empty");
assert.equal(week.curve.length, 0);

const weekEcho = PM.sliceOverviewCurve(day, "7d", "24h");
assert.equal(weekEcho.mode, "unsupported");
assert.equal(weekEcho.curve.length, 0);

const trusted = [];
for (let i = 0; i < 24 * 7; i++) trusted.push({ t: hours(i), equity: i });
const full = PM.sliceOverviewCurve(trusted, "7d", "7d");
assert.equal(full.mode, "on");
assert.equal(full.curve.length, trusted.length);

const card = PM.shareCardFromTotals(150930.24, 10930.24, 10930.24 / 140000, day.slice(-2), "= 2 个策略实例合计");
assert.equal(card.eq, "$150,930.24");
assert.equal(card.eq.includes("78,485"), false);
assert.equal(card.v.length, 2);
assert.match(card.range, / – /);

const overview = {
  totals: { cash_usd: 1, positions_value_usd: 1, unrealized_usd: 1, realized_usd: 1, today_pnl_usd: null, fills: 2, open_positions: 1 },
  reasons: {},
  accounts: [{ strategy: "paper", equity_usd: 150930.24, capital_usd: 140000, net_pnl_usd: 10930.24, net_pct: 0.078, open_positions: 1, max_open_positions: 2, run_state: "running", run_state_zh: "运行中" }],
  equity_curve: day.slice(-3),
  main_leader: null,
  as_of: "2026-10-24T04:36:00Z"
};
await PM.renderOverview(overview);
const sh = pm.store["#shcv"].dataset;
assert.equal(sh.eq, "$150,930.24");
assert.equal(sh.live, "1");
assert.equal(sh.shell, "0");
assert.equal(sh.eq.includes("78,485"), false);
assert.equal(JSON.parse(sh.v).length, 3);
const hb = pm.store[".hbt"].textContent;
assert.match(hb, /^更新 /);
assert.equal(hb.includes("10-21"), false);
assert.equal(hb.includes("12:40:12"), false);

const ov = fs.readFileSync(new URL("./overview.html", import.meta.url), "utf8");
const cfg = fs.readFileSync(new URL("./config.html", import.meta.url), "utf8");
const hl = fs.readFileSync(new URL("./health.html", import.meta.url), "utf8");
const share = fs.readFileSync(new URL("./share.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("./api.js", import.meta.url), "utf8");
const headers = fs.readFileSync(new URL("./_headers", import.meta.url), "utf8");
for (const html of [ov, cfg, hl]) {
  assert.equal(html.includes("心跳 10-21 12:40"), false);
  assert.match(html, /pending-metrics/);
  assert.match(html, /api\.js\?v=p0fe3/);
  assert.match(html, /app\.css\?v=p0fe3/);
}
assert.match(ov, /id="ov-range"/);
assert.match(ov, /data-range="1h"/);
assert.match(ov, /data-range="7d"/);
assert.match(ov, /data-shell="1"/);
assert.match(ov, /share\.js\?v=p0fe3/);
assert.match(share, /PMShare/);
assert.match(share, /D\.live!=="1"/);
assert.match(api, /\/v1\/overview\?range=/);
assert.match(api, /loadOverview\(readOverviewRange\(\)\)/);
assert.match(api, /paintHeartbeat/);
assert.equal((api.match(/\/v1\/overview\?range=24h/g) || []).length, 1);
assert.match(headers, /CDN-Cache-Control: no-store/);
assert.match(headers, /\/overview/);
assert.doesNotMatch(api, /leader\?addr=.*lunadegen/);

assert.equal(PM.mirrorMarketName({ market: "Ipswich O/U", title: undefined }), "Ipswich O/U");
assert.equal(PM.mirrorMarketName({ title: "不要用标题", market: "Xi Jinping out" }), "Xi Jinping out");
assert.equal(PM.mirrorMarketName({ market: null, title: "Fed", slug: "ipswich-ou" }), "Fed");
assert.equal(PM.mirrorMarketName({ market: "市场", title: "Fed" }), "Fed");
assert.equal(PM.mirrorMarketName({ market: null, title: "市场", slug: "ipswich-ou" }), "ipswich ou");
assert.equal(PM.mirrorMarketName({ slug: "will-btc-hit" }), "will btc hit");
assert.equal(PM.mirrorMarketName({ market: "市场", title: "市场", condition_id: "0xabc123def4567890abcd" }), "0xabc1…abcd");
assert.equal(PM.mirrorMarketName({ market: null, title: "Fed" }), "Fed");
assert.equal(PM.marketHtml(PM.mirrorMarketName({ market: null, title: "Fed" }), { title: "Fed" }).includes("Fed"), true);
assert.equal(PM.marketHtml("Ipswich O/U", { market: "Ipswich O/U" }).includes("Ipswich O/U"), true);
await PM.renderOverview(Object.assign({}, overview, {
  recent_mirrors: [
    { market: "市场", title: "Fed decision", slug: "fed-decision", side: "BUY", leader_notional_usd: 12, leader_price: 0.42, fill_usd: null, slippage_bps: null, decision: "copied" },
    { market: null, title: "市场", slug: "ipswich-ou", side: "SELL", fill_usd: null, decision: "copied" },
    { market: "市场", title: "", condition_id: "0xabc123def4567890abcd", side: "BUY", fill_usd: null, decision: "copied" }
  ]
}));
const mirrorHtml = pm.store["#ov-mirrors"]._table.innerHTML;
assert.equal(mirrorHtml.includes("暂未汇总"), false);
assert.match(mirrorHtml, /Fed decision/);
assert.match(mirrorHtml, /ipswich ou/);
assert.match(mirrorHtml, /0xabc1…abcd/);
assert.equal(mirrorHtml.includes("TAP TO REMIX"), false);
const nameCells = [...mirrorHtml.matchAll(/<tr><td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
assert.equal(nameCells.length, 3);
for (const text of nameCells) assert.notEqual(text, "市场");
assert.match(mirrorHtml, /<span class="na"[^>]*>—<\/span>/);

assert.equal(PM.formatShares(609.1500000000001), "609.15");
assert.equal(PM.formatShares(5.72), "5.72");
assert.equal(PM.formatShares(45.7), "45.70");
assert.equal(PM.formatShares(null), "—");

const ariel = PM.leaderIdentity({
  address: "0xe18ecc345e00ee7c4f2d1f676f3dd2acb112f826",
  profile: { user_name: "ArielFilipino", x_username: null, portfolio_value_usd: 205044.869 }
});
assert.equal(ariel.heading, "@ArielFilipino");
assert.equal(ariel.x, "");
assert.equal(ariel.title, "Leader @ArielFilipino · Wakeloom 织迹");
assert.equal(ariel.crumb.includes("lunadegen"), false);
assert.equal(ariel.crumb.includes("0x7a3f"), false);
assert.equal(ariel.crumb.includes("X @"), false);
assert.equal(ariel.crumb.includes("0xe18e"), true);
assert.equal(ariel.title.includes("lunadegen"), false);

const leaderHtml = fs.readFileSync(new URL("./leader.html", import.meta.url), "utf8");
assert.match(leaderHtml, /<title>Leader · Wakeloom 织迹<\/title>/);
assert.match(leaderHtml, /pending-leader/);
assert.doesNotMatch(leaderHtml, /<title>[^<]*lunadegen/);
assert.match(api, /mirrorMarketName\(m\)/);
assert.match(api, /formatShares\(p\.shares\)/);
assert.match(api, /profile\.x_username/);

const bannedShell = /alchemy|drpc|quicknode|ankr|weird_new_code|价格偏移过大|sk-•|84 ms|1,412/;
assert.equal(bannedShell.test(hl), false);
assert.equal(bannedShell.test(cfg), false);
assert.match(hl, /id="hl-rej"/);
assert.match(hl, /<div class="mr"><\/div>/);
assert.doesNotMatch(hl, /<tr><td/);
assert.doesNotMatch(cfg, /<tr><td/);
assert.doesNotMatch(cfg, /删除 RPC ·/);

const sa = fs.readFileSync(new URL("./sa.js", import.meta.url), "utf8");
assert.match(sa, /function askArchive/);
assert.match(sa, /if \(act === "archive" && account\) return askArchive\(account\);\n    if \(\(act === "start" \|\| act === "unarchive"\) && account\)/);
assert.match(sa, /id="sa-do-arch" disabled/);
assert.match(sa, /id="sa-cap"[^>]*type="number"/);
assert.match(sa, /id="sa-newcap" type="number"/);
assert.match(sa, /numeric \? ' type="number"'/);
for (const page of ["account.html", "compare.html", "leaders.html", "markets.html", "strategies.html"]) {
  const html = fs.readFileSync(new URL("./" + page, import.meta.url), "utf8");
  assert.match(html, /sa\.js\?v=pnl2/);
}
const accountHtml = fs.readFileSync(new URL("./account.html", import.meta.url), "utf8");
assert.match(accountHtml, /pnl-buckets\.js\?v=pnl2/);

console.log("p0 shell tests ok");
