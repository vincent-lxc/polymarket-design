import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const UUID = "6f1c0c3e-1b7a-4c2d-9a10-aabbccddeeff";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

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
    remove() {},
    prepend() {},
    appendChild() {},
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

function loadApi(search) {
  const store = {};
  function ensure(sel) {
    if (!store[sel]) store[sel] = node(false);
    return store[sel];
  }
  const calls = [];
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Intl,
    Date,
    history: { replaceState() {} },
    location: {
      search: search || "",
      pathname: "/overview",
      origin: "https://app.example",
      href: "https://app.example/overview" + (search || ""),
      hash: "",
      host: "app.example",
      replace() {}
    },
    localStorage: { getItem() { return "tok"; }, setItem() {}, removeItem() {} },
    fetch: async (url) => {
      calls.push(String(url));
      const path = new URL(url).pathname;
      if (path === "/v1/accounts") {
        const accounts = sandbox.catalog || [];
        return { ok: true, status: 200, json: async () => ({ accounts }) };
      }
      return { ok: false, status: 404, json: async () => ({ message: "missing" }) };
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    readyState: "loading",
    body: { dataset: { page: "overview" } },
    documentElement: { style: {}, classList: { add() {}, toggle() {} } },
    addEventListener() {},
    createElement() { return node(true); },
    querySelector: (sel) => ensure(sel),
    querySelectorAll: () => [],
    getElementById: (id) => ensure("#" + id)
  };
  const code = fs.readFileSync(new URL("./api.js", import.meta.url), "utf8");
  vm.runInNewContext(code, sandbox);
  sandbox.calls = calls;
  sandbox.store = store;
  return sandbox;
}

const pm = loadApi("");
const PM = pm.PM;

assert.equal(PM.accountRecordId({ id: UUID, strategy: "mockpaper" }), UUID);
assert.equal(PM.accountRecordId({ account_id: UUID_B, strategy: "mockpaper" }), UUID_B);
assert.equal(PM.accountRecordId({ id: "  " }), "");
assert.equal(PM.accountRecordId({ id: "null", account_id: UUID }), UUID);
assert.equal(PM.accountRecordId({ strategy: "mockpaper" }), "");

const catalog = [
  { id: UUID, strategy: "mockpaper", name: "mockpaper", process_kind: "legacy" },
  { id: UUID_B, name: "fees20000", strategy: "fees20000" }
];
assert.equal(PM.matchAccountId("mockpaper", catalog), UUID);
assert.equal(PM.matchAccountId("fees20000", [{ account_id: UUID_B, name: "fees20000" }]), UUID_B);
assert.equal(PM.matchAccountId("missing", catalog), "");
assert.equal(PM.matchAccountId("mockpaper", catalog.concat([{ id: "other-uuid-other-uuid-other-uuid", strategy: "mockpaper", name: "mockpaper" }])), "");
assert.equal(PM.overviewInstanceHref({ strategy: "mockpaper" }, catalog), "/account?id=" + UUID);
assert.equal(PM.overviewInstanceHref({ id: UUID_B, strategy: "mockpaper" }, catalog), "/account?id=" + UUID_B);
assert.equal(PM.overviewInstanceHref({ id: "mockpaper", strategy: "mockpaper" }, catalog), "/account?id=" + UUID);
assert.equal(PM.overviewInstanceHref({ id: "mockpaper", account_id: UUID, strategy: "mockpaper" }, []), "/account?id=" + UUID);
assert.equal(PM.matchAccountUuid("mockpaper", [{ id: "mockpaper", account_id: UUID, name: "mockpaper" }]), UUID);
assert.equal(PM.matchAccountUuid("mockpaper", catalog.concat([{ id: UUID_B, strategy: "mockpaper", name: "mockpaper" }])), "");
assert.equal(PM.overviewInstanceHref({ strategy: "nope" }, catalog), "/account");
assert.equal(PM.overviewInstanceHref({ strategy: "mockpaper" }, []).includes("?s="), false);
assert.equal(PM.overviewInstanceHref({ id: "mockpaper", strategy: "mockpaper" }, []).includes("?s="), false);
assert.equal(PM.overviewInstanceHref({ id: "mockpaper", strategy: "mockpaper" }, []).includes("mockpaper"), false);
assert.equal(PM.accountDetailHref(""), "/account");
assert.equal(PM.accountDetailHref("mockpaper"), "/account");
assert.equal(PM.accountIdSearch("?s=mockpaper&mock=1", UUID), "?mock=1&id=" + UUID);
assert.equal(PM.accountIdSearch("?mock=1&s=mockpaper&sa=1", UUID), "?mock=1&sa=1&id=" + UUID);
assert.equal(PM.accountIdSearch("?s=mockpaper", "mockpaper"), null);
assert.equal(PM.accountIdSearch("?s=mockpaper", ""), null);

const link = PM.overviewAccountLink({ strategy: "mockpaper" }, catalog);
assert.match(link, new RegExp('href="/account\\?id=' + UUID + '"'));
assert.match(link, />mockpaper</);
assert.equal(link.includes("?s="), false);
assert.equal(PM.overviewAccountLink({ strategy: "<b>x</b>" }, []).includes("<b>"), false);

const row = {
  strategy: "mockpaper",
  net_pnl_usd: 10,
  net_pct: 0.1,
  equity_usd: 100,
  open_positions: 1,
  max_open_positions: 2,
  run_state: "running",
  run_state_zh: "运行中"
};
const overview = {
  totals: { cash_usd: 1, positions_value_usd: 1, unrealized_usd: 1, realized_usd: 1, today_pnl_usd: null, fills: 2, open_positions: 1 },
  reasons: {},
  accounts: [row],
  equity_curve: [],
  main_leader: null,
  as_of: "2026-10-23T00:00:00Z"
};

pm.catalog = catalog;
await PM.renderOverview(overview);
const table = pm.store["#ov-accts"]._table.innerHTML;
assert.match(table, new RegExp('href="/account\\?id=' + UUID + '"'));
assert.match(table, />mockpaper</);
assert.equal(table.includes("?s="), false);
assert.equal(table.includes("/v1/accounts/mockpaper"), false);
assert.ok(pm.calls.some((url) => url.includes("/v1/accounts")));
assert.equal(pm.calls.some((url) => url.includes("/mockpaper")), false);

pm.calls.length = 0;
await PM.renderOverview(Object.assign({}, overview, { accounts: [{ ...row, id: UUID }] }));
const direct = pm.store["#ov-accts"]._table.innerHTML;
assert.match(direct, new RegExp('href="/account\\?id=' + UUID + '"'));
assert.equal(pm.calls.length, 0);

pm.calls.length = 0;
pm.catalog = catalog;
await PM.renderOverview(Object.assign({}, overview, { accounts: [{ ...row, id: "mockpaper" }] }));
const namedId = pm.store["#ov-accts"]._table.innerHTML;
assert.match(namedId, new RegExp('href="/account\\?id=' + UUID + '"'));
assert.equal(namedId.includes("?s="), false);
assert.equal(namedId.includes("id=mockpaper"), false);
assert.ok(pm.calls.some((url) => url.includes("/v1/accounts?limit=100")));

pm.catalog = [];
await PM.renderOverview(overview);
const bare = pm.store["#ov-accts"]._table.innerHTML;
assert.match(bare, /href="\/account"/);
assert.equal(bare.includes("?s="), false);
assert.match(bare, />mockpaper</);

const legacy = loadApi("?s=mockpaper&mock=1");
legacy.location.pathname = "/account";
legacy.location.hash = "#keep";
const rewritten = [];
legacy.history.replaceState = function (_state, _title, url) { rewritten.push(url); };
assert.equal(legacy.PM.replaceNamedAccountLocation("mockpaper"), false);
assert.equal(rewritten.length, 0);
assert.equal(legacy.PM.replaceNamedAccountLocation(UUID), true);
assert.equal(rewritten[0], "/account?mock=1&id=" + UUID + "#keep");
assert.equal(rewritten[0].includes("s="), false);
assert.equal(rewritten[0].includes("mock=1"), true);

const apiSrc = fs.readFileSync(new URL("./api.js", import.meta.url), "utf8");
const saSrc = fs.readFileSync(new URL("./sa.js", import.meta.url), "utf8");
assert.equal(apiSrc.includes("/account?s="), false);
assert.equal(saSrc.includes('href("/account", { s:'), false);
assert.match(saSrc, /href\("\/account", \{ id: id \}\)/);
assert.match(saSrc, /openNamedAccount\(params\.get\("s"\)\)/);
assert.match(saSrc, /replaceNamedAccountLocation/);
assert.match(saSrc, /matchAccountUuid/);
assert.equal(saSrc.includes('openDetail(params.get("s")'), false);
assert.match(apiSrc, /\/leaders\?window=/);
assert.match(apiSrc, /appHref\("\/leaders",\{s:/);

console.log("account-link tests ok");
