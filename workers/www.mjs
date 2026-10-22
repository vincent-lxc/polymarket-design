/** 官网 Worker：把旧的 /app 前缀 301 到 app.wakeloom.com，路径和 query 原样保留。 */

export const APP_ORIGIN = "https://app.wakeloom.com";

/** 以前挂在官网根上的 App 页面，直接送到子域上的同名文件。 */
export const LEGACY_APP_PAGES = [
  "/account.html",
  "/board.html",
  "/config.html",
  "/health.html",
  "/leader-5c1e.html",
  "/leader-91d4.html",
  "/leader-avalon.html",
  "/leader-lunadegen.html",
  "/leader.html",
  "/leaders.html",
  "/login.html",
  "/overview.html",
  "/strategies.html",
];

/**
 * @param {URL|string} input
 * @returns {string|null} 需要 301 时返回绝对地址，否则 null
 */
export function appRedirect(input) {
  const url = typeof input === "string" ? new URL(input) : input;
  const path = url.pathname;
  let rest = null;
  if (path === "/app" || path === "/app/") rest = "/";
  else if (path.startsWith("/app/")) rest = path.slice("/app".length);
  else if (LEGACY_APP_PAGES.includes(path)) rest = path;
  if (rest == null) return null;
  return APP_ORIGIN + rest + url.search;
}

export default {
  async fetch(request, env) {
    const dest = appRedirect(new URL(request.url));
    if (dest) return Response.redirect(dest, 301);
    return env.ASSETS.fetch(request);
  },
};
