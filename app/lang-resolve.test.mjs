import assert from "node:assert/strict";
import { resolveAppLang } from "./lang-resolve.mjs";

assert.equal(resolveAppLang({ stored: "zh", query: "en", browser: "en" }), "zh");
assert.equal(resolveAppLang({ stored: "en", query: "zh", browser: "zh" }), "en");
assert.equal(resolveAppLang({ stored: "", query: "en", browser: "zh" }), "en");
assert.equal(resolveAppLang({ stored: "", query: "zh", browser: "en" }), "zh");
assert.equal(resolveAppLang({ stored: "", query: "", browser: "zh" }), "zh");
assert.equal(resolveAppLang({ stored: "", query: "", browser: "en" }), "en");
console.log("lang resolver tests ok");
