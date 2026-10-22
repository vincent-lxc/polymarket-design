import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../../app/equity.js", import.meta.url), "utf8");
vm.runInThisContext(src);
const { omittedEquityCount, equityCurveCaption } = globalThis.PMEquity;

assert.equal(omittedEquityCount(null), 0);
assert.equal(omittedEquityCount(undefined), 0);
assert.equal(omittedEquityCount(false), 0);
assert.equal(omittedEquityCount(""), 0);
assert.equal(omittedEquityCount(0), 0);
assert.equal(omittedEquityCount(-2), 0);
assert.equal(omittedEquityCount(Number.NaN), 0);
assert.equal(omittedEquityCount(Number.POSITIVE_INFINITY), 0);
assert.equal(omittedEquityCount(3), 3);
assert.equal(omittedEquityCount(3.9), 3);
assert.equal(omittedEquityCount("3"), 3);
assert.equal(omittedEquityCount(" 4 "), 4);
assert.equal(omittedEquityCount("0"), 0);
assert.equal(omittedEquityCount("missing"), 1);
assert.equal(omittedEquityCount("缺 5 个"), 5);
assert.equal(omittedEquityCount([]), 0);
assert.equal(omittedEquityCount(["a", "b"]), 2);
assert.equal(omittedEquityCount({ strategies: ["a"] }), 1);
assert.equal(omittedEquityCount({ instances: [] }), 0);
assert.equal(omittedEquityCount({ strategies: ["a", "b"], count: 9 }), 2);
assert.equal(omittedEquityCount({ count: 4 }), 4);
assert.equal(omittedEquityCount({ n: "2" }), 2);
assert.equal(omittedEquityCount({ a: 1, b: 1 }), 2);

assert.equal(equityCurveCaption(0), null);
assert.deepEqual(equityCurveCaption(2), {
  title: "已统计实例净值",
  note: "曲线不完整：缺 2 个实例",
});

const cfg = readFileSync(new URL("../../app/wallet-config.js", import.meta.url), "utf8");
assert.match(cfg, /pusd:\s*""/);
assert.equal(cfg.includes("0x"), false);

const fund = readFileSync(new URL("../privy-login/fund.jsx", import.meta.url), "utf8");
assert.equal(fund.includes("getIdentityToken"), false);
assert.equal(fund.includes("useFundWallet"), true);
assert.equal((fund.match(/<PrivyProvider/g) || []).length, 1);

const wallet = readFileSync(new URL("../../app/wallet.js", import.meta.url), "utf8");
assert.equal(wallet.includes("eth_getBalance"), true);
assert.equal(wallet.includes("0x70a08231"), true);
assert.equal(wallet.includes("即将上线"), true);
assert.equal(wallet.includes("toLogin"), false);

console.log("equity + wallet config tests ok");
