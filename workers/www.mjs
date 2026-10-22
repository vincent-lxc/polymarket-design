/** 官网 Worker：旧 /app 前缀 301 到 app.wakeloom.com；钱包页避免 /leader/_shell 自跳。 */

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
  "/markets.html",
  "/overview.html",
  "/strategies.html",
];

const SHELL_PATH = /^\/(en|zh)\/leader\/_shell(?:\/(?:index\.html)?)?$/;
const WALLET_PATH = /^\/(en|zh)\/leader\/(0x[a-fA-F0-9]{40})(\/)?$/;

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
  if (rest === "/board" || rest === "/board/" || rest === "/board.html") {
    const dest = new URL("/markets", APP_ORIGIN);
    url.searchParams.forEach((value, key) => {
      if (key !== "tab") dest.searchParams.append(key, value);
    });
    dest.searchParams.set("tab", "board");
    return dest.toString();
  }
  return APP_ORIGIN + rest + url.search;
}

/**
 * 钱包页路由。
 * /leader/_shell 不能再作为 :addr 的改写目标，否则 auto-trailing-slash
 * 会把 index.html 308 回 /_shell/，和占位规则互相打转。
 * @param {string} pathname
 * @returns {{action:"redirect",to:string,status:number}|{action:"wallet",lang:string,addr:string}|null}
 */
export function leaderDecision(pathname) {
  const shell = pathname.match(SHELL_PATH);
  if (shell) {
    return { action: "redirect", to: `/${shell[1]}/leaderboard/`, status: 301 };
  }
  const m = pathname.match(WALLET_PATH);
  if (!m) return null;
  const lang = m[1];
  const addr = m[2].toLowerCase();
  const slash = !!m[3];
  if (!slash || m[2] !== addr) {
    return { action: "redirect", to: `/${lang}/leader/${addr}/`, status: 301 };
  }
  return { action: "wallet", lang, addr };
}

/** 3xx 且 Location 落在壳目录上：这是旧规则的自跳，不能原样返回给浏览器。 */
export function isShellRedirect(status, location, base) {
  if (status < 300 || status >= 400 || !location) return false;
  let path = "";
  try {
    path = new URL(location, base).pathname;
  } catch (e) {
    return false;
  }
  return /^\/(en|zh)\/leader\/_shell(?:\/|$)/.test(path);
}

async function shellDocument(request, env, lang) {
  const origin = new URL(request.url).origin;
  const indexUrl = origin + `/${lang}/leader/_shell/index.html`;
  let res = await env.ASSETS.fetch(new Request(indexUrl, { redirect: "manual" }));
  if (res.status >= 300 && res.status < 400) {
    const next = new URL(res.headers.get("Location") || `/${lang}/leader/_shell/`, origin);
    res = await env.ASSETS.fetch(new Request(next.toString(), { redirect: "manual" }));
  }
  if (!res.ok) return new Response("这个地址的页面暂时不可用。", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const headers = new Headers(res.headers);
  headers.delete("Location");
  headers.set("Cache-Control", "public, max-age=60");
  headers.set("X-Wakeloom-Leader", "shell");
  return new Response(res.body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const dest = appRedirect(url);
    if (dest) return Response.redirect(dest, 301);
    const lead = leaderDecision(url.pathname);
    if (lead && lead.action === "redirect") {
      return Response.redirect(url.origin + lead.to + url.search, lead.status);
    }
    if (lead && lead.action === "wallet") {
      const res = await env.ASSETS.fetch(request);
      /* 有静态页就用静态页。没有，或资产层仍把请求 3xx 到壳目录，改返回壳正文，地址栏保持 /leader/{addr}/。 */
      if (res.status === 404 || isShellRedirect(res.status, res.headers.get("Location"), url.origin)) {
        return shellDocument(request, env, lead.lang);
      }
      return res;
    }
    return env.ASSETS.fetch(request);
  },
};
