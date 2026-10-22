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
assert.equal(omittedEquityCount("缺 5 个"), -1);
// 2026-10-22 线上真实结构：逗号分隔的实例名，不能把 catunknown20000 里的 20000 当成个数
assert.equal(omittedEquityCount("catunknown20000,example,fees2000,paper2000,papertight2000,v2maker2000,v2taker2000"), 7);
assert.equal(omittedEquityCount("catunknown20000"), 1);
assert.deepEqual(globalThis.PMEquity.omittedEquityNames("a, b,,c"), ["a", "b", "c"]);
assert.equal(omittedEquityCount([]), 0);
assert.equal(omittedEquityCount(["a", "b"]), 2);
assert.equal(omittedEquityCount({ strategies: ["a"] }), 1);
assert.equal(omittedEquityCount({ instances: [] }), 0);
assert.equal(omittedEquityCount({ strategies: ["a", "b"], count: 9 }), 2);
assert.equal(omittedEquityCount({ count: 4 }), 4);
assert.equal(omittedEquityCount({ n: "2" }), 2);
assert.equal(omittedEquityCount({ a: 1, b: 1 }), 2);

assert.equal(equityCurveCaption(0), null);
assert.deepEqual(equityCurveCaption(-1), { title: "已统计实例净值", note: "曲线不完整" });
assert.deepEqual(equityCurveCaption(2), {
  title: "已统计实例净值",
  note: "曲线不完整：缺 2 个实例",
});

const cfg = readFileSync(new URL("../../app/wallet-config.js", import.meta.url), "utf8");
assert.match(cfg, /usdc:\s*"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"/);
assert.match(cfg, /usdce:\s*"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"/);
assert.match(cfg, /pusd:\s*"0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB"/);
assert.match(cfg, /developers\.circle\.com\/stablecoins\/usdc-contract-addresses/);
assert.match(cfg, /docs\.polymarket\.com\/concepts\/pusd/);
assert.match(cfg, /docs\.polymarket\.com\/resources\/contracts/);
assert.match(cfg, /docs\.polygon\.technology\/pos\/reference\/mapped-tokens/);

const fund = readFileSync(new URL("../privy-login/fund.jsx", import.meta.url), "utf8");
assert.equal(fund.includes("getIdentityToken"), false);
assert.equal(fund.includes("useFundWallet"), true);
assert.equal((fund.match(/<PrivyProvider/g) || []).length, 1);

const wallet = readFileSync(new URL("../../app/wallet.js", import.meta.url), "utf8");
assert.equal(wallet.includes("eth_getBalance"), true);
assert.equal(wallet.includes("0x70a08231"), true);
assert.equal(wallet.includes("可下单"), true);
assert.equal(wallet.includes("USDC.e"), true);
assert.equal(wallet.includes('id="w-usdc"'), true);
assert.equal(wallet.includes("即将上线"), true);
assert.equal(wallet.includes("toLogin"), false);

console.log("equity + wallet config tests ok");
