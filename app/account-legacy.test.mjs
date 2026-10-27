import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const UUID = "6f1c0c3e-1b7a-4c2d-9a10-aabbccddeeff";

function node(extra) {
  let html = "";
  let text = "";
  const el = {
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
  Object.defineProperty(el, "innerHTML", {
    get() { return html; },
    set(v) { html = String(v ?? ""); text = html.replace(/<[^>]+>/g, ""); }
  });
  Object.defineProperty(el, "textContent", {
    get() { return text; },
    set(v) { text = String(v ?? ""); html = text; }
  });
  return Object.assign(el, extra || {});
}

function skCount(parts) {
  return parts.reduce((n, html) => n + ((String(html || "").match(/class="sk/g) || []).length), 0);
}

function loadAccount(search, hooks) {
  hooks = hooks || {};
  const calls = [];
  const h1 = node();
  h1.innerHTML = '账户 <i class="sk m"></i>';
  const big = node();
  big.innerHTML = '<i class="sk xl"></i>';
  const sub = node();
  sub.innerHTML = '<i class="sk l"></i>';
  const kv = node();
  kv.innerHTML = '<div><i class="sk"></i></div>';
  const loss = node({ id: "ac-loss" });
  loss.innerHTML = '<span class="num"><i class="sk"></i> / <i class="sk"></i></span><div class="meter"><i style="width:42%"></i></div>';
  const main = node();
  main.querySelector = (sel) => {
    if (String(main.innerHTML).includes("找不到这个账户")) return null;
    if (sel === ".big") return big;
    if (sel === ".sub") return sub;
    if (sel === ".kv") return kv;
    if (sel === ".hd") return node();
    if (sel === "#ac-loss") return loss;
    return null;
  };
  const posTable = node();
  posTable.innerHTML = '<tr><th>市场</th></tr><tr><td><i class="sk l"></i></td></tr>';
  const actTable = node();
  actTable.innerHTML = '<tr><th>时间</th></tr><tr><td><i class="sk"></i></td></tr>';
  const posLab = node();
  posLab.innerHTML = '<i class="sk"></i>';
  const actLab = node();
  actLab.innerHTML = '<i class="sk"></i>';
  const actHd = node();
  actHd.querySelector = (sel) => (sel === ".lbl" ? actLab : null);
  Object.defineProperty(actHd, "outerHTML", {
    get() { return `<div class="hd"><h2>成交与拒单</h2><span class="lbl">${actLab.innerHTML}</span></div>`; }
  });
  const pos = node();
  pos.querySelector = (sel) => (sel === "table" ? posTable : sel === ".hd .lbl" ? posLab : null);
  const act = node();
  act.querySelector = (sel) => {
    if (sel === "table") return actTable;
    if (sel === ".hd") return actHd;
    if (sel === ".hd .lbl") return actLab;
    return null;
  };
  const params = node({ id: "ac-params" });
  params.innerHTML = '跟单比例 <i class="sk"></i> · 单笔 <i class="sk"></i>';
  const rail = node();
  rail.innerHTML = '<li><i class="sk"></i> 持仓已满</li>';
  const steps = node();
  steps.innerHTML = '<span><i class="sk"></i></span>';
  const run = node({ id: "ac-run", hidden: true });
  const state = node({ id: "ac-state", hidden: true });
  const pool = [h1, big, sub, kv, main, loss, pos, act, posTable, actTable, posLab, actLab, params, steps, rail];
  function liveSk() {
    const found = [];
    for (const owner of pool) {
      const chunks = String(owner.innerHTML || "").match(/<i\b[^>]*class="sk[^"]*"[^>]*>\s*<\/i>/g) || [];
      for (const chunk of chunks) {
        found.push({
          remove() { owner.innerHTML = owner.innerHTML.replace(chunk, ""); }
        });
      }
    }
    return found;
  }
  function liveMeters() {
    if (!String(loss.innerHTML).includes('class="meter"')) return [];
    return [{ remove() { loss.innerHTML = loss.innerHTML.replace(/<div class="meter">[\s\S]*?<\/div>/g, ""); } }];
  }
  const store = {
    ".top h1": h1,
    "#ac-main": main,
    "#ac-main .big": big,
    "#ac-main .sub": sub,
    "#ac-main .kv": kv,
    "#ac-loss": loss,
    "#ac-pos": pos,
    "#ac-act": act,
    "#ac-pos .hd .lbl": posLab,
    "#ac-act .hd .lbl": actLab,
    "#ac-params": params,
    ".rail": rail,
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
    querySelector: (sel) => store[sel] || null,
    querySelectorAll: (sel) => {
      if (sel === ".sk") return liveSk();
      if (sel === "#ac-loss .meter, #ac-main .meter") return liveMeters();
      return [];
    },
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
  sandbox.loss = loss;
  sandbox.params = params;
  sandbox.posLab = posLab;
  sandbox.actLab = actLab;
  sandbox.rail = rail;
  sandbox.steps = steps;
  sandbox.pos = pos;
  sandbox.act = act;
  sandbox.sk = () => skCount([
    h1.innerHTML, big.innerHTML, sub.innerHTML, kv.innerHTML, main.innerHTML,
    loss.innerHTML, pos.innerHTML, act.innerHTML, posTable.innerHTML, actTable.innerHTML,
    posLab.innerHTML, actLab.innerHTML, params.innerHTML, steps.innerHTML, rail.innerHTML
  ]);
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
assert.equal(rendered.loss.innerHTML.includes("sk"), false);
assert.equal(rendered.loss.innerHTML.includes("meter"), false);
assert.equal(rendered.actLab.innerHTML.includes("sk"), false);
assert.equal(rendered.params.innerHTML.includes("sk"), false);
assert.equal(rendered.rail.innerHTML.includes("sk"), false);
assert.equal(rendered.sk(), 0);

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
assert.equal(empty.loss.innerHTML.includes("sk"), false);
assert.equal(empty.loss.innerHTML.includes("meter"), false);
assert.equal(empty.actLab.innerHTML.includes("sk"), false);
assert.equal(empty.sk(), 0);

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
assert.equal(missing.pos.innerHTML.includes("sk"), false);
assert.equal(missing.act.innerHTML.includes("sk"), false);
assert.equal(missing.posTable.innerHTML.includes("sk"), false);
assert.equal(missing.actTable.innerHTML.includes("sk"), false);
assert.equal(missing.params.innerHTML.includes("sk"), false);
assert.equal(missing.loss.innerHTML.includes("sk"), false);
assert.equal(missing.actLab.innerHTML.includes("sk"), false);
assert.equal(missing.sk(), 0);

const quiet = loadAccount("", {
  list: oldList,
  detail: { account: detail.account, positions: [{ title: "Alpha", outcome: "Yes", shares: 2, avg_price: 0.4, last_mark: 0.5, unrealized_usd: 1 }] }
});
await quiet.PM.renderAccount();
assert.match(quiet.act.innerHTML, /暂未汇总/);
assert.equal(quiet.act.innerHTML.includes("sk"), false);
assert.equal(quiet.actLab.innerHTML.includes("sk"), false);
assert.equal(quiet.actTable.innerHTML.includes("sk"), false);
assert.equal(quiet.sk(), 0);

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
