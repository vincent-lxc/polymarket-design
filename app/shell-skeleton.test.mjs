import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".html")).sort();
const markets = ["Fed 12 月降息", "湖人", "BTC 周五", "阿森纳"];
const accounts = ["catsports20000", "mockpaper", "fees20000", "catunknown20000"];

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
  assert.equal(/placeholder="(?:catsports20000|mockpaper|fees20000)"/.test(html), false, name);
  assert.equal(/value="(?:catsports20000|mockpaper|fees20000)"/.test(html), false, name);
}

const account = fs.readFileSync(path.join(dir, "account.html"), "utf8");
assert.match(account, /<h1>账户 <i class="sk m"/);
assert.equal(account.includes("找不到这个账户"), false);
assert.equal(visible(account).includes("40 个市场"), false);
assert.equal(account.includes('id="pause"'), false);
assert.equal(account.includes('id="close"'), false);
assert.equal(/请手输「/.test(visible(account)), false);
assert.match(account, /id="ac-run" hidden/);
const config = fs.readFileSync(path.join(dir, "config.html"), "utf8");
assert.match(config, /请手输「全部停止」以确认/);
assert.match(config, /placeholder="全部停止"/);
assert.match(config, /请手输「解绑」以确认/);
assert.match(config, /placeholder="解绑"/);
assert.equal(config.includes("请输入账户名以确认"), false);

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
assert.equal(overviewHtml.includes("评分 82"), false);
assert.equal(overviewHtml.includes("238 bps"), false);
assert.equal(overviewHtml.includes("12/200"), false);
assert.equal(overviewHtml.includes("100/100"), false);
for (const name of files.filter((n) => n.startsWith("leader"))) {
  const html = fs.readFileSync(path.join(dir, name), "utf8");
  assert.equal(html.includes("4,410"), false, name);
  assert.equal(html.includes("120 股"), false, name);
  assert.equal(html.includes(">82<"), false, name);
  assert.equal(/>71</.test(html), false, name);
  assert.equal(/>64</.test(html), false, name);
  assert.equal(/10-\d{2}/.test(html), false, name);
}
const strategiesHtml = fs.readFileSync(path.join(dir, "strategies.html"), "utf8");
assert.equal(strategiesHtml.includes("修改参数 · <i class=\"sk\">"), false);
const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
assert.match(css, /#ov-mirrors td,#ov-mirrors th,#ov-mirrors \.na\{white-space:nowrap\}/);
assert.match(css, /#ov-mirrors td:first-child\{white-space:normal;min-width:10em\}/);
assert.match(overviewHtml, /class="card rowcards" id="ov-mirrors"/);
assert.equal(overviewHtml.includes("我方累计盈亏"), false);
const cardCss = css.slice(css.indexOf("这些表改成一行一卡"));
assert.match(cardCss, /@media\(max-width:900px\)/);
assert.match(cardCss, /\.rowcards tr:has\(\.k-name\)\{[\s\S]*display:flex/);
assert.equal(cardCss.includes("@media(min-width:1280px)"), false);
assert.match(css, /\.q-br\{display:none\}/);
assert.match(leader, /class="card rowcards" id="ld-trades"/);
