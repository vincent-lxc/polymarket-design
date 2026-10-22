/* 市场名外链。只使用接口对象上的 event_slug 或 slug，不从标题推测。
   没有合法 slug 时返回转义后的纯文本。 */
(function (g) {
  var SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,200}$/;
  var ICON = '<svg class="ext" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" d="M4.2 2H2.6A1.1 1.1 0 0 0 1.5 3.1v6.3A1.1 1.1 0 0 0 2.6 10.5h6.3A1.1 1.1 0 0 0 10 9.4V7.8M6.2 1.5h4.3V5.8M10.2 1.8 5.5 6.5"/></svg>';
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pick(row) {
    if (!row || typeof row !== "object") return "";
    var ev = row.event_slug;
    var sl = row.slug;
    if (typeof ev === "string" && SLUG.test(ev)) return ev;
    if (typeof sl === "string" && SLUG.test(sl)) return sl;
    return "";
  }
  function href(slug) {
    return "https://polymarket.com/event/" + encodeURIComponent(slug);
  }
  function html(name, row) {
    var text = name == null || String(name).trim() === "" ? "未命名市场" : String(name);
    var safe = esc(text);
    var slug = pick(row);
    if (!slug) return safe;
    return '<a class="mkt" href="' + href(slug) + '" target="_blank" rel="noopener noreferrer">' + safe + ICON + "</a>";
  }
  g.PMMarket = { pick: pick, href: href, html: html };
})(typeof globalThis !== "undefined" ? globalThis : this);
