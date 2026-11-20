"""File-based checks for the three scoped English SEO pages."""
import html
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://www.wakeloom.com"
APP = "https://app-test.wakeloom.com"
APP_HOME = APP + "/#/auth/start"
PAGES = [
    "/en/copy-trading/",
    "/en/guides/how-to-pick-polymarket-traders/",
    "/en/guides/polymarket-leaderboard-copy-pitfalls/",
]
GUIDE_MD = Path("/workspace/projects/wakeloom/市场/guides/en")
HAS_MAIN = subprocess.run(["git", "rev-parse", "--verify", "origin/main"], cwd=ROOT, capture_output=True).returncode == 0


def normalize_app_urls(source):
    """把旧 App 入口换成当前目标测试 App 的 Hash 路由，用于确认页面只改了入口。"""
    source = re.sub(
        r"https://app\.wakeloom\.com/markets\?tab=board&lang=(?:zh|en)",
        APP_HOME,
        source,
    )
    source = source.replace("https://app.wakeloom.com/board", APP_HOME)
    source = re.sub(
        r"https://app\.wakeloom\.com/leader\?addr=(0x[a-fA-F0-9]{40})(?:&(?:amp;)?lang=(?:zh|en))?",
        lambda m: APP + "/#/auth/start?returnTo=/leader/" + m.group(1).lower(),
        source,
    )
    source = re.sub(
        r'"https://app\.wakeloom\.com/leader\?addr="\+a\+"&lang=(?:zh|en)"',
        '"' + APP + '/#/auth/start?returnTo=/leader/"+a',
        source,
    )
    return source
EXPECTED = {
    PAGES[0]: ("Paper-Trade Copy Trading Simulator for Polymarket | Wakeloom", "Wakeloom paper-trades a wallet after each observed fill, walking the order book as it stands at that moment. It logs the price gap, delay and estimated fees. Not a historical backtest. Paper trading only; no real orders."),
    PAGES[1]: ("How to Evaluate a Polymarket Trader Before Copying | Wakeloom", "Evaluate who to copy on Polymarket using resolved markets, the wallet's main categories, drawdown and entry price. Rule out one-big-bet, wash-traded and market-maker wallets first. Past results don't predict future ones."),
    PAGES[2]: ("Copying the Polymarket Leaderboard: Big Bets, Market Makers, Delay and Slippage | Wakeloom", "Copy trading on Polymarket can lose money even when you follow every fill: later entries, thin books, delay and costs. Also watch one lucky big bet, unrealized gains in the rank, market makers and wash traders."),
}


def page(route):
    return (ROOT / route.lstrip("/") / "index.html").read_text()


def text(fragment):
    return html.unescape(re.sub(r"<[^>]*>", "", fragment)).strip()


def metadata(source, name, prop=False):
    kind = "property" if prop else "name"
    return html.unescape(re.search(rf'<meta {kind}="{re.escape(name)}" content="([^"]*)">', source).group(1))


def graph(source):
    block = re.search(r'<script type="application/ld\+json">(.*?)</script>', source, re.S)
    return json.loads(block.group(1))["@graph"]


def node(nodes, kind):
    return next(x for x in nodes if x.get("@type") == kind)


def section(source, cls):
    return re.search(rf'<section class="{re.escape(cls)}".*?</section>', source, re.S).group(0)


class SeoThreePages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pages = {route: page(route) for route in PAGES}

    def test_metadata_routes_and_schema(self):
        titles, descriptions = set(), set()
        for route, source in self.pages.items():
            with self.subTest(route=route):
                title = text(re.search(r"<title>(.*?)</title>", source).group(1))
                desc = metadata(source, "description")
                self.assertEqual(EXPECTED[route], (title, desc))
                self.assertEqual(title, metadata(source, "og:title", True))
                self.assertEqual(desc, metadata(source, "og:description", True))
                self.assertEqual(f'<link rel="canonical" href="{SITE}{route}">', re.search(r'<link rel="canonical"[^>]+>', source).group(0))
                zh = route.replace("/en/", "/zh/", 1)
                for lang, target in (("zh-CN", zh), ("en", route), ("x-default", route)):
                    self.assertIn(f'<link rel="alternate" hreflang="{lang}" href="{SITE}{target}">', source)
                self.assertIn(f'href="{zh}" hreflang="zh-CN"', source)
                nodes = graph(source)
                article = node(nodes, "Article")
                self.assertEqual(text(re.search(r"<h1>(.*?)</h1>", source).group(1)), article["headline"])
                self.assertEqual(desc, article["description"])
                self.assertEqual("2026-11-16", article["dateModified"])
                titles.add(title)
                descriptions.add(desc)
        self.assertEqual(3, len(titles))
        self.assertEqual(3, len(descriptions))
        self.assertEqual("2026-10-21", node(graph(self.pages[PAGES[0]]), "Article")["datePublished"])
        self.assertIn("SoftwareApplication", {x.get("@type") for x in graph(self.pages[PAGES[0]])})

    def test_faq_schema_matches_visible_answers(self):
        for route in PAGES[1:]:
            with self.subTest(route=route):
                visible = [(text(q), text(a)) for q, a in re.findall(
                    r'<details class="card qa"><summary><h2>(.*?)</h2><i>\+</i></summary><p>(.*?)</p></details>',
                    self.pages[route], re.S)]
                schema = [(item["name"], item["acceptedAnswer"]["text"])
                          for item in node(graph(self.pages[route]), "FAQPage")["mainEntity"]]
                self.assertEqual(visible, schema)
                self.assertEqual(4, len(visible))

    def test_links_in_body_and_existing_targets(self):
        required = {
            PAGES[0]: {PAGES[1], PAGES[2], "/en/how-it-works/", "/en/faq/#faq-delay-slippage", "/en/risk/", "/en/leaderboard/"},
            PAGES[1]: {PAGES[0], PAGES[2], "/en/how-it-works/", "/en/faq/#faq-leaderboard-first", "/en/research/leaderboard-data-quality/", "/en/guides/polymarket-trader-data-checklist/", "/en/risk/"},
            PAGES[2]: {PAGES[0], PAGES[1], "/en/how-it-works/", "/en/faq/#faq-delay-slippage", "/en/faq/#faq-follow-close", "/en/research/leaderboard-data-quality/", "/en/guides/polymarket-trader-data-checklist/", "/en/risk/"},
        }
        for route, source in self.pages.items():
            main = re.search(r"<main>(.*?)</main>", source, re.S).group(1)
            links = set(re.findall(r'<a href="(/en/[^\"]+)"', main))
            self.assertTrue(required[route] <= links, (route, required[route] - links))
            for link in links:
                path, _, anchor = link.partition("#")
                target = ROOT / path.lstrip("/") / "index.html"
                self.assertTrue(target.is_file(), (route, link))
                if anchor:
                    self.assertIn(f'id="{anchor}"', target.read_text())
        faq = page("/en/faq/")
        for anchor in ("faq-delay-slippage", "faq-leaderboard-first", "faq-follow-close"):
            self.assertIn(f'id="{anchor}"', faq)

    def test_copy_structure_and_claims(self):
        source = self.pages[PAGES[0]]
        self.assertIn('<section class="card prose"><h2>How it runs</h2><ol>', source)
        self.assertIn('<section class="card prose"><h2>Limitations</h2><ul>', source)
        self.assertIn('data-source="copy-trading"', source)
        self.assertIn('data-waitlist="on"', source)
        self.assertIn(f'href="{APP_HOME}"', source)
        self.assertNotIn("app.wakeloom.com", source)
        self.assertNotIn("tab=board", source)
        self.assertNotIn('<p class="mu sm">' + metadata(source, "description") + '</p>', source)
        self.assertIn("This skip applies when copying a leader&#x27;s entry.", source)
        self.assertIn("A dated, reviewable sample of those paper logs is not published", source)
        if HAS_MAIN:
            original = subprocess.check_output(["git", "show", "origin/main:en/copy-trading/index.html"], cwd=ROOT, text=True)
            original = normalize_app_urls(original)
            for pattern in (r'<div class="pv".*?</div></div><script src="/site-waitlist.js\?v=1" defer></script>',
                            r'<header class="top">.*?</header>', r'<footer class="ft">.*?</footer>',
                            r'<section class="card wl-card wl-gate" id="notify".*?</section>'):
                self.assertEqual(re.search(pattern, original, re.S).group(0), re.search(pattern, source, re.S).group(0))

    def test_guide_sources_and_preserved_shell(self):
        for route, name, form in ((PAGES[1], "01-how-to-pick-polymarket-traders-en.md", "guide-pick-traders"),
                                  (PAGES[2], "03-polymarket-leaderboard-copy-pitfalls-en.md", "guide-copy-pitfalls")):
            source = self.pages[route]
            if (GUIDE_MD / name).is_file():
                md = (GUIDE_MD / name).read_text()
                self.assertIn(metadata(source, "description"), md)
                self.assertIn("## Further reading", md)
                self.assertIn("- [Paper-trade copy trading for Polymarket](/en/copy-trading/)", md)
            self.assertIn('data-source="' + form + '"', source)
            self.assertIn("Product prototype. The live interface may differ.", source)
            self.assertIn('<img src="/assets/guides/', source)
            self.assertIn('data-waitlist="on"', source)
            if HAS_MAIN:
                original = subprocess.check_output(["git", "show", f"origin/main:{route.lstrip('/')}index.html"], cwd=ROOT, text=True)
                original = normalize_app_urls(original)
                for pattern in (r'<div class="pv".*?</div></div><script src="/site-waitlist.js\?v=1" defer></script>',
                                r'<header class="top">.*?</header>', r'<footer class="ft">.*?</footer>',
                                r'<section class="card wl-card wl-gate g-cta".*?</section>'):
                    self.assertEqual(re.search(pattern, original, re.S).group(0), re.search(pattern, source, re.S).group(0))

    def test_no_forbidden_claims_and_diff_scope(self):
        banned = r'worth copying|worth following|traders to follow|guaranteed|\balpha\b|PolymarketScan|schematic|示意图'
        for route, source in self.pages.items():
            main = re.search(r"<main>(.*?)</main>", source, re.S).group(1)
            visible = text(main)
            self.assertIsNone(re.search(banned, visible, re.I), route)
            self.assertIsNone(re.search(r'\b(?:7-day|seven-day) (?:backtest|replay)', visible, re.I), route)
            self.assertIsNone(re.search(r'\b\d+(?:\.\d+)?%\b.*\b(?:copier|follower) (?:win|loss) rate', visible, re.I), route)
            self.assertTrue(set(re.findall(r"\b\d+(?:\.\d+)?%", visible)) <= {"3%"}, route)
            self.assertNotIn("Live copy trading is available", visible)
            self.assertNotIn("automatically recommends", visible)
            self.assertIn("paper", visible.lower())
        for route in PAGES[1:]:
            visible = text(self.pages[route]).lower()
            self.assertNotIn("timestamps match", visible)
            self.assertNotIn("website and the app read the same data", visible)
            self.assertNotIn("website and app read the same data", visible)
        if HAS_MAIN:
            # 本次改动只允许替换 App 入口；三篇英文 SEO 页仍须在改动集合里。
            changed = subprocess.check_output(["git", "diff", "--name-only", "origin/main", "--", "*.html"], cwd=ROOT, text=True).splitlines()
            for route in PAGES:
                self.assertIn(route.lstrip("/") + "index.html", changed)
            for rel in changed:
                original = subprocess.check_output(["git", "show", f"origin/main:{rel}"], cwd=ROOT, text=True)
                self.assertEqual(normalize_app_urls(original), (ROOT / rel).read_text(), rel)


if __name__ == "__main__":
    unittest.main()
