/** 官网 Worker：旧 /app 前缀 301 到 app.wakeloom.com。
 *  leader 详情在返回 HTML 前向 BFF 取数（服务端渲染）。
 *  /sitemap.xml 只消费 BFF 门槛清单，失败返回 503，不回落静态大表。
 *  IndexNow 密钥和 /llms.txt 在资产层之前返回，避免被重定向或改写。 */

import { applyLeaderShell, leaderIndexable } from "./leader-page.mjs";
import { loadSitemapLeaders, renderSitemap } from "./sitemap-bff.mjs";
import { applyPin, mergePinnedSitemap } from "./leader-pin.mjs";

export const BFF_ORIGIN = "https://api.wakeloom.com";

export const APP_ORIGIN = "https://app.wakeloom.com";

/** IndexNow 密钥。正文必须与根目录同名 .txt 完全一致，不能多一个换行。 */
export const INDEXNOW_KEY = "fc81fd20e5cda8d8f5d37c7bf054a1cd";

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
const WALLET_PATH = /^\/(en|zh)\/leader\/(0x[a-fA-F0-9]{40})(\/)?$/i;

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

/** 不带语言前缀的站内栏目，301 到中文版（根路径 / 的语言选择、/leader/、根目录文件都不在这里）。 */
const BARE_SECTIONS = ["leaderboard", "how-it-works", "copy-trading", "faq", "risk", "privacy", "terms", "about"];
const BARE_PATH = new RegExp(`^/(${BARE_SECTIONS.join("|")})(?:/(?:index\\.html)?)?$`);

/**
 * @param {string} pathname
 * @returns {string|null} 目标路径
 */
export function barePathRedirect(pathname) {
  const m = pathname.match(BARE_PATH);
  return m ? `/zh/${m[1]}/` : null;
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

/** 格式不像地址的 /leader/… 不能落到静态壳，直接 404。合法地址由 leaderDecision 处理。 */
export function unmatchedLeader(pathname) {
  const m = pathname.match(/^\/(en|zh)\/leader\/([^/]+)\/?$/);
  if (!m) return null;
  if (m[2] === "_shell") return null;
  if (/^0x[a-fA-F0-9]{40}$/i.test(m[2])) return null;
  return { lang: m[1] };
}

async function readShell(request, env, lang) {
  const origin = new URL(request.url).origin;
  const indexUrl = origin + `/${lang}/leader/_shell/index.html`;
  let res = await env.ASSETS.fetch(new Request(indexUrl, { redirect: "manual" }));
  if (res.status >= 300 && res.status < 400) {
    const next = new URL(res.headers.get("Location") || `/${lang}/leader/_shell/`, origin);
    res = await env.ASSETS.fetch(new Request(next.toString(), { redirect: "manual" }));
  }
  if (!res || !res.ok) {
    const err = new Error("leader shell unavailable");
    err.code = "upstream";
    throw err;
  }
  return res.text();
}

export async function fetchPublicLeader(env, addr) {
  const fetchImpl = (env && env.BFF_FETCH) || fetch;
  const origin = String((env && env.BFF_ORIGIN) || BFF_ORIGIN).replace(/\/$/, "");
  let res;
  try {
    res = await fetchImpl(origin + "/v1/public/leaders/" + addr, {
      headers: { accept: "application/json" },
      redirect: "manual",
    });
  } catch (e) {
    const err = new Error("bff leader network");
    err.code = "upstream";
    throw err;
  }
  if (!res || res.status === 404 || res.status === 400) {
    const err = new Error("missing leader");
    err.code = "missing";
    throw err;
  }
  if (res.status !== 200) {
    const err = new Error("bff leader http");
    err.code = "upstream";
    throw err;
  }
  let body;
  try {
    body = await res.json();
  } catch (e) {
    const err = new Error("bff leader json");
    err.code = "upstream";
    throw err;
  }
  const leader = body && body.leader;
  if (!leader || typeof leader !== "object" || String(leader.address || "").toLowerCase() !== addr) {
    const err = new Error("missing leader");
    err.code = "missing";
    throw err;
  }
  return leader;
}

function textResponse(body, status, method, headers) {
  return new Response(method === "HEAD" ? null : body, { status, headers });
}

function leaderNotFound(lang, method) {
  const title = lang === "en" ? "Not found" : "没有这个地址";
  const msg = lang === "en" ? "No public data for this address." : "没有这个地址的公开数据。";
  const html = `<!doctype html><html lang="${lang === "en" ? "en" : "zh-CN"}"><head><meta charset="utf-8"><title>${title}</title><meta name="robots" content="noindex,follow"></head><body><p>${msg}</p></body></html>`;
  return textResponse(html, 404, method, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex, follow",
  });
}

function leaderUnavailable(lang, method) {
  const msg = lang === "en" ? "This page is temporarily unavailable.\n" : "这个地址的页面暂时不可用。\n";
  return textResponse(msg, 503, method, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
}

/** 方案 A：格式非法、BFF 404、或返回里没有这个地址，都是 HTTP 404。上游故障是 503，不拿静态快照顶上。 */
export async function leaderPage(request, env, lang, addr) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("method not allowed\n", 405, request.method, {
      "content-type": "text/plain; charset=utf-8",
      allow: "GET, HEAD",
    });
  }
  try {
    const leader = applyPin(await fetchPublicLeader(env, addr), addr);
    const shell = await readShell(request, env, lang);
    const html = applyLeaderShell(shell, lang, addr, leader);
    const indexable = leaderIndexable(leader);
    const headers = {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-wakeloom-leader": "ssr",
      "x-wakeloom-indexable": indexable ? "true" : "false",
    };
    if (!indexable) headers["x-robots-tag"] = "noindex, follow";
    return textResponse(html, 200, request.method, headers);
  } catch (e) {
    if (e && e.code === "missing") return leaderNotFound(lang, request.method);
    return leaderUnavailable(lang, request.method);
  }
}

/** 只在 Worker 里生成。不读取仓库里的 sitemap.xml。 */
export async function sitemapResponse(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("method not allowed\n", 405, request.method, {
      "content-type": "text/plain; charset=utf-8",
      allow: "GET, HEAD",
    });
  }
  try {
    const leaders = await loadSitemapLeaders(env);
    const xml = renderSitemap(mergePinnedSitemap(leaders));
    return textResponse(xml, 200, request.method, {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-wakeloom-sitemap": "bff",
    });
  } catch (e) {
    return textResponse("sitemap unavailable\n", 503, request.method, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-wakeloom-sitemap": "error",
    });
  }
}

function plain(body, status, cache, method) {
  return new Response(method === "HEAD" ? null : body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": cache,
      "x-content-type-options": "nosniff",
    },
  });
}

/** 根路径密钥文件。命中后不再交给资产层，因此不会被 trailing-slash 或 _redirects 改写。 */
export function indexNowResponse(request) {
  const url = new URL(request.url);
  if (url.pathname !== `/${INDEXNOW_KEY}.txt`) return null;
  return plain(INDEXNOW_KEY, 200, "public, max-age=86400", request.method);
}

/** /llms.txt 原样返回。资产层若给出 3xx，不把 Location 交给客户端。 */
export async function llmsResponse(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/llms.txt") return null;
  const assetUrl = new URL("/llms.txt", url.origin);
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET", redirect: "manual" }));
  if (!res || res.status !== 200) return plain("not found\n", 404, "no-store", request.method);
  const body = await res.text();
  return plain(body, 200, "public, max-age=3600", request.method);
}

export default {
  async fetch(request, env) {
    const keyed = indexNowResponse(request);
    if (keyed) return keyed;
    const llms = await llmsResponse(request, env);
    if (llms) return llms;
    const url = new URL(request.url);
    const dest = appRedirect(url);
    if (dest) return Response.redirect(dest, 301);
    if (url.pathname === "/sitemap.xml" || url.pathname === "/sitemap.xml/") {
      return sitemapResponse(request, env);
    }
    const bare = barePathRedirect(url.pathname);
    if (bare) return Response.redirect(url.origin + bare + url.search, 301);
    const lead = leaderDecision(url.pathname);
    if (lead && lead.action === "redirect") {
      return Response.redirect(url.origin + lead.to + url.search, lead.status);
    }
    if (lead && lead.action === "wallet") {
      return leaderPage(request, env, lead.lang, lead.addr);
    }
    const miss = unmatchedLeader(url.pathname);
    if (miss) return leaderNotFound(miss.lang, request.method);
    return env.ASSETS.fetch(request);
  },
};
