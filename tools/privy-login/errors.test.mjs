import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { privyAppIdConfigured, PRIVY_APP_ID } from "./config.js";
import { IDENTITY_TOKEN_NOT_READY, privyAuthMessage } from "./errors.js";
import { shouldCompletePrivyLogin } from "./flow.js";

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
assert.equal(
  privyAuthMessage({ status: 429, message: "Too many requests. Please wait to try again." }),
  "请求过于频繁，请稍后再试",
);
assert.equal(privyAuthMessage("too_many_requests"), "请求过于频繁，请稍后再试");
assert.equal(privyAuthMessage({ name: "TooManyRequestsError", code: "too_many_requests" }), "请求过于频繁，请稍后再试");
assert.equal(IDENTITY_TOKEN_NOT_READY, "登录凭证未就绪，请联系管理员开启 identity token");

assert.equal(
  shouldCompletePrivyLogin({ userInitiated: false, wasAlreadyAuthenticated: true, alreadyHandled: false }),
  false,
);
assert.equal(
  shouldCompletePrivyLogin({ userInitiated: true, wasAlreadyAuthenticated: true, alreadyHandled: false }),
  true,
);
assert.equal(
  shouldCompletePrivyLogin({ userInitiated: true, wasAlreadyAuthenticated: false, alreadyHandled: false }),
  true,
);
assert.equal(
  shouldCompletePrivyLogin({ userInitiated: true, wasAlreadyAuthenticated: false, alreadyHandled: true }),
  false,
);

const src = readFileSync(new URL("./login.jsx", import.meta.url), "utf8");
assert.equal(src.includes("getIdentityToken"), false);
assert.equal(src.includes("waitIdentityToken"), false);
assert.equal(src.includes("useIdentityToken"), true);
assert.equal((src.match(/<PrivyProvider/g) || []).length, 1);
assert.equal((src.match(/\blogin\(\)/g) || []).length, 1);

console.log("privy-login tests ok");
