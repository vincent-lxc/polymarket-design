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

console.log("www redirect tests ok");
