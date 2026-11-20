/** 官网进入目标测试 App 的唯一来源。
 *  目标 App 用 HashRouter：/#/overview、/#/leaders、/#/leader/<addr>、/#/markets 等。
 *  应用没有 lang 查询或 i18n 入口，所有入口都不带 lang。
 */

export const APP_ORIGIN = "https://app-test.wakeloom.com";
export const APP_HOME = APP_ORIGIN + "/#/overview";

/** App Hash 路由。path 不带 #，例如 overview、leader/0x…。 */
export function appRoute(hashPath = "overview") {
  return `${APP_ORIGIN}/#/${String(hashPath).replace(/^\/+|\/+$/g, "")}`;
}

/** 钱包详情：地址是 Hash 路径参数，不是 ?addr=。 */
export function appLeaderBase() {
  return `${APP_ORIGIN}/#/leader/`;
}

export function appLeaderUrl(addr) {
  return appLeaderBase() + String(addr || "").toLowerCase();
}

/** 旧官网根路径（或 /app 前缀）上的 App 页面 → 目标 App 的 Hash 路由。 */
export const LEGACY_APP_ROUTES = Object.freeze({
  "/account.html": "accounts",
  "/board.html": "leaders",
  "/config.html": "connections",
  "/health.html": "health",
  "/leader-5c1e.html": "leaders",
  "/leader-91d4.html": "leaders",
  "/leader-avalon.html": "leaders",
  "/leader-lunadegen.html": "leaders",
  "/leader.html": "leaders",
  "/leaders.html": "leaders",
  "/login.html": "login",
  "/markets.html": "markets",
  "/overview.html": "overview",
  "/strategies.html": "strategies",
});

export function legacyAppRoute(pathname) {
  return Object.prototype.hasOwnProperty.call(LEGACY_APP_ROUTES, pathname)
    ? LEGACY_APP_ROUTES[pathname]
    : null;
}
