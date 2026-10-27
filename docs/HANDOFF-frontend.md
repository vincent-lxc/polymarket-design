# Wakeloom 前端交接（Emily，2026-10-24 23:5x HKT）

总交接见 `/workspace/projects/wakeloom/HANDOFF.md`，这里只补前端细节。

## 部署（App：app.wakeloom.com）
- 仓库 vincent-lxc/polymarket-design；官网 www 从 main 自动部署（Cloudflare Workers Builds）。
- App Worker `wakeloom-app` 手动部署（需环境变量 CLOUDFLARE_API_TOKEN，不在文档里）：
  `cd /tmp/polymarket-design-deploy && git fetch && git checkout -f origin/main && WRANGLER_CACHE_DIR=/tmp/wrangler-cache npx -y wrangler@4 deploy -c wrangler.app.toml`
- 当前现网：#38 main `1176cfc`，Version `462572d5-f1fc-474f-8349-3ac6be45365a`；回滚点 #36 `befc8958-9b04-490a-9250-3ce472779ca3`（`npx wrangler@4 rollback <version> -c wrangler.app.toml`）。
- 合并：squash；部署后在群里贴 Version，@Casey 30 分钟内复查。

## 进行中
| 项 | 云端代理 / 分支 | 状态 |
|---|---|---|
| #39 leader 失败态+401 条+1280 交易表 41px 横滚+「N」字面+手机跟单率标签+累计盈亏空态 | bc-942317c8-cc9e-50fc-ada0-2e45933671e3，`cursor/leader-skeleton-real-71e3` | 已加失败态与测试；其余已下发，需合 origin/main（leader.html 4 处冲突两边都保留，不 force-push），统一 `?v=` |
| #40 账户趋势图（日/周/月/年+自定义，盈亏柱） | bc-5c9537b7-f577-5e9d-a73c-551a7d92cf33，`cursor/account-chart-range-cf33` | 已发 #78 契约与 7 份真实返回（`研发/pr77-responses/pr78-*`），待真实数据截图 1280/390、柱子合计=卡片 5,873.08 测试 |
| 卡片「净收益 +$X（已扣估算手续费 $Y）」+总览「含估算手续费」 | bc-36b80d46-b4d3-51dc-b3a3-70b14c8fb7f5 | 用 `研发/pr77-responses/` 8 份 #77 返回；期望 paper20000 NAV $27,886.86 / +$5,889.41 / $1,997.46 / +29.45% / 「估算」 |

上线顺序：后端 #77 → #78 → 卡片+趋势图前端，一起上，不单发。

## 字段要点
- 「已扣估算手续费」读 `fees_uncharged_usd`（不是 `fees_estimated_usd`）；`fees_estimated:true` 标「估算」；百分比用接口给的 `return_pct`/`net_pct`，前端不自己算。
- 趋势图起始日用顶层 `inception_at`；窗口估算手续费 = 各期 `fees_uncharged` 之和（`totals.fees` 不含）；`has_data=false` 空柱，不画 0。
- 契约全文：`前端/refs/pr78-pnl-buckets-contract.txt`。

## 规矩
- 云端代理不调 `/v1/auth/*`，不点「登出」；截图用快照/拦截。现网会话只在本机用，不进代码/PR/截图。
- 文案禁用：待建、校准中、S0、未命名、示意、死链、裸「市场」。
- 用户可见改动必须附 1280 和 390 真实数据截图。

## 明天排队
?v= 改 commit 短 SHA；截断保留日期/0 笔不标/无数据整块藏；手机账户卡运行时长；公开榜「加入」确认层；@vinii 副标；在跟页含 S0；同屏窗口文案；leader cursor 分页（等 copy-engine#69）；清未登录钱包栏死代码；官网动效块（等 Vincent）。
