# 官网部署说明（客户端刷新 + SEO 快照）

## 模式（Vincent 选定方案 2）

- **打开页面时**：`site-live.js` 请求 `https://api.wakeloom.com` 公开接口，刷新排行榜 / 首页前 3 / leader 详情数字。
- **构建时**：`python3 tools/build_site.py` 只生成 SEO 快照——双语静态页 + **前 50** 个 leader HTML（含 JSON-LD）+ sitemap（仍列全部公开地址）。
- **其余 leader URL**：`_redirects` 回落到 `/{lang}/leader/_shell/`，由客户端按路径解析地址再拉接口。
- **日常部署**：不必每天重建数千 HTML；合并本分支后直接发布仓库根目录即可。想刷新 SEO 快照时再跑一遍构建脚本。

## 利弊

| | 前 50 静态 + 客户端 | 全量提交 HTML（旧） | 每天 CI 重建全量 |
|---|---|---|---|
| 仓库体积 | ~数 MB | ~64 MB | 小（不提交生成物） |
| 用户看到最新数 | 是 | 否 | 是（构建时刻） |
| SEO 深度页 | 前 50 有完整 JSON-LD；其余靠壳页 | 全有 | 全有 |
| 运维 | 最简单 | 简单但臃肿 | 需定时构建 |

## 命令

```bash
# 可选：刷新 SEO 快照（需能访问 api.wakeloom.com）
python3 tools/build_site.py
# 发布：把仓库根目录作为 Workers Assets / Pages 输出目录；构建命令留空
```

CORS 已放行 `www.wakeloom.com`。`/app/` 可测钱包登录。
