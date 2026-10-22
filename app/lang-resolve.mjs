/** App 语言：手动选择（wl_lang）优先，其次 ?lang=，最后才看浏览器语言。与 app/lang.js 一致。 */
export function resolveAppLang(input) {
  var stored = input.stored;
  var query = input.query;
  var browser = input.browser;
  if (stored === "zh" || stored === "en") return stored;
  if (query === "zh" || query === "en") return query;
  return browser === "zh" ? "zh" : "en";
}
