import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const UUID = "6f1c0c3e-1b7a-4c2d-9a10-aabbccddeeff";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const UUID_C = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const ADDR = "0x68c24bf4a8ad4d79a6fe4b8eec6f93a02dfd1711";

function node() {
  return {
    innerHTML: "",
    textContent: "",
    hidden: false,
    title: "",
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    getAttribute() { return ""; },
    addEventListener() {},
    remove() {},
    prepend() {},
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function loadLeaders(search, route) {
  const store = {};
  function ensure(sel) {
    if (!store[sel]) store[sel] = node();
    return store[sel];
  }
  const calls = [];
  const mem = {};
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Intl,
    Date,
    history: { replaceState() {} },
    location: {
      search: search || "",
      pathname: "/leaders",
      origin: "https://app.example",
      href: "https://app.example/leaders" + (search || ""),
      hash: "",
      host: "app.example",
      replace() {}
    },
    localStorage: { getItem() { return "tok"; }, setItem() {}, removeItem() {} },
    sessionStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem(k, v) { mem[k] = String(v); },
      removeItem(k) { delete mem[k]; }
    },
    fetch: async (url, init) => {
      const method = (init && init.method) || "GET";
      const u = new URL(url);
      calls.push(method + " " + u.pathname + u.search);
      const body = await route(u, method);
      if (body && body.__status) return { ok: false, status: body.__status, json: async () => body };
      return { ok: true, status: 200, json: async () => body };
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    readyState: "loading",
    body: { dataset: { page: "leaders" } },
    documentElement: { style: {}, classList: { add() {}, toggle() {} } },
    addEventListener() {},
    createElement() { return node(); },
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

function leadersUrls(calls) {
  return calls.filter((c) => c.includes("/leaders"));
}
function pathOf(call) {
  return new URL(call.replace(/^[A-Z]+ /, ""), "https://api.wakeloom.com").pathname;
}
function catalogRoute({ bare, catalog, catalogStatus }) {
  const leadersBody = {
    active: [{ address: ADDR, user_name: "luna", status: "following" }],
    total: 40,
    next_cursor: "n",
    as_of: "2026-10-23T00:00:00Z"
  };
  return (u, method) => {
    if (u.pathname === "/v1/accounts" && u.searchParams.get("limit") === "100") {
      if (catalogStatus) return { __status: catalogStatus, message: "missing" };
      return { items: catalog || [], next_cursor: null };
    }
    if (u.pathname === "/v1/accounts" && !u.search) return { accounts: bare || [] };
    if (u.pathname.includes("/leaders")) {
      if (method === "GET") return leadersBody;
      return { ok: true };
    }
    if (u.pathname === "/v1/overview") return { main_leader: null };
    return { __status: 404, message: "missing" };
  };
}

const bareNamed = [{ strategy: "catsports20000" }, { strategy: "mockpaper" }];
const catalog = [
  { id: UUID, strategy: "catsports20000", name: "catsports20000" },
  { id: UUID_B, strategy: "mockpaper", name: "mockpaper" }
];

const pm = loadLeaders("");
const PM = pm.PM;
assert.equal(PM.leadersReadPath(UUID), "/v1/accounts/" + UUID + "/leaders?window=90d");
assert.equal(PM.leadersWritePath(UUID, ADDR), "/v1/accounts/" + UUID + "/leaders/" + encodeURIComponent(ADDR));
assert.equal(await PM.leadersRequestKey([{ id: UUID, strategy: "catsports20000" }], "catsports20000"), UUID);
assert.equal(pm.calls.length, 0);
assert.equal(await PM.leadersRequestKey([{ account_id: UUID, strategy: "catsports20000" }], "catsports20000"), UUID);
assert.equal(await PM.leadersRequestKey([], ""), "");

const named = loadLeaders("", catalogRoute({ bare: bareNamed, catalog }));
assert.equal(await named.PM.leadersRequestKey(bareNamed, "catsports20000"), UUID);
assert.ok(named.calls.some((c) => c.includes("/v1/accounts?limit=100&archived=false")));
assert.equal(await named.PM.leadersRequestKey(bareNamed, "mockpaper"), UUID_B);

const ambiguous = loadLeaders("", catalogRoute({
  bare: [{ strategy: "catsports20000" }, { strategy: "catsports20000" }],
  catalog: [
    { id: UUID, strategy: "catsports20000", name: "catsports20000" },
    { id: UUID_C, strategy: "catsports20000", name: "catsports20000" }
  ]
}));
assert.equal(await ambiguous.PM.leadersRequestKey(
  [{ strategy: "catsports20000" }, { strategy: "catsports20000" }],
  "catsports20000"
), "catsports20000");

/* 打开 /leaders：列表只有策略名，目录里有 uuid。请求路径必须是 uuid，筛选链接仍是 ?s=。 */
const open = loadLeaders("", catalogRoute({ bare: bareNamed, catalog }));
open.PMSA = {
  hasCursorPage(d) { return !!(d && Object.prototype.hasOwnProperty.call(d, "next_cursor")); },
  pagerOnHttpError() { return null; },
  pagerInit() { return {}; }
};
let cursorOpts = null;
open.PMSA_UI = { mountCursor(opts) { cursorOpts = opts; } };
assert.equal(await open.PM.renderLeaders(), "live");
const read = leadersUrls(open.calls).find((c) => c.startsWith("GET "));
assert.equal(pathOf(read), "/v1/accounts/" + UUID + "/leaders");
assert.equal(read.includes("window=90d"), true);
assert.equal(pathOf(read).includes("catsports20000"), false);
assert.equal(pathOf(read).includes("mockpaper"), false);
assert.equal(open.PM.leadersCurrentKey(), UUID);
assert.match(open.store["#ld-rows"].innerHTML, new RegExp(ADDR));
assert.match(open.store["#ld-count"].textContent, /在跟/);
const steps = open.store["#ld-steps"].innerHTML;
assert.match(steps, /href="\/leaders\?s=catsports20000"/);
assert.match(steps, /href="\/leaders\?s=mockpaper"/);
assert.equal(steps.includes(UUID), false);
assert.equal(steps.includes(UUID_B), false);
assert.ok(cursorOpts);
open.calls.length = 0;
await cursorOpts.load("n", 20);
const paged = leadersUrls(open.calls).find((c) => c.startsWith("GET "));
assert.equal(pathOf(paged), "/v1/accounts/" + UUID + "/leaders");
assert.match(paged, /limit=20/);
assert.match(paged, /cursor=n/);
assert.equal(paged.includes("catsports20000"), false);

open.calls.length = 0;
await open.PM.writeLeader("POST", ADDR);
const post = open.calls.find((c) => c.startsWith("POST "));
assert.equal(pathOf(post), "/v1/accounts/" + UUID + "/leaders");
assert.equal(post.includes("catsports20000"), false);
const reread = open.calls.filter((c) => c.startsWith("GET ") && c.includes("/leaders"));
assert.equal(reread.length, 1);
assert.equal(pathOf(reread[0]), "/v1/accounts/" + UUID + "/leaders");

open.calls.length = 0;
await open.PM.writeLeader("DELETE", ADDR);
const del = open.calls.find((c) => c.startsWith("DELETE "));
assert.equal(pathOf(del), "/v1/accounts/" + UUID + "/leaders/" + ADDR);

/* ?s= 仍筛选策略，但路径用该策略对应的 uuid，不是另一个账户，也不是策略名。 */
const filtered = loadLeaders("?s=mockpaper", catalogRoute({ bare: bareNamed, catalog }));
assert.equal(await filtered.PM.renderLeaders(), "live");
const filteredRead = leadersUrls(filtered.calls).find((c) => c.startsWith("GET "));
assert.equal(pathOf(filteredRead), "/v1/accounts/" + UUID_B + "/leaders");
assert.equal(filtered.PM.leadersCurrentKey(), UUID_B);
const filteredSteps = filtered.store["#ld-steps"].innerHTML;
assert.match(filteredSteps, /href="\/leaders\?s=mockpaper"/);
assert.match(filteredSteps, /<span class="on">mockpaper<\/span>/);
assert.equal(filteredSteps.includes(UUID_B), false);

/* 行上已经带 uuid 时直接用，不再为了对名去打目录。 */
const onRow = loadLeaders("", catalogRoute({
  bare: [{ id: UUID, strategy: "catsports20000" }, { account_id: UUID_B, strategy: "mockpaper" }],
  catalog: []
}));
assert.equal(await onRow.PM.renderLeaders(), "live");
assert.equal(pathOf(leadersUrls(onRow.calls).find((c) => c.startsWith("GET "))), "/v1/accounts/" + UUID + "/leaders");
assert.equal(onRow.calls.some((c) => c.includes("limit=100")), false);

/* 目录也没有 uuid：退回策略名，列表仍能画出来。 */
const noUuid = loadLeaders("", catalogRoute({
  bare: bareNamed,
  catalog: [{ strategy: "catsports20000", name: "catsports20000" }, { id: "mockpaper", strategy: "mockpaper", name: "mockpaper" }]
}));
assert.equal(await noUuid.PM.renderLeaders(), "live");
assert.equal(pathOf(leadersUrls(noUuid.calls).find((c) => c.startsWith("GET "))), "/v1/accounts/catsports20000/leaders");
assert.match(noUuid.store["#ld-rows"].innerHTML, new RegExp(ADDR));

/* 目录接口失败也不要把整页打崩，仍按策略名读。 */
const catalogDown = loadLeaders("", catalogRoute({ bare: bareNamed, catalogStatus: 404 }));
assert.equal(await catalogDown.PM.renderLeaders(), "live");
assert.equal(pathOf(leadersUrls(catalogDown.calls).find((c) => c.startsWith("GET "))), "/v1/accounts/catsports20000/leaders");

/* 没有策略实例：空态，不请求 leaders。 */
const empty = loadLeaders("", catalogRoute({ bare: [] }));
assert.equal(await empty.PM.renderLeaders(), "error");
assert.equal(leadersUrls(empty.calls).length, 0);
assert.match(empty.store["#ld-empty-msg"].textContent, /还没有策略实例/);

const nullList = loadLeaders("", (u) => {
  if (u.pathname === "/v1/accounts" && !u.search) return null;
  return { __status: 404, message: "missing" };
});
assert.equal(await nullList.PM.renderLeaders(), "error");
assert.equal(leadersUrls(nullList.calls).length, 0);

/* ?s=null 不能当成策略名去请求。 */
const bogus = loadLeaders("?s=null", catalogRoute({
  bare: [{ id: UUID, strategy: "catsports20000" }]
}));
assert.equal(await bogus.PM.renderLeaders(), "live");
assert.equal(pathOf(leadersUrls(bogus.calls).find((c) => c.startsWith("GET "))), "/v1/accounts/" + UUID + "/leaders");

/* fixture 仍按 ?s= 分桶，不打 BFF leaders。 */
const fx = loadLeaders("?fixture=1&s=paper", () => ({ __status: 500, message: "no" }));
assert.equal(await fx.PM.renderLeaders(), "fixture");
assert.equal(fx.calls.length, 0);
assert.match(fx.store["#ld-steps"].innerHTML, /s=paper/);
assert.match(fx.store["#ld-rows"].innerHTML, new RegExp(ADDR));

const apiSrc = fs.readFileSync(new URL("./api.js", import.meta.url), "utf8");
assert.match(apiSrc, /leadersReadPath\(leadersCurrentKey\(\)\)/);
assert.match(apiSrc, /leadersWritePath\(key/);
assert.match(apiSrc, /appHref\("\/leaders",\{s:/);
assert.equal(apiSrc.includes("leadersReadPath(ldStrategy)"), false);
assert.equal(apiSrc.includes("leadersWritePath(ldStrategy"), false);

console.log("leaders-path tests ok");
