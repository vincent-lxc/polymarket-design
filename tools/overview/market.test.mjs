import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../../app/market.js", import.meta.url), "utf8");
vm.runInThisContext(src);
const { pick, href, html } = globalThis.PMMarket;

assert.equal(pick(null), "");
assert.equal(pick({}), "");
assert.equal(pick({ market: "Fed 12 月降息？" }), "");
assert.equal(pick({ title: "fed-decision-in-december" }), "");
assert.equal(pick({ slug: "" }), "");
assert.equal(pick({ slug: "  " }), "");
assert.equal(pick({ event_slug: "bad/slug", slug: "ok-market" }), "ok-market");
assert.equal(pick({ event_slug: "event-a", slug: "market-b" }), "event-a");
assert.equal(pick({ slug: "only-slug" }), "only-slug");
assert.equal(pick({ slug: "../etc" }), "");
assert.equal(pick({ slug: "has space" }), "");
assert.equal(pick({ slug: "javascript:alert(1)" }), "");
assert.equal(pick({ event_slug: 12, slug: "from-slug" }), "from-slug");

assert.equal(href("fed-decision"), "https://polymarket.com/event/fed-decision");
assert.equal(href("A_b-1"), "https://polymarket.com/event/A_b-1");

const plain = html("Fed 12 月降息？", { title: "Fed 12 月降息？" });
assert.equal(plain, "Fed 12 月降息？");
assert.equal(plain.includes("<a"), false);
assert.equal(html("湖人 vs 勇士", {}).includes("polymarket.com"), false);
assert.equal(html(null, {}), "未命名市场");
assert.equal(html("<img src=x onerror=alert(1)>", { market: "Fed" }), "&lt;img src=x onerror=alert(1)&gt;");

const linked = html("Fed 12 月降息？", { event_slug: "fed-decision", slug: "other" });
assert.match(linked, /href="https:\/\/polymarket\.com\/event\/fed-decision"/);
assert.match(linked, /target="_blank"/);
assert.match(linked, /rel="noopener noreferrer"/);
assert.match(linked, /class="mkt"/);
assert.match(linked, /class="ext"/);
assert.equal(linked.includes("other"), false);
assert.equal(linked.includes("fed-decision-in-december"), false);

const slugOnly = html('BTC > $120k', { slug: "btc-120k" });
assert.match(slugOnly, /href="https:\/\/polymarket\.com\/event\/btc-120k"/);
assert.match(slugOnly, /BTC &gt; \$120k/);

const bad = html("Fed 12 月降息？", { slug: "fed decision", event_slug: "no/slash" });
assert.equal(bad, "Fed 12 月降息？");

const api = readFileSync(new URL("../../app/api.js", import.meta.url), "utf8");
assert.match(api, /mirrorMarketName\(m\)/);
assert.match(api, /marketHtml\(p\.title, p\)/);
assert.equal(/polymarket\.com\/event\/[A-Za-z0-9]/.test(api), false);

for (const file of ["overview.html", "account.html", "leader.html", "leader-5c1e.html"]) {
  const htmlFile = readFileSync(new URL("../../app/" + file, import.meta.url), "utf8");
  assert.equal(htmlFile.includes("polymarket.com"), false, file);
  const mi = htmlFile.indexOf('src="market.js"');
  const ai = htmlFile.indexOf('src="api.js');
  assert.ok(mi >= 0 && ai > mi, file);
}

console.log("market.test.mjs ok");
