"""官网「进入应用」入口测试。

覆盖：
- 已生成的中英文静态 HTML（导航 / 首屏 / 榜单页头 / 详情入口 / 壳页）
- 生成器模板再渲染后仍指向测试 App 的 Hash 路由
- site.js 不再给 App 链接追加 lang，也不再写旧域名
- _redirects 与 workers 的入口常量/映射
"""
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import build_site as bs  # noqa: E402

APP = "https://app.wakeloom.com"
APP_HOME = APP + "/#/auth/start"
OLD_APP = "https://app-test.wakeloom.com"
DETAIL_ADDR = "0xf1f9a438f2697381b4ac8eb283d6f4dd772d1245"


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


class GeneratedHtmlTest(unittest.TestCase):
    def assert_app_home(self, html, label):
        self.assertIn(f'href="{APP_HOME}"', html, label)
        self.assertNotIn(OLD_APP, html, label)
        self.assertNotIn("markets?tab=board", html, label)
        self.assertNotRegex(html, r"app-test\.wakeloom\.com[^\"'\s]*[?&]lang=", label)

    def test_home_pages_header_hero_and_steps(self):
        for lang, cta in (("zh", "进入应用"), ("en", "Open the app")):
            html = read(f"{lang}/index.html")
            self.assert_app_home(html, f"{lang} header")
            self.assertGreaterEqual(html.count(f'href="{APP_HOME}"'), 3, f"{lang} header + hero + steps")
            self.assertIn(f'href="{APP_HOME}">{cta}', html, lang)

    def test_leaderboard_header(self):
        for lang in ("zh", "en"):
            self.assert_app_home(read(f"{lang}/leaderboard/index.html"), f"{lang} leaderboard")

    def test_leader_detail_and_shell(self):
        for lang in ("zh", "en"):
            detail = read(f"{lang}/leader/{DETAIL_ADDR}/index.html")
            self.assert_app_home(detail, f"{lang} detail header")
            self.assertIn(f'href="{APP_HOME}?returnTo=/leader/{DETAIL_ADDR}"', detail, f"{lang} detail CTA")
            self.assertNotIn("leader?addr=", detail, f"{lang} detail old query")

            shell = read(f"{lang}/leader/_shell/index.html")
            self.assert_app_home(shell, f"{lang} shell header")
            self.assertIn(f'{APP_HOME}?returnTo=/leader/"+a', shell, f"{lang} shell detail base")

    def test_no_generated_page_uses_old_app_entry(self):
        for base in ("zh", "en"):
            for path in (ROOT / base).rglob("*.html"):
                html = path.read_text(encoding="utf-8")
                self.assertNotIn(OLD_APP, html, str(path))
                self.assertNotIn("markets?tab=board", html, str(path))


class GeneratorTemplateTest(unittest.TestCase):
    def test_helpers(self):
        self.assertEqual(bs.APP_HOME, APP_HOME)
        self.assertEqual(bs.app_route("leaders"), APP_HOME + "?returnTo=/leaders")
        self.assertEqual(bs.app_leader_url(DETAIL_ADDR.upper()), APP_HOME + f"?returnTo=/leader/{DETAIL_ADDR}")
        self.assertEqual(bs.app_start(""), APP_HOME)
        self.assertEqual(bs.app_start("/markets"), APP_HOME + "?returnTo=/markets")

    def test_page_template(self):
        html = bs.page("zh", "", "home", "<main></main>", [])
        self.assertIn(f'href="{APP_HOME}"', html)
        self.assertNotIn(OLD_APP, html)
        self.assertNotIn("tab=board", html)

    def test_home_leader_and_redirect_templates_render_new_entries(self):
        old_root = bs.ROOT
        with tempfile.TemporaryDirectory() as tmp:
            bs.ROOT = tmp
            try:
                data = {"ok": True, "as_of": None, "leaders": [], "wallets": {}}
                bs.home("zh", data)
                home = Path(tmp, "zh", "index.html").read_text(encoding="utf-8")
                self.assertGreaterEqual(home.count(f'href="{APP_HOME}"'), 3)
                self.assertNotIn(OLD_APP, home)
                self.assertNotIn("tab=board", home)

                detail = "0x" + "ab" * 20
                data = {
                    "details": {detail: {"metrics": {"win_rate": 0.5, "roi": 0.1, "max_drawdown": 0.05, "resolved_markets": 10}}},
                    "wallets": {detail: {}},
                    "as_of": "2026-11-20T00:00:00Z",
                }
                bs.leader("zh", detail, "2026-11-20T00:00:00Z", 1, data)
                page = Path(tmp, "zh", "leader", detail, "index.html").read_text(encoding="utf-8")
                self.assertIn(f'href="{APP_HOME}?returnTo=/leader/{detail}"', page)
                self.assertNotIn(OLD_APP, page)
                self.assertNotIn("leader?addr=", page)
                self.assertNotIn("tab=board", page)

                bs.write_redirects()
                redirects = Path(tmp, "_redirects").read_text(encoding="utf-8")
                self.assertIn(f"/board.html {APP_HOME}?returnTo=/leaders 301", redirects)
                self.assertIn(f"/markets.html {APP_HOME}?returnTo=/markets 301", redirects)
                self.assertIn(f"/login.html {APP_HOME} 301", redirects)
                self.assertIn(f"/overview.html {APP_HOME} 301", redirects)
                self.assertIn(f"/app {APP_HOME} 301", redirects)
                self.assertNotIn(OLD_APP, redirects)
                self.assertNotIn("tab=board", redirects)
            finally:
                bs.ROOT = old_root


class ClientAndDeploySourcesTest(unittest.TestCase):
    def test_site_js_does_not_append_lang_or_use_old_domain(self):
        js = read("site.js")
        self.assertIn("app.wakeloom.com", js)
        self.assertNotIn("app-test.wakeloom.com", js)
        self.assertNotIn('searchParams.set("lang"', js)
        self.assertIn('searchParams.delete("lang")', js)

    def test_redirects_file(self):
        rules = "\n".join(
            line for line in read("_redirects").splitlines()
            if line.strip() and not line.strip().startswith("#")
        )
        self.assertNotIn(OLD_APP, rules)
        self.assertNotIn("tab=board", rules)
        for expected in (
            f"/board.html {APP_HOME}?returnTo=/leaders 301",
            f"/leaders.html {APP_HOME}?returnTo=/leaders 301",
            f"/markets.html {APP_HOME}?returnTo=/markets 301",
            f"/overview.html {APP_HOME} 301",
            f"/login.html {APP_HOME} 301",
            f"/account.html {APP_HOME}?returnTo=/accounts 301",
            f"/config.html {APP_HOME}?returnTo=/connections 301",
            f"/app {APP_HOME} 301",
        ):
            self.assertIn(expected, rules)

    def test_worker_sources(self):
        for rel in ("workers/app-links.mjs", "workers/www.mjs", "workers/leader-page.mjs"):
            src = read(rel)
            self.assertNotIn(OLD_APP, src, rel)
            self.assertNotIn("tab=board", src, rel)

    def test_llms_excludes_app_subdomains(self):
        llms = read("llms.txt")
        self.assertNotIn("app.wakeloom.com", llms)
        self.assertNotIn("app-test.wakeloom.com", llms)


if __name__ == "__main__":
    unittest.main()
