import assert from "node:assert/strict";
import { appRedirect } from "./www.mjs";

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
assert.equal(appRedirect(host + "/zh/"), null);
assert.equal(appRedirect(host + "/app-not"), null);
assert.equal(appRedirect(host + "/application"), null);

console.log("www redirect tests ok");
