import assert from "node:assert/strict";
import { privyAppIdConfigured, PRIVY_APP_ID } from "./config.js";
import { privyAuthMessage } from "./errors.js";

assert.equal(PRIVY_APP_ID, "cmvj6wa8m03ut0hjrdnr0a3g8");
assert.equal(privyAppIdConfigured(), true);
assert.equal(privyAppIdConfigured(""), false);
assert.equal(privyAppIdConfigured("   "), false);
assert.equal(privyAppIdConfigured("clplaceholder"), true);

assert.equal(
  privyAuthMessage({ status: 503, body: { code: "privy_login_disabled" } }),
  "社交登录暂未开放",
);
assert.equal(
  privyAuthMessage({ status: 401, body: { error: "privy_token_invalid" } }),
  "登录凭证无效，请重试",
);
assert.equal(
  privyAuthMessage({ status: 409, body: { error: { code: "account_conflict" } } }),
  "该账号关联了多个钱包用户，请联系我们",
);
assert.equal(privyAuthMessage({ status: 0, offline: true, body: null }), "连不上接口，请稍后再试。");
assert.equal(privyAuthMessage({ privyErrorCode: "exited_auth_flow", message: "User exited" }), "");
assert.equal(privyAuthMessage({ status: 500, body: { code: "nope" }, message: "HTTP 500" }), "登录失败：HTTP 500");
assert.equal(privyAuthMessage({ status: 401, body: { code: "other" }, message: "nope" }), "登录失败：nope");

console.log("privy-login tests ok");
