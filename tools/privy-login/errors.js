/** 把 /v1/auth/privy 的错误码翻成登录页上的一句中文。空字符串表示不必提示（用户关掉弹窗）。 */

function errorCode(e) {
  const b = e && e.body;
  if (typeof b === "string") return b;
  if (!b || typeof b !== "object") return "";
  for (const key of ["code", "error", "reason"]) {
    const c = b[key];
    if (typeof c === "string") return c;
    if (c && typeof c === "object" && typeof c.code === "string") return c.code;
  }
  if (typeof b.message === "string" && /^[a-z0-9_]+$/.test(b.message)) return b.message;
  return "";
}

export function isPrivyExit(e) {
  const bits = [e && e.privyErrorCode, e && e.code, e && e.message]
    .filter((x) => typeof x === "string")
    .join(" ")
    .toLowerCase();
  return bits.includes("exited_auth_flow") || bits.includes("user_exited") || bits.includes("exited");
}

/** Privy HTTP 429。默认文案是 TooManyRequestsError：「Too many requests. Please wait to try again.」 */
export function isPrivyRateLimit(e) {
  if (e == null) return false;
  if (typeof e === "string") return e === "too_many_requests" || /too many requests/i.test(e);
  if (e.status === 429 || e.name === "TooManyRequestsError") return true;
  const codes = [errorCode(e), e.code, e.privyErrorCode].filter((x) => typeof x === "string");
  if (codes.includes("too_many_requests")) return true;
  return typeof e.message === "string" && /too many requests/i.test(e.message);
}

export const IDENTITY_TOKEN_NOT_READY = "登录凭证未就绪，请联系管理员开启 identity token";

export function privyAuthMessage(e) {
  const code = errorCode(e);
  const status = e && e.status;
  if (status === 503 && code === "privy_login_disabled") return "社交登录暂未开放";
  if (status === 401 && code === "privy_token_invalid") return "登录凭证无效，请重试";
  if (status === 409 && code === "account_conflict") return "该账号关联了多个钱包用户，请联系我们";
  if (e && e.offline) return "连不上接口，请稍后再试。";
  if (isPrivyExit(e)) return "";
  if (isPrivyRateLimit(e)) return "请求过于频繁，请稍后再试";
  const m = (e && e.message) || "";
  return m ? "登录失败：" + m : "登录失败";
}
