"""Offline fixtures for the www leaderboard index and generated pages."""
import json
import os
import re
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
import build_site as bs


def leader(n, **extra):
    return {"address": f"0x{n:040x}", "smart_score": n, "metrics": {}, **extra}


class LeaderboardPagesTest(unittest.TestCase):
    def test_load_sitemap_gate_sort_dedup_and_keep_top_50(self):
        first = [leader(n) for n in range(1, 51)]
        all_rows = [leader(n) for n in range(1, 106)]
        all_rows[1]["indexable"] = False
        all_rows[2]["indexable"] = "true"
        sitemap = [{"address": l["address"]} for l in all_rows]
        sitemap[3]["indexable"] = False
        sitemap[4]["indexable"] = True
        calls = []

        def fake_get(path):
            calls.append(path)
            if path == bs.LB_PATH:
                return {"leaderboard": {"leaders": first, "as_of": "2026-11-02T00:00:00Z"}}
            if path.startswith("/v1/public/sitemap?"):
                return {"sitemap": {"leaders": sitemap, "next_offset": None}}
            if "limit=100&offset=0" in path:
                return {"leaderboard": {"leaders": all_rows[:100], "next_offset": 100}}
            if "limit=100&offset=100" in path:
                return {"leaderboard": {"leaders": all_rows[100:] + [all_rows[0]], "next_offset": None}}
            return {}

        with patch.object(bs, "get", side_effect=fake_get):
            data = bs.load()
        self.assertEqual(len(data["leaders"]), 50)
        self.assertTrue(data["sitemap_ok"])
        self.assertEqual(len(data["pages"]), 104)
        self.assertEqual(len(data["lb_index"]), 102)
        self.assertEqual(data["lb_index"][0]["address"], leader(105)["address"])
        self.assertEqual(len([p for p in calls if "limit=100&offset=" in p]), 2)

    def test_pages_links_metadata_and_global_positions(self):
        rows = [leader(n) for n in range(105, 0, -1)]
        data = {"ok": True, "as_of": "2026-11-02T00:00:00Z", "leaders": rows[:50],
                "lb_index": rows, "sitemap_ok": True, "wallets": {}}
        output = {}
        with patch.object(bs, "write", side_effect=lambda path, html: output.setdefault(path, html)):
            for lang in ("zh", "en"):
                bs.leaderboard(lang, data)
        self.assertEqual(len(output), 6)
        for lang in ("zh", "en"):
            for number, count, first, last in ((1, 50, 1, 50), (2, 50, 51, 100), (3, 5, 101, 105)):
                path = f"{lang}/leaderboard/index.html" if number == 1 else f"{lang}/leaderboard/page/{number}/index.html"
                html = output[path]
                url = f"/{lang}/leaderboard/" if number == 1 else f"/{lang}/leaderboard/page/{number}/"
                en_url = "/en/" + url.split("/", 2)[2]
                self.assertIn(f'<link rel="canonical" href="{bs.SITE}{url}">', html)
                self.assertIn(f'hreflang="x-default" href="{bs.SITE}{en_url}"', html)
                self.assertIn(f'hreflang="zh-CN" href="{bs.SITE}/zh/{url.split("/", 2)[2]}"', html)
                self.assertIn(f'hreflang="en" href="{bs.SITE}{en_url}"', html)
                self.assertIn(f'href="/{lang}/leaderboard/page/2/"', html)
                self.assertIn("105 位" if lang == "zh" else "105 traders", html)
                self.assertIn(f'<td class="num mu">{first}</td>', html)
                if number == 1:
                    self.assertIn('data-live="leaderboard"', html)
                    self.assertIn('data-index-total="105"', html)
                else:
                    self.assertNotIn('data-live="leaderboard"', html)
                    self.assertIn("第 " + str(number) + " 页" if lang == "zh" else "Page " + str(number), html)
                    self.assertIn(f'href="/{lang}/leaderboard/"', html)
                graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html).group(1))
                item_list = next(node for node in graph["@graph"] if node["@type"] == "ItemList")
                self.assertEqual(item_list["numberOfItems"], count)
                self.assertEqual([x["position"] for x in item_list["itemListElement"]], list(range(first, last + 1)))

    def test_sitemap_failure_keeps_single_legacy_page(self):
        data = {"ok": True, "as_of": None, "leaders": [leader(1)], "lb_index": None,
                "sitemap_ok": False, "wallets": {}}
        output = {}
        with patch.object(bs, "write", side_effect=lambda path, html: output.setdefault(path, html)):
            bs.leaderboard("en", data)
        self.assertEqual(list(output), ["en/leaderboard/index.html"])
        self.assertIn('data-live="leaderboard"', output["en/leaderboard/index.html"])

    def test_load_skips_full_index_when_sitemap_fails(self):
        calls = []

        def fake_get(path):
            calls.append(path)
            if path == bs.LB_PATH:
                return {"leaderboard": {"leaders": [leader(1)]}}
            if path.startswith("/v1/public/sitemap?"):
                raise OSError("offline")
            return {}

        with patch.object(bs, "get", side_effect=fake_get):
            data = bs.load()
        self.assertFalse(data["sitemap_ok"])
        self.assertIsNone(data["lb_index"])
        self.assertEqual(len(data["leaders"]), 1)
        self.assertFalse(any("limit=100&offset=" in path for path in calls))


if __name__ == "__main__":
    unittest.main()
