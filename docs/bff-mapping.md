# BFF ↔ visual-v4 字段对照

依据：polymarket-copy-engine `docs/BFF.md` 和 PR #39（已合并），以及 `bff/assemble.ts`、`bff/server.ts`。
接口地址：https://api.dealofficer.org。2026-10-21 17:53（北京时间）实测：
- `/healthz` 返回 200。
- `/v1/public/leaderboard` 和 `/v1/public/wallets/{addr}` 返回 200，source=analytics_sqlite，reason=analytics_http_unavailable。
- `/v1/overview` 未登录时返回 401。
- `/v1/auth/nonce` 返回 200，用 0x…dEaD 测试；只取 nonce，没有签名。

说明：✅ 有对应字段；⚠ 对不上（字段名、口径或格式不同）；❌ 缺接口或缺字段。

## 通用
| 前端需求 | BFF | 状态 |
|---|---|---|
| 时间，转北京时间显示 | 绝大多数为 ISO UTC | ⚠ 公开接口 `metrics.last_trade_at` 仍是 unix 秒（例：1792555046），不是 ISO |
| 缺失显示「无数据」/「暂未汇总」，无效显示「—」 | 字段为 `null`，并给出 `reasons{}`；`not_yet_aggregated` →「暂未汇总」 | ✅ 前端把原因放进 title；优先「暂未汇总」 |
| 心跳「10-21 12:40:12 · 20 秒内」 | `overview.heartbeat`（结构未写进文档） | ⚠ 文档没写 heartbeat 的字段，前端目前只显示 `as_of` |
| 右栏「需要注意」「持仓占用 Top」 | 无 | ❌ 没有汇总接口。实时模式下右栏这两块先隐藏 |
| 顶栏「运行中」状态 | `health.services.copy.state` | ⚠ 只在 /v1/health 里，其它页要多请求一次 |
| 「全局停止」按钮（写入） | 只读：`health.services.copy.kill_switch` | ❌ 没有写接口。第一期写入只有策略草稿和配置 |

## 总览 `GET /v1/overview?range=`
| 页面字段 | BFF | 状态 |
|---|---|---|
| 合计净值 Σequity | `totals.equity_usd` | ⚠ 只要有一个账户缺标记价，BFF 就返回 null（allNum）。前端按 spec v4.7 自己用 `accounts[].equity_usd` 加总，再写「不含 X」 |
| 「= N 个策略实例合计」 | `totals.account_count`，以及前端自己数 | ✅ |
| 本金合计 | `totals.capital_usd` | ✅ |
| 扣费净盈亏 / 收益率 | `totals.net_pnl_usd` / `net_pct` | ⚠ 缺失时同样整体为 null，前端改为按可用实例自算 |
| 现金、持仓市值、浮动、已实现 | `totals.cash_usd` / `positions_value_usd` / `unrealized_usd` / `realized_usd` | ⚠ 浮动/已实现仍常为 `null` + `not_yet_aggregated` →「暂未汇总」 |
| 成交、未结算持仓、当日已实现 | `totals.fills` / `open_positions` / `daily_realized_usd` | ⚠ fills / 当日已实现常未聚合 →「暂未汇总」；持仓数只用 `open_positions`，不用 `positions.length` |
| 合计净值曲线 | `equity_curve[]` | ✅（文档没写点的字段，前端按 `{t,equity}` 读） |
| 当前主力 leader | `main_leader`：address、user_name、score、weight、selected_at | ✅ |
| 主力卡「近 N 笔输赢」「跟此人累计」「进行中镜像」 | 无 | ❌ 总览不带，要再请求 `/v1/leaders/{addr}` |
| 镜像单 8 条 | `recent_mirrors[]` | ⚠ 有 leader_notional_usd、fill_usd、slippage_bps、reason_zh，但没有单笔手续费，页面上的「手续费」「滑点成本 $」两列没有数据，改成显示滑点 bps |
| 利润归属分段条 | `attribution[]` | ⚠ 过时：BFF 仍未聚合，字段为 `null` + `not_yet_aggregated`；前端显示「暂未汇总」，不再假装已齐 |
| 策略实例对比 | `accounts[]`：strategy、net_pnl_usd、net_pct、equity_usd、open_positions、max_open_positions、run_state_zh | ✅ |
| 对比表「主力 / 对照」标签 | 无 | ❌ |
| ⋯ 菜单：暂停 / 调参 | 只能改草稿的 state | ⚠ 改的是草稿标记，不暂停正在跑的引擎 |

## 账户 `GET /v1/accounts`、`/v1/accounts/{strategy}`
| 页面字段 | BFF | 状态 |
|---|---|---|
| 净值、本金、扣费净盈亏 | `account.equity_usd` / `capital_usd` / `net_pnl_usd` / `net_pct` | ✅ |
| 最大回撤 | `max_drawdown_pct` | ⚠ 常为 `null` + `not_yet_aggregated` →「暂未汇总」 |
| 现金、持仓市值、敞口、当日已实现 | `account.cash_usd` / `positions_value_usd` / `exposure_usd` / `daily_realized_usd` | ✅ |
| 今日亏损 / 日亏上限进度 | `params.daily_loss_limit_usd` 有，今日亏损没有 | ❌ |
| 持仓表 | `positions[]`：title、outcome、shares、avg_price、last_mark、unrealized_usd；表头数量用 `open_positions` | ✅ 缺 title →「未命名市场」；`unrealized_usd` null →「暂未汇总」 |
| 平仓按钮 | 无写接口 | ❌（第一期不下单，建议页面隐藏） |
| 成交与拒单 10 条 | `activity[]`（同 `recent_mirrors`） | ✅ 已接；缺 `market` →「未命名市场」；`fill_usd` null →「暂未汇总」 |
| 关键参数 | `params`：sizing_ratio、max_per_trade_usd、max_open_positions、daily_loss_limit_usd、leaders_mode{value,zh} 等 | ⚠ 每个参数是 `{value, reason}`，没有 max_per_market_usd |

## Leaders `GET /v1/accounts/{strategy}/leaders`
| 页面字段 | BFF | 状态 |
|---|---|---|
| 在跟、已移出 | `active[]` / `removed[]` | ✅ |
| 我方累计 / 占比 | `our_total_usd` / `our_share` | ⚠ 常为 `null` + `not_yet_aggregated` →「暂未汇总」 |
| 胜率（每行） | 无 | ❌ 要逐个请求 leader 详情 |
| 最近一次筛选 | `last_screen{screened_at,selected,rejected,duration_ms,rows[]}`，rows 里有 rank、selected、reason{code,zh} | ⚠ rows 没有胜率列 |
| 白名单 / 排除名单 | `manual.include` / `manual.exclude` | ✅ |
| 移出、加入白名单（写入） | 无 | ❌ 没有写接口，按钮应置灰 |

## Leader 详情 `GET /v1/leaders/{address}`（需登录）· 公开 `/v1/public/wallets/{address}`
| 页面字段 | BFF | 状态 |
|---|---|---|
| 名字、X、认证、组合市值 | `profile.*` | ✅ |
| 胜率、收益率、回撤、已结算、中位成交额、中位持仓、集中度、综合分、门槛 | `metrics.*`，以及 `gate_failures` 中文 | ✅ |
| 全期胜 / 负 / 已实现 | `settled` | ✅ |
| 按品类 | `categories` | ⚠ 结构文档没写 |
| 按市场分布 | `markets[]`（前 20 加「其他」） | ✅（以前是「待后端」） |
| 近 N 笔输赢 | 标题用 `recent_n`（没有则「他近期输赢」）。值读 `recent_closed`；缺数时「—」，悬停 `reasons.recent_closed` | ⚠ `recent_closed` 仍可能为 null |
| 我方累计（按策略加合计） | `pnl.by_strategy[]`。合计优先 `pnl.total`，没有再前端加总。原因先读 `pnl.reasons`，再读 `reasons.pnl`。`no_fills` 或没有成交行时整块「未跟过」 | ✅ |
| 利润占比 | `profit_share`（比例，前端只格式化成百分比，不自己除）。null 时原因 `reasons.profit_share`，显示「—」并悬停原因。该 leader 合计 ≤ 0 显示「亏损 −$X」。没跟过显示「未跟过」。响应里没有该字段则整项不显示。悬停标签「占所有赚钱 leader 盈利之和」 | ⚠ 后端字段尚未上线 |
| 跟单率 | `pnl.copy_rate` | ✅ 短标签「跟单率」，口径在 title 和第二行 |
| 风险标记 | `flags`、`flag_labels`、`flag_notes` | ✅ |
| 持仓占用 Top | 详情上的 `position_usage` / `occupancy` / `accounts` | ⚠ 没有单独接口。没有这些字段时显示「暂未汇总」，不留示例数字 |
| 价格买卖点 | `GET /v1/markets/{token_id}/prices?range=&bucket=&leader=` → `history` / `ohlc` / `leader_trades` / `our_fills` | ✅ 已上线。`token_id` 从详情 `trades` 取。缺 `ohlc` 时用 `history` 采样，并标出高低点为采样 |
| 公开页（未登录） | 公开接口只有画像、指标和收益曲线 | ✅ 前端已接；我方镜像相关块显示「需登录」 |
| 页面寻址 | 前端用 `leader.html?addr=0x…` | ⚠ 旧的 `leader-<slug>.html` 示例页保留，不接接口 |

## 配置 `GET /v1/config/wallet`、`/v1/config/rpc`
| 页面字段 | BFF | 状态 |
|---|---|---|
| 钱包地址、绑定状态 | `bound`、`address`、`funder_address` | ✅ |
| 私钥掩码 | `private_key_hint`、`api_key_hint` | ✅ |
| RPC 列表 | `providers[]`：name、status（live / 待机 / 已踢出）、role、endpoint_hint、key_hint | ✅ |
| 绑定、解绑、增删改 RPC、排序 | PUT / DELETE / POST / PATCH，带确认短语 | ✅ 接口有。按 Vincent 的要求前端这次只读，不接这些写操作 |
| 全局停止 | 无 | ❌ |

## 健康 `GET /v1/health`
| 页面字段 | BFF | 状态 |
|---|---|---|
| RPC 状态、p50、p95 | `rpc[]` | ✅ |
| 「说明」列（连续超时时间等） | 只有 `reasons.status=rpc_ejected` | ❌ 没有具体时间 |
| 24h block→ack 柱状图 | `latency_24h` | ⚠ 分桶结构文档没写，这次没有对接 |
| 服务、熔断、全局停止 | `services.copy{state,last_signal_at,circuit_open,kill_switch}` | ✅ |
| 拒单摘要 | `rejects_24h{signals,copied,skipped,failed,by_reason[{code,zh,count}]}` | ✅ |

## 策略管理 `GET /v1/me/strategies`、`/v1/strategy-templates`
| 页面字段 | BFF | 状态 |
|---|---|---|
| 我的策略实例 | 草稿：name、template_id、params、state | ⚠ 草稿和正在跑的实例（paper20000 等）是两回事；草稿没有净盈亏 |
| 扣费净盈亏列 | 无 | ❌ 草稿不跑，没有盈亏 |
| 模板 S0–S3 | `templates` | ✅ |
| 新增、修改（唯一写入） | POST / PATCH，正文 `confirm` 加请求头 `X-Confirm-Phrase`（encodeURIComponent），mode=paper | ✅ api.js 里有 `PM.createDraft` / `PM.saveDraft` |
| 删除 | 无 | ✅ 本期本来就不做 |

## 排行（市场页 `/markets?tab=board`，原 board.html 301 / 客户端跳转）`GET /v1/public/leaderboard`
| 页面字段 | BFF | 状态 |
|---|---|---|
| 地址、综合分、胜率、ROI、已实现、门槛 | `leaders[].address`、`smart_score`、`metrics.*`、`gate_pass`、`gate_failures` | ✅ |
| 名字 / X | 无 | ❌ 排行里没有 user_name，只能显示缩写地址 |
| 返回速度 | 父代理反映要等几秒，17:53 实测约 1 秒 | ✅ 加了骨架屏（只动 opacity） |

## 缺接口汇总
1. 右栏的「需要注意」和「持仓占用 Top」汇总。
2. 全局停止、移出 leader、白名单、平仓、暂停引擎的写接口（第一期不做，页面按钮建议置灰）。
3. 账户的今日亏损，以及镜像单的单笔手续费和滑点成本。
4. 排行里的 leader 名字。
5. leaders 筛选结果每行的胜率。
6. 健康页 RPC 被踢出的具体时间。
7. `overview.heartbeat`、`equity_curve`、`activity`、`latency_24h`、`categories` 的结构没写进文档。
8. 公开接口 `last_trade_at` 不是 ISO 格式。
9. 当日已实现按 UTC 零点算，和北京时间口径不一致。
