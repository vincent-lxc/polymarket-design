import assert from "node:assert/strict";
import fs from "node:fs";
import { appRedirect, isShellRedirect, leaderDecision } from "./www.mjs";

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

console.log("www redirect tests ok");
