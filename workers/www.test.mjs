import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker, { INDEXNOW_KEY, appRedirect, isShellRedirect, leaderDecision } from "./www.mjs";
import { localPreviewURL } from "../tools/preview-www.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const host = "https://www.wakeloom.com";
assert.equal(
  appRedirect(host + "/app/login.html?next=overview.html"),
  "https://app.wakeloom.com/login.html?next=overview.html",
);
assert.equal(
  appRedirect(host + "/app/leader.html?addr=0xabc&x=1"),
  "https://app.wakeloom.com/leader.html?addr=0xabc&x=1",
);
assert.equal(appRedirect(host + "/app/overview.html"), "https://app.wakeloom.com/overview.html");
assert.equal(appRedirect(host + "/app"), "https://app.wakeloom.com/");
assert.equal(appRedirect(host + "/app/"), "https://app.wakeloom.com/");
assert.equal(appRedirect(host + "/app/?from=home"), "https://app.wakeloom.com/?from=home");
assert.equal(
  appRedirect(host + "/login.html?next=%2Foverview"),
  "https://app.wakeloom.com/login.html?next=%2Foverview",
);
assert.equal(appRedirect(host + "/board.html"), "https://app.wakeloom.com/markets?tab=board");
assert.equal(
  appRedirect(host + "/app/board.html?window=90d"),
  "https://app.wakeloom.com/markets?window=90d&tab=board",
);
assert.equal(appRedirect(host + "/app/board/?from=home"), "https://app.wakeloom.com/markets?from=home&tab=board");
assert.equal(appRedirect(host + "/markets.html"), "https://app.wakeloom.com/markets.html");
assert.equal(appRedirect(host + "/zh/"), null);
assert.equal(appRedirect(host + "/app-not"), null);
assert.equal(appRedirect(host + "/application"), null);

const addr = "0x" + "ab".repeat(20);
const upper = "0x" + "AB".repeat(20);
assert.deepEqual(leaderDecision(`/en/leader/${addr}/`), { action: "wallet", lang: "en", addr });
assert.deepEqual(leaderDecision(`/zh/leader/${addr}/`), { action: "wallet", lang: "zh", addr });
assert.deepEqual(leaderDecision(`/en/leader/${addr}`), {
  action: "redirect",
  to: `/en/leader/${addr}/`,
  status: 301,
});
assert.deepEqual(leaderDecision(`/en/leader/${upper}/`), {
  action: "redirect",
  to: `/en/leader/${addr}/`,
  status: 301,
});
/* 规范化之后必须落到钱包页，不能再指回壳目录。 */
assert.equal(leaderDecision(`/en/leader/${addr}/`).action, "wallet");
for (const p of ["/en/leader/_shell", "/en/leader/_shell/", "/en/leader/_shell/index.html", "/zh/leader/_shell/"]) {
  const d = leaderDecision(p);
  assert.equal(d.action, "redirect");
  assert.match(d.to, /^\/(en|zh)\/leaderboard\/$/);
  assert.equal(leaderDecision(d.to), null);
}
assert.equal(leaderDecision("/en/leaderboard/"), null);
assert.equal(leaderDecision("/en/leader/not-an-address/"), null);
assert.equal(isShellRedirect(308, "/en/leader/_shell/", host), true);
assert.equal(isShellRedirect(301, host + "/zh/leader/_shell/index.html", host), true);
assert.equal(isShellRedirect(200, "/en/leader/_shell/", host), false);
assert.equal(isShellRedirect(308, `/en/leader/${addr}/`, host), false);

const rules = fs
  .readFileSync(new URL("../_redirects", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => line.trim() && !line.trim().startsWith("#"))
  .join("\n");
assert.equal(/:addr/.test(rules), false);
assert.equal(/_shell\/index\.html 200/.test(rules), false);

const keyPath = `/${INDEXNOW_KEY}.txt`;
assert.equal(INDEXNOW_KEY.length, 32);
assert.match(INDEXNOW_KEY, /^[0-9a-f]{32}$/);
assert.equal(appRedirect(host + keyPath), null);
assert.equal(appRedirect(host + "/llms.txt"), null);
assert.equal(leaderDecision(keyPath), null);
assert.equal(leaderDecision("/llms.txt"), null);

const keyFile = fs.readFileSync(path.join(repo, `${INDEXNOW_KEY}.txt`));
assert.deepEqual(keyFile, Buffer.from(INDEXNOW_KEY));

const boom = { ASSETS: { fetch() { throw new Error("密钥文件不应交给资产层"); } } };
const keyRes = await worker.fetch(new Request(host + keyPath), boom);
assert.equal(keyRes.status, 200);
assert.equal(keyRes.headers.get("location"), null);
assert.equal(keyRes.headers.get("content-type"), "text/plain; charset=utf-8");
assert.equal(await keyRes.text(), INDEXNOW_KEY);
const keyHead = await worker.fetch(new Request(host + keyPath, { method: "HEAD" }), boom);
assert.equal(keyHead.status, 200);
assert.equal(keyHead.headers.get("location"), null);
assert.equal(await keyHead.text(), "");

const llmsRedir = {
  ASSETS: { async fetch() { return new Response(null, { status: 301, headers: { Location: host + "/en/" } }); } },
};
const blocked = await worker.fetch(new Request(host + "/llms.txt"), llmsRedir);
assert.equal(blocked.status, 404);
assert.equal(blocked.headers.get("location"), null);
assert.equal((await blocked.text()).includes("<"), false);

function fileFor(pathname) {
  let rel = decodeURIComponent(pathname.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const full = path.normalize(path.join(repo, rel));
  if (full !== repo && !full.startsWith(repo + path.sep)) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  return null;
}
const assets = {
  async fetch(request) {
    const file = fileFor(new URL(request.url).pathname);
    if (!file) return new Response("not found", { status: 404 });
    return new Response(fs.readFileSync(file));
  },
};
const llms = await worker.fetch(new Request(host + "/llms.txt"), { ASSETS: assets });
assert.equal(llms.status, 200);
assert.equal(llms.headers.get("location"), null);
assert.match(llms.headers.get("content-type"), /^text\/plain/);
const llmsBody = await llms.text();
assert.equal(llmsBody, fs.readFileSync(path.join(repo, "llms.txt"), "utf8"));
assert.match(llmsBody, /公测前预览，尚未正式上线/);
assert.doesNotMatch(llmsBody, /app\.wakeloom\.com/);

const home = await worker.fetch(new Request(host + "/"), { ASSETS: assets });
assert.equal(home.status, 200);
const homeHtml = await home.text();
assert.equal(homeHtml, fs.readFileSync(path.join(repo, "index.html"), "utf8"));
assert.match(homeHtml, /rel="canonical" href="https:\/\/www\.wakeloom\.com\/"/);
assert.doesNotMatch(homeHtml, /rel="canonical" href="https:\/\/www\.wakeloom\.com\/en\/"/);
assert.match(homeHtml, /property="og:image" content="https:\/\/www\.wakeloom\.com\/assets\/og-home\.png"/);
assert.match(homeHtml, /name="twitter:card" content="summary_large_image"/);
assert.match(homeHtml, /hreflang="x-default" href="https:\/\/www\.wakeloom\.com\/"/);
assert.match(homeHtml, /application\/ld\+json/);
assert.match(homeHtml, /"@type":"Organization"/);

const en = await worker.fetch(new Request(host + "/en/"), { ASSETS: assets });
const enHtml = await en.text();
assert.match(enHtml, /rel="canonical" href="https:\/\/www\.wakeloom\.com\/en\/"/);
assert.match(enHtml, /application\/ld\+json/);
assert.match(enHtml, /"@type":"Organization"/);

const previewPort = 8765;
for (const ok of ["/", "/llms.txt", "/zh/", "/en/faq/", "/assets/og-home.png", "/fc81fd20e5cda8d8f5d37c7bf054a1cd.txt"]) {
  const u = localPreviewURL(ok, previewPort);
  assert.ok(u, ok);
  assert.equal(u.protocol, "http:");
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, String(previewPort));
  assert.equal(u.username, "");
  assert.equal(u.href.startsWith("http://127.0.0.1:" + previewPort + "/"), true);
}
const q = localPreviewURL("/zh/?x=1", previewPort);
assert.equal(q.search, "?x=1");
assert.equal(q.hostname, "127.0.0.1");
for (const bad of [
  "http://evil.com/",
  "https://evil.com/x",
  "http://127.0.0.1:8765/x",
  "//evil.com/x",
  "///evil.com",
  "/\\evil.com",
  "\\\\evil.com",
  "javascript:alert(1)",
  "@evil.com/x",
  "http://127.0.0.1:8765@evil.com/",
  "",
  "foo",
  "/%2f%2fevil.com",
  "http://127.0.0.1:9/x",
]) {
  assert.equal(localPreviewURL(bad, previewPort), null, bad);
}

const liveAddr = "0x" + "ab".repeat(20);
const otherAddr = "0x" + "cd".repeat(20);
const thirdAddr = "0x" + "ef".repeat(20);

function leaderFixture(address, extra) {
  return {
    leader: Object.assign({
      address,
      indexable: true,
      user_name: "vinii",
      x_username: "viiniijunior",
      updated_at: "2026-10-23T10:06:23.000Z",
      window: "90d",
      win_rate: 0.1234,
      roi: 0.25,
      max_drawdown: 0.051,
      smart_score: 65.71452351227633,
      gate_failures: ["trade_count"],
      metrics: {
        win_rate: 0.1234,
        roi: 0.25,
        max_drawdown: 0.051,
        resolved_markets: 42,
        realized_pnl: 1200,
        smart_score: 65.71452351227633,
        gate_pass: true,
        gate_failures: ["trade_count"],
        mm_score: 0.4,
        categories: ["politics", "unknown"],
        last_trade_at: "2026-10-16T19:48:17.000Z",
      },
      categories: [{ category: "politics" }, { category: "unknown" }],
    }, extra),
  };
}

function bffEnv(handler, assetLog) {
  return {
    BFF_FETCH: handler,
    ASSETS: {
      async fetch(request) {
        if (assetLog) assetLog.push(new URL(request.url).pathname);
        return assets.fetch(request);
      },
    },
  };
}

const trueRes = await worker.fetch(
  new Request(host + `/zh/leader/${liveAddr}/`),
  bffEnv(async () => Response.json(leaderFixture(liveAddr))),
);
assert.equal(trueRes.status, 200);
assert.equal(trueRes.headers.get("x-wakeloom-leader"), "ssr");
assert.equal(trueRes.headers.get("x-wakeloom-indexable"), "true");
assert.equal(trueRes.headers.get("x-robots-tag"), null);
const trueHtml = await trueRes.text();
assert.doesNotMatch(trueHtml, /noindex/);
assert.doesNotMatch(trueHtml, /_shell/);
assert.doesNotMatch(trueHtml, /smart_score|gate_failures|gate_pass|AggregateRating|"@type":"Review"|65\.71452351227633/);
assert.match(trueHtml, /<title>0xabab…abab 的 Polymarket 交易数据：综合评分、胜率、回撤 \| Wakeloom 织迹<\/title>/);
assert.match(trueHtml, /0xabab…abab：综合评分 65\.7、近90天胜率 12\.3%、收益率 \+25\.0%、最大回撤 5\.1%。已结算市场 42 个。/);
assert.match(trueHtml, new RegExp(`rel="canonical" href="https://www\\.wakeloom\\.com/zh/leader/${liveAddr}/"`));
assert.match(trueHtml, new RegExp(`hreflang="zh-CN" href="https://www\\.wakeloom\\.com/zh/leader/${liveAddr}/"`));
assert.match(trueHtml, new RegExp(`hreflang="en" href="https://www\\.wakeloom\\.com/en/leader/${liveAddr}/"`));
assert.match(trueHtml, /hreflang="x-default" href="https:\/\/www\.wakeloom\.com\/"/);
assert.match(trueHtml, /数据截至 2026-10-23 10:06（UTC）/);
assert.match(trueHtml, />12\.3%</);
assert.match(trueHtml, /@vinii/);
assert.doesNotMatch(trueHtml, /加载中|打开后从公开接口加载/);
const ld = JSON.parse(trueHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const types = ld["@graph"].map((node) => node["@type"]);
assert.ok(types.includes("ProfilePage"));
assert.ok(types.includes("Dataset"));
assert.ok(types.includes("BreadcrumbList"));
assert.equal(types.includes("AggregateRating"), false);
assert.equal(types.includes("Review"), false);
assert.equal(JSON.stringify(ld).includes("smart_score"), false);

const falseRes = await worker.fetch(
  new Request(host + `/en/leader/${liveAddr}/`),
  bffEnv(async () => Response.json(leaderFixture(liveAddr, { indexable: false, win_rate: null, roi: null, metrics: { win_rate: null, roi: null, max_drawdown: 0.051 } }))),
);
assert.equal(falseRes.status, 200);
assert.equal(falseRes.headers.get("x-wakeloom-indexable"), "false");
const falseHtml = await falseRes.text();
assert.match(falseHtml, /<meta name="robots" content="noindex,follow">/);
assert.match(falseHtml, /0xabab…abab: score 65\.7, max drawdown 5\.1%/);
// copy-engine #90：胜率、收益率为 null 时摘要句不写假数字；格子保留写 No data（不再整格省略）
assert.doesNotMatch(falseHtml.match(/<meta name="description" content="([^"]*)">/)[1], /win rate|ROI/);
assert.doesNotMatch(falseHtml.match(/data-f="desc">([^<]*)</)[1], /win rate|ROI/);
assert.match(falseHtml, /<div class="st" data-f="win_rate"><span>Win rate \(90d\)<\/span><b class="nd">No data<\/b><\/div>/);
assert.match(falseHtml, /<div class="st" data-f="roi"><span>ROI \(90d\)<\/span><b class="nd">No data<\/b><\/div>/);
assert.doesNotMatch(falseHtml, /"propertyID":"(win_rate|roi)"/);
assert.doesNotMatch(falseHtml, /0\.0%/);
assert.doesNotMatch(falseHtml, /null|NaN/);
assert.doesNotMatch(falseHtml, /_shell/);

const paperRes = await worker.fetch(
  new Request(host + `/zh/leader/${liveAddr}/`),
  bffEnv(async () => Response.json(leaderFixture(liveAddr, { paper: true }))),
);
const paperHtml = await paperRes.text();
assert.match(paperHtml, /模拟盘/);
assert.doesNotMatch(paperHtml, /noindex/);

let bffCalls = 0;
const missing = await worker.fetch(
  new Request(host + `/zh/leader/${otherAddr}/`),
  bffEnv(async () => {
    bffCalls += 1;
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }),
);
assert.equal(missing.status, 404);
assert.match(await missing.text(), /没有这个地址的公开数据/);
assert.equal(bffCalls, 1);

const bad = await worker.fetch(
  new Request(host + "/zh/leader/not-an-address/"),
  bffEnv(async () => {
    throw new Error("invalid address must not call bff");
  }),
);
assert.equal(bad.status, 404);

const upperRes = await worker.fetch(
  new Request(host + `/en/leader/${"0x" + "AB".repeat(20)}/`),
  bffEnv(async () => {
    throw new Error("uppercase redirect must not call bff");
  }),
);
assert.equal(upperRes.status, 301);
assert.equal(upperRes.headers.get("location"), host + `/en/leader/${liveAddr}/`);

const downAssets = [];
const down = await worker.fetch(
  new Request(host + `/zh/leader/${liveAddr}/`),
  bffEnv(async () => new Response("nope", { status: 500 }), downAssets),
);
assert.equal(down.status, 503);
assert.equal(downAssets.length, 0);
assert.doesNotMatch(await down.text(), /0x[a-f0-9]{40}/);

const shellOnly = await worker.fetch(new Request(host + "/zh/leader/_shell/"), { ASSETS: assets });
assert.equal(shellOnly.status, 301);
assert.match(shellOnly.headers.get("location"), /\/zh\/leaderboard\/$/);

function sitemapFetch(map) {
  return async (url) => {
    const offset = Number(new URL(url).searchParams.get("offset"));
    const page = map[offset];
    if (!page) return new Response("missing page", { status: 500 });
    return Response.json({ sitemap: page });
  };
}

const siteAssets = [];
const siteRes = await worker.fetch(
  new Request(host + "/sitemap.xml"),
  bffEnv(sitemapFetch({
    0: {
      leaders: [
        { address: liveAddr, updated_at: "2026-10-23T10:36:23.000Z" },
        { address: otherAddr.toUpperCase(), updated_at: "2026-10-23T01:02:03.000Z" },
      ],
      next_offset: 2,
    },
    2: {
      leaders: [{ address: thirdAddr, updated_at: "2026-10-22T00:00:00.000Z" }],
      next_offset: null,
    },
  }), siteAssets),
);
assert.equal(siteRes.status, 200);
assert.equal(siteRes.headers.get("x-wakeloom-sitemap"), "bff");
assert.equal(siteAssets.length, 0);
const xml = await siteRes.text();
assert.doesNotMatch(xml, /app\.wakeloom\.com/);
const leaderLocs = xml.match(/<loc>https:\/\/www\.wakeloom\.com\/(?:zh|en)\/leader\/0x[a-f0-9]{40}\//g) || [];
assert.equal(leaderLocs.length, 6);
for (const a of [liveAddr, otherAddr, thirdAddr]) {
  assert.equal(xml.split(a).length - 1, 6);
}
assert.match(xml, new RegExp(`<loc>https://www\\.wakeloom\\.com/zh/leader/${liveAddr}/</loc><lastmod>2026-10-23T10:36:23\\.000Z</lastmod>`));
assert.match(xml, /<loc>https:\/\/www\.wakeloom\.com\/zh\/faq\/<\/loc>/);
assert.doesNotMatch(xml, /_shell/);

const siteFailAssets = [];
const siteFail = await worker.fetch(
  new Request(host + "/sitemap.xml"),
  bffEnv(async () => new Response("down", { status: 502 }), siteFailAssets),
);
assert.equal(siteFail.status, 503);
assert.equal(siteFailAssets.length, 0);
assert.equal(await siteFail.text(), "sitemap unavailable\n");

const siteStuck = await worker.fetch(
  new Request(host + "/sitemap.xml"),
  bffEnv(async () => Response.json({ sitemap: { leaders: [{ address: liveAddr, updated_at: "2026-10-23T00:00:00.000Z" }], next_offset: 0 } })),
);
assert.equal(siteStuck.status, 503);

console.log("www redirect tests ok");
