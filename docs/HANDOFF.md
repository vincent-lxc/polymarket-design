# Wakeloom 项目交接（2026-10-24 23:50 HKT）

> Vincent 因流量可能不足要求留下完整交接，便于其他助手接手。  
> **本文件权威副本**：`/workspace/projects/wakeloom/HANDOFF.md`（全员可读）  
> 同步推到 GitHub：见文末「仓库落点」。  
> 更新时请改本文件并注明日期；不要另起一份互相打架的副本。

---

## 1. 产品是什么

- **Wakeloom 织迹**：Polymarket 跟单 / 模拟盘分析产品（测试版）。
- **官网**：https://www.wakeloom.com （SEO/GSC 只盯 www；标注「尚未正式上线」）
- **App**：https://app.wakeloom.com （整站 Disallow，不进 sitemap/GSC）
- **API**：https://api.wakeloom.com （`pmct-bff`）
- **定位**：测试期以模拟盘跟单分析为主；未完成能力标「即将推出」。

---

## 2. 谁干什么（群：wakeloom项目群）

| 角色 | 助手 | 职责 |
|------|------|------|
| 全局 CEO | **Morgan** | 统筹拍板；合入前说「可以」；Must-ask 仍报 Vincent |
| 产品 / 发布门 | **Casey** | ACCEPT、口径；**用户可见改动的最后一道关**；每日 21:00 报最差 3 处 |
| 后端 / 部署 | **Blake** | `polymarket-copy-engine`（BFF、分析、跟单引擎、生产部署） |
| 前端 | **Emily** | `polymarket-design`（App Worker + 官网） |

**合入权（Vincent 已授权，2026-10-23/24）**  
- Wakeloom PR：Casey 说「能给用户看」→ Morgan 说「可以」→ Blake/Emily 合并部署。  
- Blake/Emily 部署（含 Cloudflare / app.wakeloom.com）不用等 Vincent。  
- **仍须问 Vincent**：实盘/真钱、对外发帖、花钱、扩大红线。

**裁决链路**  
1. 各按职能处理  
2. 有问题先报对应 CEO（Morgan）  
3. CEO 定不了或专业意见冲突 → Vincent  
日常经 Vincent的助手路由。

---

## 3. Casey 发布门（必遵）

文件：`产品/CASEY-RELEASE-GATE-2026-10-24.md`

1. PR 附现网真实数据截图（电脑 + 手机）。  
2. Casey 站在新用户角度给结论：能给用户看 / 不能。  
3. Casey 说能 → Morgan「可以」→ 合并部署。  
4. 部署后 **30 分钟内** Casey 现网复查（电脑+手机）；不过关回滚。  
5. 每天约 21:00：能不能给用户看 + 最差 3 处（带截图）。

门禁截图目录：`产品/release-gate/`  
日报目录：`产品/daily-gate/`

---

## 4. 代码仓库与部署

| 仓库 | 用途 | 现网 |
|------|------|------|
| https://github.com/vincent-lxc/polymarket-copy-engine | BFF / analytics / 跟单 | 部署后重启相关服务（常见只重启 `pmct-bff`） |
| https://github.com/vincent-lxc/polymarket-design | App 静态 Worker + 官网 | Cloudflare Worker → `app.wakeloom.com`；官网另项目 |

- App Worker **只服务静态资源**，不代理 `/v1`；API 走 `api.wakeloom.com`。  
- 前端 Version / 缓存：现网 `cache-control: private, no-store`；下一个前端 PR 会把 `?v=` 改成 commit 短 SHA。  
- 分析 worker：`pmct-analytics`（市场名回填等定时任务）。

**本地交付落盘（全员共用，不算 Git 也要写这里）**  
- 产品：`/workspace/projects/wakeloom/产品/`  
- 研发：`/workspace/projects/wakeloom/研发/`  
- 前端笔记：`/workspace/projects/wakeloom/前端/`  
- 知识库：`/workspace/知识库`（全员可读）

---

## 5. 已定产品口径（摘要）

权威全文：`产品/ACCEPT-STRATEGY-ACCOUNT-v1-2026-10-23.md`  
API：`研发/API-STRATEGY-ACCOUNT-v1-2026-10-23.md`

- 两层：**策略**（代码内置，只展示/改参说明）+ **账户**（参数 + 资金）。  
- 账户状态只有：**运行中 / 已停止**（无暂停）。运行中不能改参；停止后改参再启动，同一账户继续；曲线标改参分段。  
- 每账户独立进程；用户自有 RPC（未配则公共 RPC，不足只提示不拦开跑）。  
- 模拟盘分配可超总资金；**钱包不能超**（钱包超额拦截 **明天**做，失败关闭：读不到余额就拒绝创建/调资金）。  
- `summary.over_allocated` **只计运行中钱包**；`paper_over_allocated` 警告明日删（前端已滤）。  
- 对比可跨策略 2–4 账户；收益率扣手续费后算。  
- 长表分页默认 20、游标翻页。  
- 归档/删除（P10）：仅已停止可操作；删除为软删除；钱包须先清仓；模拟盘可直接删。  
- 侧栏：总览、账户、策略、市场、领导者、配置、健康。

**回撤**  
- 字段：`max_drawdown_usd`、`max_drawdown_equity_pct`（%÷投入额）。  
- 开关：`analytics.drawdown_cutover`（#75/#76 已合；开开关后 Emily 切新字段）。  
- 硬门槛：只淘汰明确 **>30%**；**null 放行**（#76 已合）。开开关后要贴候选数前后、alex 回撤、新进池综合分前 10。

**前端硬规则**  
- 禁止占位/示意假数据；加载只用灰骨架。  
- 找不到账户：「找不到这个账户」+ 返回。  
- 确认框账户名点按后再填。  
- 市场名：name → title → 可读 slug → 短 id；禁止裸「市场」。  
- 空单元格「—」；手机表一行一卡。

---

## 6. 今晚（10-24）进度快照

### 已合已上（节选）

| PR | 内容 | 备注 |
|----|------|------|
| copy-engine #70–#75 | 运行时长/分配展示、超额只计钱包、持仓>0.01、市场名回填、回撤字段与投入额%、null 门槛 | 多数已部署 |
| copy-engine #76 | null 放行硬门槛 | **已合并** |
| design #36 | 最近跟单只显示已跟/失败/被拒 | 现网复查不回滚 |
| design #37 | 去掉 shell 假账户/示意数据 | 过门 |
| design #38 | 手机表格一行一卡 | **已合 main `1176cfc`，Version `462572d5-…`，等 Casey 现网复查** |

### 待合（必须一起上的一批）

| PR | 内容 | 状态 |
|----|------|------|
| copy-engine [#77](https://github.com/vincent-lxc/polymarket-copy-engine/pull/77) | 卡片不再对未真扣费账户重复加手续费；四处口径统一；`fees_estimated` / `fees_uncharged_usd` | 数据门 **Casey 过**；等前端标注一起上 |
| copy-engine [#78](https://github.com/vincent-lxc/polymarket-copy-engine/pull/78) | `GET /v1/accounts/:id/pnl-buckets` 分期盈亏 | 数据门 **Casey 过**；先合 #77 再 #78 |
| design [#40](https://github.com/vincent-lxc/polymarket-design/pull/40) | 账户趋势图：日周月年+自定义+盈亏柱 | OPEN，接 #78 |
| design [#39](https://github.com/vincent-lxc/polymarket-design/pull/39) | 加载去假数字；401 提示；1280 交易表横滚；露出的「N」/跟单率截断等 | OPEN，等 #38 后 rebase |

**上线顺序（已定）**  
1. #77 + Emily 手续费标注前端（卡片写「净收益 +$X（已扣估算手续费 $Y）」，大数字仍是净值，% 用扣费后）  
2. #78  
3. 趋势图前端 #40  
不要单独先合 #77（否则净值−资金≠净收益且无说明，用户会觉得算错）。

**手续费口径（Morgan 定 B）**  
- 未真扣费账户（如 paper20000）：估算扣费，`fees_estimated: true`，悬停/卡片标「估算」。  
- 已真扣费（paper20000fees）不重复扣。  
- 同窗口柱子合计 = 卡片 `net_pnl_usd`，差 ≤ $1。  
- 真实响应：`研发/pr77-responses/`；核对：`研发/CHECK-PR77-*.md`、`CHECK-PR78-*.md`；Casey 门：`产品/release-gate/pr77-…`、`pr78-…`。  
- 前端：起始日用顶层 `inception_at`（旧账户 10-14），不要只看 `clipped_from`；估算手续费加总各期 `fees_uncharged`，`totals.fees` 不含这笔。

**趋势图 ACCEPT**：`产品/ACCEPT-account-chart-range-2026-10-24.md`  
- 默认：日=最近 30 天，周=26 周，月=12 月，年=开跑至今。  
- 时区 UTC+8，周一起始；「只看当前分段」起点截到分段开头并小字提示。  
- 现网验出入金：Morgan 已点名允许建模拟盘 `gate-test-1024*`，调一次资金后**停止并直接删除**（不归档）。

### 登录 / impersonate（测试期）

- 临时调试登录保留至正式上线；密钥 **1:1 私发**，**绝不贴群**。  
- 2026-10-24 晚：部分会话因有人点「登出」被删 → 401「登录已失效」。与部署无关。  
- Blake 已给 Casey/Emily **新签会话（私信）**，有效至约 10-31；复查期间**不要点登出**。  
- 22:39 有美西 IP 调 impersonate 失败（密钥不对）；Emily 否认；无人认领 → Blake 私报 Vincent 是否轮换密钥。  
- 待做小 PR：BFF 访问日志（路径/状态/耗时，不记凭证）；前端 401 顶部条「登录已失效，请重新登录」（进 #39）。

### 日报未清项（部分已推进）

仍开或待确认：  
- Leader 加载假数字（#39）  
- alex −100%（等 drawdown 开关 + Emily 切字段）  
- Leader「我方累计盈亏」合计「—」、浮动「—」、「近 N 笔」露出字母 N、利润占比「—」、手机跟单率标签截断（Blake 查 `GET /v1/leaders/:addr` 的 `pnl.by_strategy` / null；补 `pnl.total`；Emily #39）  
- 首屏速度结论（Blake+Emily，可明日）  
- 钱包超额 fail-closed + 去掉 `paper_over_allocated`（明日）

---

### 6.x 后端（Blake）交接

**做到哪**
- 已合已上：#72–#76（#76 是回撤门禁「null 放行」加 cutover，现网 DEPLOYED_SHA `e8757616`）。
- #77（卡片手续费只扣一次，共用 `bff/fee-basis.ts`）：数据已验过，paper20000 卡片 5,889.41 / +29.45%，四处一致。Casey 数据门已过。
- #78（`GET /v1/accounts/:id/pnl-buckets` 日/周/月/年趋势）：base 目前是 #77 分支，**#77 合后要把 base 改回 master 再合**。全段对账差 $0，Casey 数据门已过。
- 真实返回、核对文档都在 `研发/pr77-responses/`、`研发/CHECK-PR77-real-responses-2026-10-24.md`、`研发/CHECK-PR78-real-responses-2026-10-24.md`。

**下一步**
1. 等 Emily 截图 → Casey 门 → Morgan「可以」，然后先 squash 合 #77，再合 #78，和 Emily 前端一起上。
2. 部署只重启 pmct-bff。部署前在 `backups/` 下做备份，部署后冒烟 paper20000 卡片和 pnl-buckets，报 Morgan；Casey 30 分钟内现网过门，不过关就回滚。
3. Leader 页「—」：`GET /v1/leaders/:addr` 的 `pnl.by_strategy` 为空、或 realized/unrealized 为 null 时要补齐，加 `pnl.total`，补「近 N 笔输赢」「利润占比」。排查报告写到 `研发/CHECK-leader-pnl-dash-2026-10-24.md`（正在写），原始返回在 `研发/leader-pnl-responses/`。之后开 PR。
4. BFF 访问日志小 PR：只记路径、状态码、耗时，不记 token，用 `BFF_ACCESS_LOG` 开关。云端代理 bc-de1c4ad4 在写，出 PR 后给 Morgan 审。
5. #76 还欠的：在群里贴三个数（候选人数前后对比、alex 回撤显示、新放进来的前 10 个钱包），再请 Casey 确认 alex 不显示 −100%。

**卡在哪 / 明天**
- 钱包超额校验（读不到余额就拒绝，去掉 paper_over_allocated）涉及真钱，挪到明天。
- 分析回填只拉第一页 500 条，待修。
- 首屏慢：和 Emily 一起查。
- impersonate（临时登录）上线前要拆掉。现在是测试期，按 Vincent 说法可以直接签会话。22:39 的无人认领试探，Vincent 定了不换密钥。
- 生产机磁盘 40G/96G，`backups/` 占 20G，清理要先确认。
- 主机 iowait 偏高；#59 等 SonarCloud 恢复后补扫；fees20000 观察一周。

**关键位置**
- 生产：`box@34.97.60.149:/home/grokbot/pmct/polymarket-trade-engine`。服务有 pmct-copy、pmct-analytics、pmct-bff、zerofeetrend、whale5k、acct-supervisor。BFF 监听 127.0.0.1:7810，日志在 `logs/bff.log`，会话表在 `data/pmct-bff.db`。
- 仓库：https://github.com/vincent-lxc/polymarket-copy-engine（squash 合到 master）。
- 在跑或在看的云端代理：bc-c1a51d87（#77）、bc-1bb9c421（#78）、bc-8399f9c6（#76）、bc-de1c4ad4（访问日志）。
- 规矩：不读也不复制 `bff.env` 等密钥文件；token 只以私有文件路径交接，不贴到群里。

### 6.x 前端（Emily）交接

**做到哪**
- 已合已上：#38（手机表格一行一卡），main `1176cfc`，App Version `462572d5-f1fc-474f-8349-3ac6be45365a`；回滚点 #36 `befc8958-9b04-490a-9250-3ce472779ca3`。等 Casey 现网复查。
- #39（leader 去假数字）：已做 500/断网显示「暂时连不上，稍后再试」+重试，账户列表「连不上接口」+重试，测试 `app/load-error.test.mjs`。已下发但未回：401 顶部条「登录已失效，请重新登录」（保留数据、不自动跳转）、1280 交易表 41px 横滚、「近 N 笔」字面 N、手机「跟单率」标签截断、累计盈亏空态；合 origin/main（leader.html 4 处冲突两边保留，不 force-push），统一 `?v=`。
- #40（账户趋势图 日/周/月/年+自定义，盈亏柱）：11 项测试过，已发 #78 契约和 7 份真实返回，正在出 1280/390 真实数据截图，并加「柱子合计 = 卡片 5,873.08，差 ≤ $1」测试。
- 卡片手续费标注（还没开 PR）：大数字仍是净值，加「净收益 +$X（已扣估算手续费 $Y）」，% 用扣费后，总览合计标「含估算手续费」。用 `研发/pr77-responses/` 8 份 #77 返回；期望 paper20000 NAV $27,886.86 / +$5,889.41 / $1,997.46 / +29.45% / 「估算」；paper20000fees −$1,801.11 / −9.01%，不标估算。

**下一步**
1. 收 #40 和卡片截图，自查后交 Casey 按 `产品/ACCEPT-account-chart-range-2026-10-24.md` 过门 → Morgan「可以」→ 等 Blake 合 #77、#78 后合前端并部署 App。
2. #39 回来后复审截图过门；Blake 补 `pnl.total`/近 N/利润占比后接上。
3. 部署后群里贴 Version，@Casey 30 分钟内复查，不过就 `wrangler rollback`。

**卡在哪**
- 前端一起上要等 #77、#78 合并部署；leader「—」等 Blake 补字段。

**关键位置**
- 仓库：https://github.com/vincent-lxc/polymarket-design（squash 合 main；www 自动部署，App 手动部署）。
- App 部署：`cd /tmp/polymarket-design-deploy && git fetch && git checkout -f origin/main && WRANGLER_CACHE_DIR=/tmp/wrangler-cache npx -y wrangler@4 deploy -c wrangler.app.toml`（需 CLOUDFLARE_API_TOKEN，不在本文）。
- 云端代理/分支：#39 bc-942317c8 `cursor/leader-skeleton-real-71e3`；#40 bc-5c9537b7 `cursor/account-chart-range-cf33`；卡片 bc-36b80d46。
- 文件：`前端/HANDOFF-前端-2026-10-24.md`、`前端/refs/pr78-pnl-buckets-contract.txt`、`产品/release-gate/pr38-2026-10-24/`、规范 `/workspace/知识库/LLM工程/前端开发规范-bot用.md`。
- 规矩：云端代理不调 `/v1/auth/*`、不点登出；现网会话只在本机，不进代码/PR/截图。

## 7. 明天优先（若今晚流量中断）

1. Casey 完成 #38 现网复查；不过关回滚到 #36 Version `befc8958`。  
2. Emily 出手续费标注截图 → Casey 对 #77+#前端 给「能给用户看」→ Morgan「可以」→ 合 #77→#78→趋势图。  
3. 开 `analytics.drawdown_cutover`（合 #76 后），贴候选数/alex/新进前 10；Casey 复看 alex。  
4. 钱包超额拦截（fail closed）+ 删 paper 超额警告。  
5. Leader PnL 字段补齐 + #39 合入。  
6. `gate-test-1024` 出入金柱验收后删除。

---

## 8. 接手检查清单（新助手第一小时）

1. 读本文件 + `产品/CASEY-RELEASE-GATE-2026-10-24.md` + `产品/ACCEPT-STRATEGY-ACCOUNT-v1-2026-10-23.md`。  
2. 进 **wakeloom项目群**，@Morgan / @Casey / @Blake / @Emily 同步你在线。  
3. 用 `gh pr list` 看两个仓库 OPEN PR；不要跳过 Casey 门。  
4. 需要现网账号：向 Blake/Vincent **私聊**要 impersonate 会话；密钥不进群、不进本文件。  
5. 交付一律写 `/workspace/projects/wakeloom/<职能>/`，群里只报路径和结论。  
6. Must-ask Vincent 四类：对外发帖/消息、实盘、花钱、扩大红线。

---

## 9. 关键路径速查

```
/workspace/projects/wakeloom/HANDOFF.md          ← 本文件
/workspace/projects/wakeloom/产品/CASEY-RELEASE-GATE-2026-10-24.md
/workspace/projects/wakeloom/产品/ACCEPT-STRATEGY-ACCOUNT-v1-2026-10-23.md
/workspace/projects/wakeloom/产品/ACCEPT-account-chart-range-2026-10-24.md
/workspace/projects/wakeloom/产品/release-gate/   ← 各 PR 门禁截图与 GATE-*.md
/workspace/projects/wakeloom/产品/daily-gate/     ← 每日最差 3 处
/workspace/projects/wakeloom/研发/pr77-responses/ ← #77/#78 真实响应体
/workspace/projects/wakeloom/研发/CHECK-*.md      ← 后端核对记录
/workspace/知识库/LLM工程/前端开发规范-bot用.md   ← Emily 开工前必读
```

SEO/GEO：`前端/SEO-GEO-PLAN.md`；GSC/Bing 用 `itopssh@gmail.com`（Quinn/OpenGSC，不必找 Vincent 操作）。

---

## 10. 仓库落点（提交说明）

- **主副本**：本路径（box 共享，所有 Grok Bot 助手立刻可读）。  
- **GitHub**：推送到 `vincent-lxc/knowledge` 的 `wakeloom/HANDOFF.md`（若该仓结构不同，则放到 `docs/wakeloom/HANDOFF.md`），并在  
  `polymarket-copy-engine` 与 `polymarket-design` 根目录各放一份 `docs/HANDOFF.md`（或指向 knowledge 的短链 README 段），保证只 clone 业务仓也能看到。  
- **禁止**把 impersonate 密钥、会话 cookie、私钥写进任何仓库或本文件。

---

*撰写：Morgan · 2026-10-24 23:50 Asia/Hong_Kong · 依据当晚群聊与上述落盘材料；后续变更请改本文件并在群里一句话通知。*

### Casey（产品 / 发布门）交接 · 2026-10-24 23:55 HKT
- 做到：#77、#78 数据门已过（`产品/release-gate/pr77-2026-10-24/`、`pr78-2026-10-24/`）；#38 截图门已过，现网复查（电脑 1280 + 手机 390）正在进行，截图落 `产品/release-gate/pr38-prod-2026-10-24/`。
- 下一步：① 给出 #38 现网结论（不过关就叫回滚到 #36 `befc8958`）；② Emily 交卡片手续费标注 + 趋势图截图后按 `产品/ACCEPT-account-chart-range-2026-10-24.md` 过门；③ 上线后 30 分钟内现网复查，并用 `gate-test-1024` 模拟盘验出入金柱，验完停止并删除；④ #76 开回撤开关后复看 alex（应约 $14,857 / 5.68%，不得 −100%）；⑤ 每日 20:20 发布门日报（routine 已设），最差 3 处清一条划一条（`产品/daily-gate/2026-10-24/2110/DAILY-GATE-2110.md`）。
- 卡点：无。现网复查只读，绝不点登出、停止、归档、启动、平仓、暂停（Morgan 点名的除外）。
- 关键口径：手续费按 B（估算扣、标「估算」）；同窗口柱合计 = 卡片扣费后净收益，差 ≤ $1；大数字为净值，旁注「已扣估算手续费 $X」，百分比用扣费后。

