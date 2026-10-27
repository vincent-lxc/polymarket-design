import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function cls() {
  const set = new Set();
  return {
    add(...xs) { xs.forEach((x) => set.add(x)); },
    remove(...xs) { xs.forEach((x) => set.delete(x)); },
    contains(x) { return set.has(x); },
    toggle(name, on) {
      if (on) set.add(name);
      else set.delete(name);
    }
  };
}

function node() {
  const el = {
    id: "",
    className: "",
    hidden: false,
    dataset: {},
    style: {},
    children: [],
    parent: null,
    attributes: {},
    classList: null,
    _html: "",
    _text: "",
    _ev: {},
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === "id") this.id = String(v); },
    getAttribute(k) { return this.attributes[k] || ""; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(ch) { ch.parent = this; this.children.push(ch); },
    prepend(ch) { ch.parent = this; this.children.unshift(ch); },
    remove() {
      if (!this.parent) return;
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    },
    addEventListener(type, fn) { this._ev[type] = fn; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  el.classList = cls();
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; },
    set(v) {
      el._html = String(v ?? "");
      el._text = el._html.replace(/<[^>]+>/g, "");
      const ids = [...el._html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      for (const id of ids) {
        const child = node();
        child.id = id;
        el.appendChild(child);
      }
    }
  });
  Object.defineProperty(el, "textContent", {
    get() { return el._text; },
    set(v) { el._text = String(v ?? ""); el._html = el._text; }
  });
  return el;
}

function walk(el) {
  if (!el) return [];
  return [el].concat((el.children || []).flatMap(walk));
}

function load(page, search, fetchImpl) {
  const main = node();
  main.className = "main";
  const root = node();
  root.classList.add("pending-leader");
  const body = node();
  body.dataset.page = page;
  const boots = [];
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Intl,
    Date,
    history: { replaceState() {} },
    location: {
      search: search || "",
      pathname: "/" + page,
      origin: "https://app.example",
      href: "https://app.example/" + page + (search || ""),
      hash: "",
      host: "app.example",
      replace() {}
    },
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: fetchImpl,
    innerWidth: 1280,
    addEventListener() {},
    matchMedia() { return { matches: false, addEventListener() {} }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    readyState: "loading",
    title: "",
    body,
    documentElement: root,
    head: node(),
    addEventListener(type, fn) { if (type === "DOMContentLoaded") boots.push(fn); },
    createElement() { return node(); },
    querySelector(sel) {
      if (sel === ".main" || sel === "main.main") return main;
      if (sel === ".top") return null;
      return null;
    },
    querySelectorAll() { return []; },
    getElementById(id) {
      return walk(main).find((el) => el.id === id) || null;
    }
  };
  vm.runInNewContext(fs.readFileSync(new URL("./api.js", import.meta.url), "utf8"), sandbox);
  return { sandbox, main, root, body, boots };
}

const css = fs.readFileSync(new URL("./app.css", import.meta.url), "utf8");
assert.match(css, /html\.leader-failed \.sk\{animation:none!important\}/);
assert.match(css, /html\.leader-failed \.ld-curve,html\.leader-failed \.ld-curve-skel\{display:none!important\}/);
assert.match(css, /html\.leader-failed #ld-perf \.kv \.sk/);

async function leaderFail(status, body, offline) {
  let calls = 0;
  const fetched = load("leader", "?addr=0xabc", async () => {
    calls += 1;
    if (offline) throw new Error("failed to fetch");
    return { ok: false, status, json: async () => body || {} };
  });
  assert.equal(fetched.boots.length, 1);
  await fetched.boots[0]();
  const bar = fetched.main.children.find((el) => el.id === "ld-fail");
  assert.ok(bar, "顶部错误行");
  assert.match(bar.innerHTML, /暂时连不上，稍后再试/);
  assert.match(bar.innerHTML, /id="ld-retry"/);
  assert.match(bar.innerHTML, />重试</);
  assert.equal(/sql exploded|HTTP 500|failed to fetch/.test(bar.innerHTML), false);
  assert.equal(fetched.root.classList.contains("leader-failed"), true);
  assert.equal(fetched.root.classList.contains("pending-leader"), false);
  assert.equal(fetched.body.classList.contains("live"), false);
  assert.equal(walk(fetched.body).some((el) => el.className === "live-badge"), false);
  assert.equal(calls, 1);
  const retry = fetched.sandbox.document.getElementById("ld-retry");
  assert.equal(typeof retry._ev.click, "function");
  retry._ev.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  assert.match(fetched.main.children.find((el) => el.id === "ld-fail").innerHTML, /暂时连不上，稍后再试/);
  assert.equal(fetched.body.classList.contains("live"), false);
}

await leaderFail(500, { message: "sql exploded" }, false);
await leaderFail(0, null, true);

const authed = load("leader", "?addr=0xabc", async () => ({ ok: false, status: 500, json: async () => ({ message: "db down" }) }));
authed.sandbox.localStorage.getItem = () => "tok";
await authed.boots[0]();
const authedBar = authed.main.children.find((el) => el.id === "ld-fail");
assert.match(authedBar.innerHTML, /暂时连不上，稍后再试/);
assert.equal(authedBar.innerHTML.includes("db down"), false);
assert.equal(authed.root.classList.contains("leader-failed"), true);
assert.equal(authed.body.classList.contains("live"), false);

const skel = node();
skel.id = "ac-list-skel";
skel.classList.add("sa");
skel._html = '<div class="top"><h1>账户</h1><span class="mu">加载中</span></div>';
const account = load("account", "", async () => ({ ok: false, status: 500, json: async () => ({ message: "list down" }) }));
account.sandbox.document.getElementById = (id) => (id === "ac-list-skel" ? skel : walk(skel).find((el) => el.id === id) || null);
assert.equal(await account.sandbox.PM.renderAccount(), "error");
assert.match(skel.innerHTML, /连不上接口/);
assert.match(skel.innerHTML, /id="ac-list-retry"/);
assert.equal(skel.innerHTML.includes("list down"), false);
assert.equal(skel.innerHTML.includes("HTTP 500"), false);

const offlineAccount = load("account", "", async () => { throw new Error("failed to fetch"); });
const skelOff = node();
skelOff.id = "ac-list-skel";
skelOff.classList.add("sa");
offlineAccount.sandbox.document.getElementById = (id) => (id === "ac-list-skel" ? skelOff : walk(skelOff).find((el) => el.id === id) || null);
await offlineAccount.sandbox.PM.renderAccount();
assert.match(skelOff.innerHTML, /连不上接口/);
assert.match(skelOff.innerHTML, /id="ac-list-retry"/);
assert.equal(skel.innerHTML.replace(/<button[\s\S]*$/, ""), skelOff.innerHTML.replace(/<button[\s\S]*$/, ""));

function armSession(box, tokenValue) {
  const store = { pm_bff_token: tokenValue || "" };
  let cleared = false;
  let replaced = false;
  box.sandbox.localStorage.getItem = (k) => (k === "pm_bff_token" ? (store.pm_bff_token || "") : "");
  box.sandbox.localStorage.setItem = (k, v) => { store[k] = String(v); };
  box.sandbox.localStorage.removeItem = (k) => { if (k === "pm_bff_token") { cleared = true; store.pm_bff_token = ""; } };
  box.sandbox.location.replace = () => { replaced = true; };
  return {
    store,
    replaced: () => replaced,
    cleared: () => cleared
  };
}

function expiredBar(main) {
  return walk(main).find((el) => el.id === "auth-expired") || null;
}

const health = load("health", "", async () => ({ ok: false, status: 401, json: async () => ({ message: "token rejected raw" }) }));
const healthTok = armSession(health, "tok-health");
const kept = node();
kept.id = "kept-row";
kept.textContent = "已显示的净值";
health.main.appendChild(kept);
await assert.rejects(() => health.sandbox.PM.api("/v1/health"), (e) => e && e.status === 401);
const healthBar = expiredBar(health.main);
assert.ok(healthBar, "各页共用的失效提示");
assert.match(healthBar.innerHTML, /登录已失效，请重新登录/);
assert.match(healthBar.innerHTML, /id="auth-relogin"/);
assert.match(healthBar.innerHTML, />重新登录</);
assert.match(healthBar.innerHTML, /href="\/login\?next=/);
assert.equal(healthBar.innerHTML.includes("token rejected raw"), false);
assert.equal(healthTok.store.pm_bff_token, "tok-health");
assert.equal(healthTok.cleared(), false);
assert.equal(healthTok.replaced(), false);
assert.equal(health.root.style.display, undefined);
assert.equal(kept.textContent, "已显示的净值");
assert.equal(walk(health.main).filter((el) => el.id === "auth-expired").length, 1);
await assert.rejects(() => health.sandbox.PM.api("/v1/overview"), (e) => e && e.status === 401);
assert.equal(walk(health.main).filter((el) => el.id === "auth-expired").length, 1);

const anon = load("overview", "", async () => ({ ok: false, status: 401, json: async () => ({ message: "no" }) }));
await assert.rejects(() => anon.sandbox.PM.api("/v1/overview"), (e) => e && e.status === 401);
assert.equal(expiredBar(anon.main), null);

const logout = load("config", "", async () => ({ ok: false, status: 401, json: async () => ({}) }));
armSession(logout, "tok-out");
await assert.rejects(() => logout.sandbox.PM.api("/v1/auth/logout", { method: "POST" }), (e) => e && e.status === 401);
assert.equal(expiredBar(logout.main), null, "登出接口的 401 不当成会话失效条");

const leader401 = load("leader", "?addr=0xabc", async () => ({ ok: false, status: 401, json: async () => ({ message: "expired bearer" }) }));
const leaderTok = armSession(leader401, "tok-leader");
const shown = node();
shown.id = "shown-trade";
shown.textContent = "已显示的成交";
leader401.main.appendChild(shown);
await leader401.boots[0]();
const leaderBar = expiredBar(leader401.main);
assert.ok(leaderBar);
assert.match(leaderBar.innerHTML, /登录已失效，请重新登录/);
assert.match(leaderBar.innerHTML, /重新登录/);
assert.equal(leaderBar.innerHTML.includes("expired bearer"), false);
assert.equal(leaderBar.innerHTML.includes("需登录"), false);
assert.equal(shown.textContent, "已显示的成交");
assert.equal(leaderTok.store.pm_bff_token, "tok-leader");
assert.equal(leaderTok.cleared(), false);
assert.equal(leaderTok.replaced(), false);
assert.equal(leader401.body.classList.contains("live"), false);
assert.equal(walk(leader401.main).some((el) => el.id === "ld-fail"), false);

const overview401 = load("overview", "", async () => ({ ok: false, status: 401, json: async () => ({ message: "overview down raw" }) }));
const ovTok = armSession(overview401, "tok-ov");
await overview401.boots[0]();
const ovBar = expiredBar(overview401.main);
assert.ok(ovBar, "总览同样出失效提示");
assert.match(ovBar.innerHTML, /登录已失效，请重新登录/);
assert.equal(ovBar.innerHTML.includes("overview down raw"), false);
assert.equal(ovTok.cleared(), false);
assert.equal(ovTok.replaced(), false);
assert.equal(overview401.body.classList.contains("live"), false);
assert.equal(overview401.root.style.display, undefined);

async function accountListBoot(fetchImpl) {
  const skelBoot = node();
  skelBoot.id = "ac-list-skel";
  skelBoot.classList.add("sa");
  skelBoot._html = '<div class="top"><h1>账户</h1><span class="mu">加载中</span></div>';
  const box = load("account", "", fetchImpl);
  armSession(box, "tok-ac-list");
  box.sandbox.document.getElementById = (id) => {
    if (id === "ac-list-skel") return skelBoot;
    return walk(skelBoot).find((el) => el.id === id) || walk(box.main).find((el) => el.id === id) || walk(box.body).find((el) => el.id === id) || null;
  };
  await box.boots[0]();
  assert.match(skelBoot.innerHTML, /连不上接口/);
  assert.equal(box.body.classList.contains("live"), false);
  assert.equal(walk(box.body).concat(walk(box.main), walk(skelBoot)).some((el) => el.className === "live-badge" || el.textContent === "数据更新中"), false);
}

await accountListBoot(async () => ({ ok: false, status: 500, json: async () => ({ message: "list down" }) }));
await accountListBoot(async () => { throw new Error("failed to fetch"); });

const account401 = load("account", "", async () => ({ ok: false, status: 401, json: async () => ({ message: "account raw" }) }));
const acTok = armSession(account401, "tok-ac");
const skel401 = node();
skel401.id = "ac-list-skel";
skel401.classList.add("sa");
skel401._html = '<div class="top"><h1>账户</h1><span class="mu">已显示的列表</span></div>';
skel401._text = "已显示的列表";
account401.sandbox.document.getElementById = (id) => (id === "ac-list-skel" ? skel401 : walk(skel401).find((el) => el.id === id) || walk(account401.main).find((el) => el.id === id) || null);
await account401.sandbox.PM.renderAccount();
assert.match(skel401.innerHTML, /已显示的列表/);
assert.equal(skel401.innerHTML.includes("连不上接口"), false);
assert.equal(skel401.innerHTML.includes("account raw"), false);
const acBar = expiredBar(account401.main);
assert.ok(acBar);
assert.match(acBar.innerHTML, /登录已失效，请重新登录/);
assert.equal(acTok.cleared(), false);
assert.equal(acTok.replaced(), false);

console.log("load-error tests ok");
