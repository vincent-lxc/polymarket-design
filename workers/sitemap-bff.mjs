/** www sitemap：静态页保留，leader 只来自 BFF GET /v1/public/sitemap。失败由调用方返回 503，不读旧文件。 */

export const BFF_ORIGIN = "https://api.wakeloom.com";
export const SITE = "https://www.wakeloom.com";
export const SITEMAP_PAGE_LIMIT = 100;
export const SITEMAP_MAX_PAGES = 30;

/** 与原先 sitemap 里非 leader 的条目一致。leader 不再写在这里。 */
export const STATIC_PAGES = [
  { loc: `${SITE}/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/zh/`, lastmod: "2026-10-22T11:24:55Z" },
  { loc: `${SITE}/en/`, lastmod: "2026-10-22T11:24:55Z" },
  { loc: `${SITE}/zh/leaderboard/`, lastmod: "2026-10-22T11:24:55Z" },
  { loc: `${SITE}/en/leaderboard/`, lastmod: "2026-10-22T11:24:55Z" },
  { loc: `${SITE}/zh/how-it-works/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/en/how-it-works/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/zh/copy-trading/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/en/copy-trading/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/zh/faq/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/en/faq/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/zh/risk/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/en/risk/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/zh/privacy/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/en/privacy/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/zh/terms/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/en/terms/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/zh/about/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/en/about/`, lastmod: "2026-10-21" },
  { loc: `${SITE}/zh/guides/`, lastmod: "2026-10-30" },
  { loc: `${SITE}/en/guides/`, lastmod: "2026-10-30" },
  { loc: `${SITE}/zh/guides/how-to-pick-polymarket-traders/`, lastmod: "2026-10-30" },
  { loc: `${SITE}/en/guides/how-to-pick-polymarket-traders/`, lastmod: "2026-10-30" },
  { loc: `${SITE}/zh/guides/polymarket-trader-data-checklist/`, lastmod: "2026-10-30" },
  { loc: `${SITE}/en/guides/polymarket-trader-data-checklist/`, lastmod: "2026-10-30" },
  { loc: `${SITE}/zh/guides/polymarket-leaderboard-copy-pitfalls/`, lastmod: "2026-10-30" },
  { loc: `${SITE}/en/guides/polymarket-leaderboard-copy-pitfalls/`, lastmod: "2026-10-30" },
];

let sitemapCache = null;

export function resetSitemapCache() {
  sitemapCache = null;
}

function escXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[c]);
}

export function alternatesFor(loc) {
  const path = new URL(loc).pathname;
  if (path === "/") {
    return { zh: `${SITE}/zh/`, en: `${SITE}/en/` };
  }
  const zhPath = path.startsWith("/en/") ? "/zh/" + path.slice(4) : path;
  const enPath = path.startsWith("/zh/") ? "/en/" + path.slice(4) : path;
  return { zh: SITE + zhPath, en: SITE + enPath };
}

function lastmodOk(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value);
}

function urlEntry(loc, lastmod) {
  const alt = alternatesFor(loc);
  const mod = lastmodOk(lastmod) ? `<lastmod>${escXml(lastmod)}</lastmod>` : "";
  return `<url><loc>${escXml(loc)}</loc>${mod}<xhtml:link rel="alternate" hreflang="zh-CN" href="${escXml(alt.zh)}"/><xhtml:link rel="alternate" hreflang="en" href="${escXml(alt.en)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/></url>`;
}

export function renderSitemap(leaders) {
  const rows = STATIC_PAGES.map((p) => urlEntry(p.loc, p.lastmod));
  for (const row of leaders || []) {
    const addr = String(row.address || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(addr)) continue;
    const zh = `${SITE}/zh/leader/${addr}/`;
    const en = `${SITE}/en/leader/${addr}/`;
    rows.push(urlEntry(zh, row.updated_at));
    rows.push(urlEntry(en, row.updated_at));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows.join("\n")}\n</urlset>\n`;
  if (/app\.wakeloom\.com/i.test(xml)) throw new Error("sitemap included app host");
  return xml;
}

/**
 * 按 next_offset 翻页。next_offset 为 null 时停，并收下这一页的 leaders。
 * 游标不前进或超过页数上限时抛错，避免交出半份清单。
 */
export async function loadSitemapLeaders(env) {
  const custom = env && env.BFF_FETCH;
  const fetchImpl = custom || fetch;
  const origin = String((env && env.BFF_ORIGIN) || BFF_ORIGIN).replace(/\/$/, "");
  if (!custom && sitemapCache && Date.now() - sitemapCache.at < 60_000) return sitemapCache.leaders;

  const leaders = [];
  const seen = new Set();
  let offset = 0;
  for (let page = 0; page < SITEMAP_MAX_PAGES; page++) {
    const url = `${origin}/v1/public/sitemap?limit=${SITEMAP_PAGE_LIMIT}&offset=${offset}`;
    const res = await fetchImpl(url, { headers: { accept: "application/json" }, redirect: "manual" });
    if (!res || res.status !== 200) throw new Error("bff sitemap http");
    const body = await res.json();
    const box = body && body.sitemap;
    if (!box || !Array.isArray(box.leaders)) throw new Error("bff sitemap shape");
    for (const row of box.leaders) {
      if (!row || typeof row !== "object") continue;
      const addr = String(row.address || "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(addr) || seen.has(addr)) continue;
      seen.add(addr);
      leaders.push({ address: addr, updated_at: typeof row.updated_at === "string" ? row.updated_at : null });
    }
    const next = box.next_offset;
    if (next == null || box.leaders.length === 0) {
      if (!custom) sitemapCache = { at: Date.now(), leaders };
      return leaders;
    }
    if (typeof next !== "number" || !Number.isFinite(next) || next <= offset) throw new Error("bff sitemap cursor");
    offset = next;
  }
  throw new Error("bff sitemap truncated");
}
