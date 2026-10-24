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
await account.sandbox.PM.renderAccount();
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

console.log("load-error tests ok");
