import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const UUID = "6f1c0c3e-1b7a-4c2d-9a10-aabbccddeeff";

function node(extra) {
  const el = {
    innerHTML: "",
    textContent: "",
    hidden: false,
    title: "",
    id: "",
    className: "",
    dataset: {},
    style: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() { return ""; },
    addEventListener() {},
    remove() {},
    prepend() {},
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  return Object.assign(el, extra || {});
}

function loadAccount(search, hooks) {
  hooks = hooks || {};
  const calls = [];
  const h1 = node();
  h1.innerHTML = '账户 <i class="sk m"></i>';
  h1.textContent = "账户 sk";
  const big = node();
  big.innerHTML = '<i class="sk xl"></i>';
  const sub = node();
  sub.innerHTML = '<i class="sk l"></i>';
  const kv = node();
  kv.innerHTML = '<div><i class="sk"></i></div>';
  const main = node();
  main.querySelector = (sel) => {
    if (sel === ".big") return big;
    if (sel === ".sub") return sub;
    if (sel === ".kv") return kv;
    if (sel === ".hd") return node();
    return null;
  };
  const posTable = node();
  posTable.innerHTML = '<tr><th>市场</th></tr><tr><td><i class="sk l"></i></td></tr>';
  const actTable = node();
  actTable.innerHTML = '<tr><th>时间</th></tr><tr><td><i class="sk"></i></td></tr>';
  const pos = node();
  pos.querySelector = (sel) => (sel === "table" ? posTable : null);
  const act = node();
  act.querySelector = (sel) => (sel === "table" ? actTable : sel === ".hd" ? node({ outerHTML: "<div class='hd'></div>" }) : null);
  const steps = node();
  const run = node({ id: "ac-run", hidden: true });
  const state = node({ id: "ac-state", hidden: true });
  const store = {
    ".top h1": h1,
    "#ac-main": main,
    "#ac-main .big": big,
    "#ac-main .sub": sub,
    "#ac-main .kv": kv,
    "#ac-pos": pos,
    "#ac-act": act,
    ".steps": steps,
    "#ac-run": run,
    "#ac-state": state
  };
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Intl,
    Date,
    history: { replaceState() {} },
    location: {
      search: search || "",
      pathname: "/account",
      origin: "https://app.example",
      href: "https://app.example/account" + (search || ""),
      hash: "",
      host: "app.example",
      replace() {}
    },
    localStorage: { getItem() { return "tok"; }, setItem() {}, removeItem() {} },
    fetch: async (url) => {
      calls.push(String(url));
      const u = new URL(url);
      if (u.pathname === "/v1/accounts") {
        if (hooks.listStatus) return { ok: false, status: hooks.listStatus, json: async () => ({ message: hooks.listMessage || "list down" }) };
        return { ok: true, status: 200, json: async () => hooks.list };
      }
      if (hooks.detailStatus) return { ok: false, status: hooks.detailStatus, json: async () => ({ message: hooks.detailMessage || "detail down" }) };
      return { ok: true, status: 200, json: async () => hooks.detail || { account: {}, positions: [], activity: [] } };
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    readyState: "loading",
    body: { dataset: { page: "account" }, appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } },
    documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {} } },
    head: { appendChild() {} },
    addEventListener() {},
    createElement() { return node(); },
    querySelector: (sel) => store[sel] || node(),
    querySelectorAll: () => [],
    getElementById: (id) => store["#" + id] || node({ id })
  };
  vm.runInNewContext(fs.readFileSync(new URL("./api.js", import.meta.url), "utf8"), sandbox);
  sandbox.calls = calls;
  sandbox.h1 = h1;
  sandbox.big = big;
  sandbox.sub = sub;
  sandbox.kv = kv;
  sandbox.main = main;
  sandbox.posTable = posTable;
  sandbox.actTable = actTable;
  return sandbox;
}

const detail = {
  account: {
    strategy: "catsports20000",
    equity_usd: 20,
    capital_usd: 10,
    net_pnl_usd: 1,
    net_pct: 0.1,
    cash_usd: 3,
    positions_value_usd: 4,
    exposure_usd: 1,
    daily_realized_usd: 0,
    unrealized_usd: 0,
    realized_usd: 1,
    open_positions: 1,
    max_open_positions: 4,
    run_state_zh: "运行中"
  },
  positions: [],
  activity: []
};
const oldList = { accounts: [{ strategy: "catsports20000", name: "catsports20000" }] };

const rendered = loadAccount("", { list: oldList, detail });
await rendered.PM.renderAccount();
assert.equal(rendered.h1.textContent, "账户 · catsports20000");
assert.equal(rendered.big.innerHTML.includes("sk"), false);
assert.match(rendered.big.innerHTML, /\$20\.00/);
assert.ok(rendered.calls.some((url) => url.includes("/v1/accounts/catsports20000?range=24h")));
assert.equal(rendered.posTable.innerHTML.includes("sk"), false);
assert.equal(rendered.actTable.innerHTML.includes("sk"), false);

const named = loadAccount("?id=catsports20000", { list: oldList, detail });
await named.PM.renderAccount();
assert.equal(named.h1.textContent, "账户 · catsports20000");
assert.ok(named.calls.some((url) => url.includes("/v1/accounts/catsports20000?range=24h")));

const empty = loadAccount("", { list: { accounts: [] } });
await empty.PM.renderAccount();
assert.equal(empty.h1.textContent, "账户");
assert.match(empty.big.innerHTML, /title="no_accounts"/);
assert.equal(empty.sub.innerHTML, "");
assert.equal(empty.kv.innerHTML, "");
assert.equal(empty.posTable.innerHTML.includes("sk"), false);
assert.equal(empty.actTable.innerHTML.includes("sk"), false);

const listErr = loadAccount("", { listStatus: 500, listMessage: "list down" });
await listErr.PM.renderAccount();
assert.equal(listErr.h1.textContent, "账户");
assert.match(listErr.big.innerHTML, /list down/);
assert.match(listErr.sub.innerHTML, /id="ac-retry"/);
assert.equal(listErr.big.innerHTML.includes("sk"), false);
assert.equal(listErr.posTable.innerHTML.includes("sk"), false);
assert.equal(listErr.main.innerHTML.includes("找不到这个账户"), false);

const detailErr = loadAccount("", { list: oldList, detailStatus: 502, detailMessage: "detail down" });
await detailErr.PM.renderAccount();
assert.equal(detailErr.h1.textContent, "账户");
assert.match(detailErr.sub.innerHTML, /id="ac-retry"/);
assert.match(detailErr.big.innerHTML, /detail down/);
assert.equal(detailErr.kv.innerHTML, "");
assert.equal(detailErr.main.innerHTML.includes("找不到这个账户"), false);

const missing = loadAccount("?id=not-a-real-account", { list: oldList, detail });
await missing.PM.renderAccount();
assert.match(missing.main.innerHTML, /找不到这个账户/);
assert.equal(missing.calls.some((url) => url.includes("/v1/accounts/not-a-real-account")), false);

const uuidList = { accounts: [{ id: UUID, strategy: "catsports20000", name: "catsports20000" }] };
const byUuid = loadAccount("?id=" + UUID, { list: uuidList, detail });
await byUuid.PM.renderAccount();
assert.ok(byUuid.calls.some((url) => url.includes("/v1/accounts/" + UUID + "?range=24h")));

function loadSa(search) {
  const calls = [];
  const mount = node({ id: "sa-mount" });
  const main = node();
  main.prepend = (el) => { main.children.unshift(el); };
  const rewritten = [];
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Intl,
    Date,
    Map,
    Set,
    history: { replaceState(_s, _t, url) { rewritten.push(url); } },
    location: {
      search: search || "",
      pathname: "/account",
      origin: "https://app.example",
      href: "https://app.example/account" + (search || ""),
      hash: ""
    },
    sessionStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return "tok"; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    title: "",
    body: { dataset: { page: "account" } },
    documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
    head: { appendChild() {} },
    addEventListener() {},
    createElement() { return node(); },
    getElementById: (id) => (id === "sa-mount" ? mount : null),
    querySelector: (sel) => (sel === "main.main" ? main : null),
    querySelectorAll: () => []
  };
  sandbox.PM = {
    looksLikeAccountUuid(v) {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));
    },
    matchAccountUuid(label, rows) {
      const hits = (rows || []).filter((a) => a && (a.name === label || a.strategy === label));
      return hits.length === 1 ? hits[0].id : "";
    },
    replaceNamedAccountLocation() { return false; },
    api: async (path) => {
      calls.push(String(path));
      if (String(path).startsWith("/v1/accounts?")) {
        return { items: sandbox.rows || [], accounts: sandbox.rows || [], next_cursor: null };
      }
      if (String(path).startsWith("/v1/accounts/" + UUID)) {
        return { id: UUID, name: "catsports20000", state: "stopped", metrics: {} };
      }
      const err = new Error("missing");
      err.status = 404;
      err.body = { error: "account_not_found" };
      throw err;
    }
  };
  vm.runInNewContext(fs.readFileSync(new URL("./sa-core.js", import.meta.url), "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(new URL("./sa.js", import.meta.url), "utf8"), sandbox);
  sandbox.calls = calls;
  sandbox.mount = mount;
  sandbox.rewritten = rewritten;
  return sandbox;
}

const found = loadSa("?id=catsports20000");
found.rows = [{ id: UUID, name: "catsports20000", strategy: "catsports20000" }];
await found.PMSA_UI.openAccounts();
assert.ok(found.calls.some((path) => path.startsWith("/v1/accounts/" + UUID)));
assert.equal(found.calls.some((path) => path.includes("/v1/accounts/catsports20000")), false);
assert.equal(found.mount.innerHTML.includes("找不到这个账户"), false);
assert.equal(found.rewritten[0], "/account?id=" + UUID);

const absent = loadSa("?id=catsports20000");
absent.rows = [{ id: UUID, name: "other", strategy: "other" }];
await absent.PMSA_UI.openAccounts();
assert.match(absent.mount.innerHTML, /找不到这个账户/);
assert.match(absent.mount.innerHTML, /返回账户列表/);
assert.equal(absent.calls.some((path) => path.includes("/v1/accounts/" + UUID)), false);
assert.equal(absent.calls.some((path) => path.includes("/v1/accounts/catsports20000")), false);

console.log("account legacy tests ok");
