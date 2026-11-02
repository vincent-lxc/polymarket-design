import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker, { INDEXNOW_KEY, appRedirect, httpsRedirect, isShellRedirect, leaderDecision, barePathRedirect } from "./www.mjs";
import { leaderMetaDescription, leaderNotifyBlock, furtherReading, renderLeaderMain } from "./leader-page.mjs";
import { localPreviewURL } from "../tools/preview-www.mjs";
import { LEADER_INDEX_PINNED, applyPin, isPinned, mergePinnedSitemap } from "./leader-pin.mjs";

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
assert.match(homeHtml, /hreflang="zh-CN" href="https:\/\/www\.wakeloom\.com\/zh\/"/);
assert.match(homeHtml, /hreflang="en" href="https:\/\/www\.wakeloom\.com\/en\/"/);
assert.match(homeHtml, /application\/ld\+json/);
assert.match(homeHtml, /"@type":"Organization"/);

const en = await worker.fetch(new Request(host + "/en/"), { ASSETS: assets });
const enHtml = await en.text();
assert.match(enHtml, /rel="canonical" href="https:\/\/www\.wakeloom\.com\/en\/"/);
assert.match(enHtml, /hreflang="x-default" href="https:\/\/www\.wakeloom\.com\/"/);
assert.match(enHtml, /application\/ld\+json/);
assert.match(enHtml, /"@type":"Organization"/);
const zh = await worker.fetch(new Request(host + "/zh/"), { ASSETS: assets });
assert.match(await zh.text(), /hreflang="x-default" href="https:\/\/www\.wakeloom\.com\/"/);
for (const p of ["faq/", "guides/", "guides/polymarket-trader-data-checklist/", "research/", "research/leaderboard-data-quality/"]) {
  for (const lang of ["zh", "en"]) {
    const res = await worker.fetch(new Request(`${host}/${lang}/${p}`), { ASSETS: assets });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${host}/en/${p}">`), `/${lang}/${p}`);
  }
}

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
assert.ok(trueHtml.includes(`<link rel="alternate" hreflang="x-default" href="${host}/en/leader/${liveAddr}/">`));
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
assert.ok(falseHtml.includes(`<link rel="alternate" hreflang="x-default" href="${host}/en/leader/${liveAddr}/">`));
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
const pinnedCount = Object.keys(LEADER_INDEX_PINNED).length;
assert.equal(leaderLocs.length, 6 + pinnedCount * 2);
for (const a of [liveAddr, otherAddr, thirdAddr]) {
  assert.equal(xml.split(a).length - 1, 8);
}
function sitemapRow(loc) {
  const start = `<url><loc>${host}${loc}</loc>`;
  assert.ok(xml.includes(start), loc);
  return xml.split(start, 2)[1].split("</url>", 1)[0];
}
for (const loc of ["/", "/zh/", "/en/"]) {
  assert.ok(sitemapRow(loc).includes(`<xhtml:link rel="alternate" hreflang="x-default" href="${host}/"/>`), loc);
}
for (const loc of ["/zh/faq/", "/en/guides/", "/zh/research/leaderboard-data-quality/", `/zh/leader/${liveAddr}/`, `/en/leader/${liveAddr}/`]) {
  const enPath = loc.replace(/^\/zh\//, "/en/");
  assert.ok(sitemapRow(loc).includes(`<xhtml:link rel="alternate" hreflang="x-default" href="${host}${enPath}"/>`), loc);
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

/* ---- 过渡白名单（GSC 有展示的地址） ---- */
const pinKeys = Object.keys(LEADER_INDEX_PINNED);
assert.equal(pinKeys.length, 10);
for (const a of pinKeys) assert.match(a, /^0x[a-f0-9]{40}$/);
assert.equal(isPinned("0x1d24f81d4cd23201dda9b7c9fe17403b82f7e6ff"), false);
assert.equal(isPinned("0xF201A19B43471261A3C1BA9247335D55270E527E"), true);
assert.equal(pinKeys.filter((a) => LEADER_INDEX_PINNED[a].mm).length, 6);
const pinAddr = "0xf201a19b43471261a3c1ba9247335d55270e527e";
const pinLeaderSrc = leaderFixture(pinAddr, { indexable: false }).leader;
const pinned = applyPin(pinLeaderSrc, pinAddr);
assert.equal(pinLeaderSrc.indexable, false);
assert.equal(pinned.indexable, true);
assert.equal(pinned.suspected_market_maker, true);
assert.equal(applyPin({ indexable: false, suspected_market_maker: false }, pinAddr).suspected_market_maker, false);
assert.equal(applyPin({ indexable: true, index_basis: { indexable: false } }, pinAddr).index_basis.indexable, true);
assert.equal(applyPin(pinLeaderSrc, liveAddr), pinLeaderSrc);
assert.equal(mergePinnedSitemap([{ address: pinAddr, updated_at: "x" }]).length, 10);

for (const lang of ["zh", "en"]) {
  const r = await worker.fetch(
    new Request(host + `/${lang}/leader/${pinAddr}/`),
    bffEnv(async () => Response.json(leaderFixture(pinAddr, { indexable: false }))),
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-wakeloom-indexable"), "true");
  assert.equal(r.headers.get("x-robots-tag"), null);
  const h = await r.text();
  assert.doesNotMatch(h, /noindex/);
  assert.match(h, lang === "zh" ? /疑似做市，不参与排名/ : /market maker/i);
  // 白名单 mm:true 补的做市标记同样去掉正文收益率/ROI 和收益率格
  assert.doesNotMatch(h.match(/data-f="desc">([^<]*)</)[1], /收益率|ROI/);
  assert.doesNotMatch(h, /data-f="roi"/);
  assert.match(h, /data-mm="1"/);
  const ldp = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.ok(ldp["@graph"].length > 0);
  const dsp = ldp["@graph"].find((g) => g["@type"] === "Dataset");
  assert.ok(dsp && !dsp.variableMeasured.some((r) => r.propertyID === "roi"), "白名单 mm 页 Dataset 不含收益率");
}
/* 非白名单 indexable=false 照旧 noindex */
for (const lang of ["zh", "en"]) {
  const r = await worker.fetch(
    new Request(host + `/${lang}/leader/${otherAddr}/`),
    bffEnv(async () => Response.json(leaderFixture(otherAddr, { indexable: false }))),
  );
  assert.equal(r.headers.get("x-robots-tag"), "noindex, follow");
  assert.match(await r.text(), /<meta name="robots" content="noindex,follow">/);
}
/* 0x1d24 不在白名单 */
{
  const a = "0x1d24f81d4cd23201dda9b7c9fe17403b82f7e6ff";
  const r = await worker.fetch(new Request(host + `/en/leader/${a}/`), bffEnv(async () => Response.json(leaderFixture(a, { indexable: false }))));
  assert.equal(r.headers.get("x-robots-tag"), "noindex, follow");
}
/* sitemap：BFF 清单不含白名单时补上，已含时不重复 */
{
  const r = await worker.fetch(new Request(host + "/sitemap.xml"), bffEnv(sitemapFetch({ 0: { leaders: [{ address: pinAddr, updated_at: "2026-10-30T00:00:00.000Z" }], next_offset: null } })));
  const x = await r.text();
  for (const a of pinKeys) {
    assert.equal((x.match(new RegExp(`<loc>https://www\\.wakeloom\\.com/zh/leader/${a}/</loc>`, "g")) || []).length, 1, a);
    assert.equal((x.match(new RegExp(`<loc>https://www\\.wakeloom\\.com/en/leader/${a}/</loc>`, "g")) || []).length, 1, a);
  }
  assert.match(x, new RegExp(`<loc>https://www\\.wakeloom\\.com/en/leader/${pinAddr}/</loc><lastmod>2026-10-30`));
  assert.doesNotMatch(x, /0x1d24f81d/);
}
// P2：不带语言前缀的栏目 301 到 /zh/，其他路径不动
for (const p of ["leaderboard", "how-it-works", "copy-trading", "faq", "risk", "privacy", "terms", "about"]) {
  assert.equal(barePathRedirect("/" + p), `/zh/${p}/`);
  assert.equal(barePathRedirect("/" + p + "/"), `/zh/${p}/`);
}
for (const p of ["/", "/zh/", "/en/faq/", "/leader/0xabc/", "/llms.txt", "/robots.txt", "/sitemap.xml", "/faqs", "/guides/"]) {
  assert.equal(barePathRedirect(p), null, p);
}
const bareRes = await worker.fetch(new Request(host + "/faq?x=1"), { ASSETS: { fetch: async () => new Response("asset") } });
assert.equal(bareRes.status, 301);
assert.equal(bareRes.headers.get("Location"), host + "/zh/faq/?x=1");

// P1：leader 页主 CTA 是上线通知表单，App 链接降为文字链接，延伸阅读只链现有页面
for (const lang of ["zh", "en"]) {
  const nb = leaderNotifyBlock(lang, "https://app.wakeloom.com/leader?addr=0x1");
  assert.match(nb, /data-source="leader"/);
  assert.match(nb, /class="wl-form/);
  assert.doesNotMatch(nb, /class="btn pri" data-f="app"/);
  assert.match(nb, /<p class="sm app-link"><a data-f="app"/);
  const fr = furtherReading(lang);
  for (const p of ["how-it-works", "faq", "copy-trading", "risk"]) {
    assert.match(fr, new RegExp(`href="/${lang}/${p}/"`));
    assert.ok(fs.existsSync(path.join(repo, lang, p, "index.html")), p);
  }
}
assert.match(leaderNotifyBlock("zh", "x"), /想在上线后用模拟盘跟这个地址？留个邮箱，上线时通知你。/);

// P1：head description 模板，缺值整句省略、不写 0
const md = leaderMetaDescription("zh", { who: "0xf201…527e", score: "71", wr: "60.0%", dd: "12.0%", rm: "40", asof: "2026-10-30 06:00 UTC" });
assert.equal(md, "0xf201…527e 综合评分 71（截至 2026-10-30）。近90天胜率 60.0%、最大回撤 12.0%，已结算市场 40 个。数据来自链上公开记录。仅供分析，尚未正式上线。");
const mdBare = leaderMetaDescription("zh", { who: "0xf201…527e" });
assert.equal(mdBare, "0xf201…527e 的 Polymarket 交易数据。数据来自链上公开记录。仅供分析，尚未正式上线。");
assert.doesNotMatch(mdBare, /综合评分|胜率|\b0\b/);
const mdEn = leaderMetaDescription("en", { who: "0xf201…527e", score: "71", wr: "60.0%", asof: "2026-10-30 06:00 UTC" });
assert.equal(mdEn, "0xf201…527e: score 71 as of 2026-10-30. 90-day win rate 60.0%. Data from public on-chain records. For analysis only. Not yet launched.");
for (const t of [md, mdBare, mdEn]) assert.doesNotMatch(t, /推荐|值得跟|实盘收益/);
const main = renderLeaderMain("zh", "0x9a4cbaf3ba914b38ca92cc968cb6104c002998d0", {});
assert.match(main, /data-source="leader"/);
assert.match(main, /延伸阅读/);

// P3 / R2 / R5：静态页
for (const lang of ["zh", "en"]) {
  const ct = fs.readFileSync(path.join(repo, lang, "copy-trading", "index.html"), "utf8");
  assert.match(ct, /<p class="lead answer">/);
  assert.match(ct, /data-source="copy-trading"/);
  assert.match(ct, lang === "zh" ? /Polymarket 本身没有跟单功能。.*模拟盘（paper trading）.*尚未正式上线/ : /Polymarket has no built-in copy trading\..*paper trading only.*has not launched yet/);
  const home = fs.readFileSync(path.join(repo, lang, "index.html"), "utf8");
  assert.match(home, /<title>Wakeloom/);
  assert.match(home, lang === "zh" ? /Wakeloom（织迹）是用于 Polymarket 的钱包分析和模拟盘跟单工具，尚未正式上线。/ : /Wakeloom is a wallet analytics and paper copy-trading tool for Polymarket\. It has not launched yet\./);
  const lds = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const flat = lds.flatMap((x) => (x["@graph"] ? x["@graph"] : [x]));
  const org = flat.find((x) => x["@type"] === "Organization");
  assert.ok(org, "Organization");
  assert.equal(org.name, "Wakeloom");
  assert.ok(org.alternateName.includes("织迹"));
  assert.ok(org.description);
  assert.equal(org.sameAs, undefined);
}


/* HTTP → HTTPS 301（Workers 自定义域名 / Bingbot 探 HTTP） */
{
  const httpHost = "http://www.wakeloom.com";
  const sampleAddr = "0x" + "ab".repeat(20);
  assert.equal(httpsRedirect(new Request(httpHost + "/")), "https://www.wakeloom.com/");
  assert.equal(
    httpsRedirect(new Request(httpHost + `/zh/leader/${sampleAddr}/?x=1`)),
    `https://www.wakeloom.com/zh/leader/${sampleAddr}/?x=1`,
  );
  assert.equal(
    httpsRedirect(new Request(host + "/zh/?q=1", { headers: { "X-Forwarded-Proto": "http" } })),
    "https://www.wakeloom.com/zh/?q=1",
  );
  assert.equal(
    httpsRedirect(new Request(host + "/zh/?q=1", { headers: { "x-forwarded-proto": "http, https" } })),
    "https://www.wakeloom.com/zh/?q=1",
  );
  assert.equal(httpsRedirect(new Request(host + "/")), null);
  assert.equal(httpsRedirect(new Request("http://127.0.0.1:8765/")), null);
  assert.equal(httpsRedirect(new Request("http://localhost:8765/zh/")), null);

  const emptyAssets = {
    ASSETS: {
      async fetch() {
        return new Response("should-not-run", { status: 500 });
      },
    },
  };
  const httpHome = await worker.fetch(new Request(httpHost + "/"), emptyAssets);
  assert.equal(httpHome.status, 301);
  assert.equal(httpHome.headers.get("location"), "https://www.wakeloom.com/");
  const httpLeader = await worker.fetch(
    new Request(httpHost + `/zh/leader/${sampleAddr}/?utm=bing`),
    emptyAssets,
  );
  assert.equal(httpLeader.status, 301);
  assert.equal(
    httpLeader.headers.get("location"),
    `https://www.wakeloom.com/zh/leader/${sampleAddr}/?utm=bing`,
  );
  const xfHome = await worker.fetch(
    new Request(host + "/", { headers: { "X-Forwarded-Proto": "http" } }),
    emptyAssets,
  );
  assert.equal(xfHome.status, 301);
  assert.equal(xfHome.headers.get("location"), "https://www.wakeloom.com/");
  const loopback = await worker.fetch(new Request("http://127.0.0.1:8765/"), emptyAssets);
  assert.notEqual(loopback.status, 301);
}

console.log("www redirect tests ok");

// 全站不出现「值得跟」类说法（HTML、llms.txt、生成器）
{
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = d + "/" + n; return statSync(p).isDirectory() ? (["node_modules", ".git", "tools/__pycache__"].includes(n) ? [] : walk(p)) : [p]; });
  const files = [...walk("zh"), ...walk("en"), "llms.txt", "tools/build_site.py", "index.html"].filter((f) => /\.(html|txt|py)$/.test(f));
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), /值得跟|值不值得|worth (following|copying)|traders to follow/i, f);
}
