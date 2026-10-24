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
assert.match(fs.readFileSync(path.join(dir, "overview.html"), "utf8"), /id="ov-range"/);
assert.match(fs.readFileSync(path.join(dir, "overview.html"), "utf8"), /id="ov-eq"/);
