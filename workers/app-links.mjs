/** 官网进入目标 App 的唯一来源。
 *  目标 App 用 HashRouter，所有入口统一先进发起页 /#/auth/start，站内目标放在 returnTo：
 *    通用：/#/auth/start
 *    分段：/#/auth/start?returnTo=/markets
 *    详情：/#/auth/start?returnTo=/leader/<小写地址>
 *  应用没有 lang 查询或 i18n 入口，所有入口都不带 lang。
 */

export const APP_ORIGIN = "https://app.wakeloom.com";
export const APP_START_PATH = "/#/auth/start";
export const APP_HOME = APP_ORIGIN + APP_START_PATH;

/** 进入应用的唯一入口。returnTo 只接受以 / 开头的站内路径；保留路径斜杠，其余按查询参数编码。 */
export function appStart(returnTo) {
  const p = returnTo == null ? "" : String(returnTo).trim();
  if (!p.startsWith("/")) return APP_HOME;
  return `${APP_HOME}?returnTo=${encodeURIComponent(p).replace(/%2F/gi, "/")}`;
}

/** 分段入口。path 不带 #，例如 markets、leaders；统一经发起页并带 returnTo。 */
export function appRoute(path = "") {
  const p = String(path == null ? "" : path).replace(/^\/+|\/+$/g, "");
  return p ? appStart("/" + p) : APP_HOME;
}

/** 钱包详情：经发起页，returnTo=/leader/<小写地址>，不再直接落 #/leader/。 */
export function appLeaderUrl(addr) {
  return appStart("/leader/" + String(addr || "").toLowerCase());
}

/** 壳页 JS 动态详情前缀：appLeaderBase() + addr。 */
export function appLeaderBase() {
  return APP_HOME + "?returnTo=/leader/";
}

/** 旧官网根路径（或 /app 前缀）上的 App 页面 → 发起页的 returnTo 路径。
 *  空字符串表示通用发起页（/login.html、/overview.html 不再落到 #/login 或 #/overview）。 */
export const LEGACY_APP_ROUTES = Object.freeze({
  "/account.html": "/accounts",
  "/board.html": "/leaders",
  "/config.html": "/connections",
  "/health.html": "/health",
  "/leader-5c1e.html": "/leaders",
  "/leader-91d4.html": "/leaders",
  "/leader-avalon.html": "/leaders",
  "/leader-lunadegen.html": "/leaders",
  "/leader.html": "/leaders",
  "/leaders.html": "/leaders",
  "/login.html": "",
  "/markets.html": "/markets",
  "/overview.html": "",
  "/strategies.html": "/strategies",
});

export function legacyAppRoute(pathname) {
  return Object.prototype.hasOwnProperty.call(LEGACY_APP_ROUTES, pathname)
    ? LEGACY_APP_ROUTES[pathname]
    : null;
}
