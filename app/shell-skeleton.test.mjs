import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".html")).sort();
const markets = ["Fed 12 月降息", "湖人", "BTC 周五", "阿森纳"];
const accounts = ["catsports20000", "paper20000", "fees20000", "catunknown20000"];

function visible(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

assert.ok(files.includes("overview.html"));
assert.ok(files.includes("account.html"));
assert.ok(files.includes("leader.html"));
assert.ok(files.includes("leader-5c1e.html"));

for (const name of files) {
  const html = fs.readFileSync(path.join(dir, name), "utf8");
  const body = visible(html);
  assert.equal(html.includes("TAP TO REMIX"), false, name + " TAP TO REMIX");
  assert.equal(html.includes("示意分配"), false, name + " 示意分配");
  for (const market of markets) assert.equal(body.includes(market), false, name + " " + market);
  for (const account of accounts) {
    assert.equal(html.includes(account), false, name + " " + account);
  }
  assert.equal(/\$\d/.test(body), false, name + " dollar");
  assert.equal(/\d¢/.test(body), false, name + " cents");
  assert.equal(/placeholder="(?:catsports20000|paper20000|fees20000)"/.test(html), false, name);
  assert.equal(/value="(?:catsports20000|paper20000|fees20000)"/.test(html), false, name);
}

const account = fs.readFileSync(path.join(dir, "account.html"), "utf8");
assert.match(account, /<h1>账户 <i class="sk m"/);
assert.equal(account.includes("找不到这个账户"), false);
assert.equal(visible(account).includes("40 个市场"), false);
assert.match(account, /请输入账户名以确认/);
assert.equal(/请手输「/.test(visible(account)), false);

const leader = fs.readFileSync(path.join(dir, "leader.html"), "utf8");
assert.match(leader, /id="ld-idl"/);
assert.match(leader, /class="sk"/);
const overviewHtml = fs.readFileSync(path.join(dir, "overview.html"), "utf8");
assert.match(overviewHtml, /id="ov-range"/);
assert.match(overviewHtml, /id="ov-eq"/);
assert.equal(overviewHtml.includes("利润归属"), false);
assert.equal(overviewHtml.includes('id="ov-attr"'), false);
const mirrorRows = overviewHtml.split('id="ov-mirrors"')[1].split("<section")[0];
for (const cell of mirrorRows.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []) {
  const text = cell.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (/^市场$/.test(text)) assert.fail("mirror cell is bare 市场");
}
const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
assert.match(css, /#ov-mirrors td,#ov-mirrors th,#ov-mirrors \.na\{white-space:nowrap\}/);
