import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const pages = ["leader.html", "leader-5c1e.html", "leader-91d4.html", "leader-avalon.html", "leader-lunadegen.html"];
const demoNames = ["湖人", "勇士", "catsports20000", "paper20000", "fees20000", "catunknown20000", "Fed 12 月降息", "BTC 周五", "阿森纳"];

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertLeaderShell(name, html) {
  const text = visibleText(html);
  assert.equal(/\$\d/.test(text), false, name + " 可见文本出现 $ 金额");
  assert.equal(/\d¢/.test(text), false, name + " 可见文本出现分");
  assert.equal(/\d+(?:\.\d+)?%/.test(text), false, name + " 可见文本出现百分数");
  assert.equal(/评分\s*\d/.test(text), false, name + " 可见文本出现样例评分");
  assert.equal(/胜率（90 天）\s*\d/.test(text), false, name + " 可见文本出现样例胜率");
  assert.equal(/100\s*\/\s*100|40\s*\/\s*200|12\s*\/\s*200/.test(text), false, name + " 占用比");
  for (const sample of demoNames) assert.equal(text.includes(sample), false, name + " " + sample);
  assert.equal(/class="av[^"]*\bor\b/.test(html), false, name + " 橙色头像");
  assert.equal(/class="av"[^>]*>\s*[A-Za-z]/.test(html), false, name + " 头像字母");
  assert.match(html, /id="pc"/, name + " 价格卡");
  if (name === "leader.html") assert.match(html, /id="pc-sides"/, name + " 单行市场切换");
  assert.match(html, /加载中/, name);
  if (name !== "leader-91d4.html") {
    assert.match(html, /"v":\[\]/, name + " 曲线序列应为空");
    assert.match(html, /points=""/, name + " 曲线折线应为空");
    assert.match(html, /data-empty="1"/, name);
    assert.match(html, /ld-curve-skel/, name);
  }
}

const server = http.createServer((req, res) => {
  const name = path.basename(new URL(req.url, "http://127.0.0.1").pathname);
  const allow = new Set([...pages, "account.html", "app.css"]);
  if (!allow.has(name)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const type = name.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
  res.writeHead(200, { "content-type": type });
  res.end(fs.readFileSync(path.join(dir, name)));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
try {
  for (const name of pages) {
    const res = await fetch(base + "/" + name);
    assert.equal(res.status, 200, name);
    assertLeaderShell(name, await res.text());
  }

  const account = await (await fetch(base + "/account.html")).text();
  const list = account.split('id="ac-list-skel"')[1].split('id="ac-legacy"')[0];
  const listText = visibleText(list);
  assert.match(list, /aria-busy="true"/);
  assert.match(list, /加载中/);
  assert.match(list, /class="sa-acard"/);
  assert.match(list, /class="sk l"/);
  assert.equal(/\$\d/.test(listText), false, "账户列表骨架出现金额");
  assert.equal(/\d¢/.test(listText), false, "账户列表骨架出现分");
  for (const sample of [...demoNames, "主力", "对照"]) {
    assert.equal(list.includes(sample), false, "列表壳 " + sample);
    assert.equal(account.includes(sample), false, "account.html " + sample);
  }
  assert.match(account, /id="ac-legacy" hidden/);
  assert.match(account, /html:not\(\.account-detail\) #ac-legacy\{display:none!important\}/);
  assert.match(account, /<h1>账户 <i class="sk m"/);

  const css = await (await fetch(base + "/app.css")).text();
  assert.match(css, /html:not\(\.account-detail\) #ac-legacy\{display:none!important\}/);
  assert.match(css, /html\.account-detail #ac-legacy\{display:block!important\}/);
  assert.match(css, /html\.account-detail #ac-list-skel\{display:none!important\}/);

  const sa = fs.readFileSync(path.join(dir, "sa.js"), "utf8");
  const fn = sa.slice(sa.indexOf("function listSkeletonHtml"), sa.indexOf("async function openAccounts"));
  assert.ok(fn.includes("function listSkeletonHtml"));
  assert.match(fn, /加载中/);
  assert.match(fn, /class=\\"sk/);
  assert.equal(/\$\d|catsports|湖人|paper20000|fees20000/.test(fn), false, "列表二次加载骨架");
  assert.match(sa, /mount\.innerHTML = listSkeletonHtml\(\)/);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("leader-shell tests ok");
