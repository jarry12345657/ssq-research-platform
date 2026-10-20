# 双色球选号研究平台 V1

**可直接部署到 GitHub Pages 的零依赖静态网站**。含5注自动生成、6红2蓝默认排除、3种组合策略、精确概率、历史统计、滚动回测、预测快照与自动开奖数据更新。

> 本项目仅用于概率与统计方法研究。历史冷热、遗漏不证明可以预测独立开奖。中奖率与回本概率取决于奖级规则与投注组合结构，不保证实际收益。理性购彩，预算自定。

## 1. 已实现功能

- **组合生成**：5注单式，默认排除6个红球与2个蓝球（使用历史最长遗漏）。可设置红球0–6个、蓝球0–11个的排除数量及6种统计规则。
- **三种目标**：中奖优先（5个不同蓝球）、回本优先（2+2+1蓝球）、盈利优先（3+2蓝球）。每次随机打乱剩余候选号码，但保持5注的红球交集结构。
- **理论概率**：展示精确枚举验证的5注模板概率（共17,721,088种可能开奖结果）。由于号码本身是对固定模板的**一一置换**，三个概率与具体号码无关，仅由模板交集和蓝球分配决定。
- **开奖统计**：红/蓝球历史频数图、最新期号、历史数据更新状态。
- **滚动回测**：每次只读当期之前历史数据，评估动态排除策略的误排数量。可用最近最多450期回测，含理论随机基线。
- **我的记录**：生成方案快照、本地保存、自动开奖核对、手动删除、导出 JSON。
- **自动同步**：GitHub Actions 约北京时间周日/周二/周四 22:42、次日上午10:17运行数据抓取和 Pages 发布；定时任务可能延迟。
- **导出**：复制5注、下载CSV、导出本地预测记录JSON。

## 2. 本地启动（无须安装Node依赖）

要求：Python 3.10+ 和现代浏览器。Node 仅用于运行JS测试。

```bash
# 先解压并进入目录
cd ssq-v1

# 内置157期真实样例数据，可离线运行
python scripts/update_data.py --offline

# 尝试下载完整版（联网时）
python scripts/update_data.py

# 启动网站服务器
python -m http.server 8080 --directory web
```

在浏览器访问 **http://localhost:8080**。注意不能直接双击 `index.html`，因为网站使用 ES Module，需要HTTP服务。

## 3. 部署到 GitHub Pages

1. 登录 GitHub，新建**公开仓库**，例如 `ssq-research-platform`；不要将本目录压缩包直接当作一个文件上传，必须上传解压后的文件与隐藏的 `.github` 目录。
2. 用终端将本项目推送到仓库（Windows 建议 Git Bash 或 GitHub Desktop）：

```bash
git init -b main
git add .
git commit -m "Initial SSQ research platform V1"
git remote add origin https://github.com/你的用户名/ssq-research-platform.git
git push -u origin main
```

3. GitHub 仓库 **Settings → Pages → Build and deployment → Source → GitHub Actions**。
4. 进入 **Actions → Build data and deploy GitHub Pages → Run workflow**；首次也会因为推送 main 自动触发。
5. 部署成功后，网址形如 `https://你的用户名.github.io/ssq-research-platform/`。
6. `web/data/history.json` 会在 Actions 环境联网时替换为较新的完整历史数据，直接作为 Pages 构建产物发布。自动更新不需要提交数据文件到仓库。

**常见问题**：
- 如果 Actions 无法访问上游历史数据，会保留随仓库提供的真实157期样例数据，页面明确提示“部分数据”。不要把它当成完整历史。
- GitHub Actions 的定时任务不保证准时触发；可以在 Actions 页面手动运行，网页也有“刷新开奖结果”按钮。
- GitHub Pages 的网站内容**是公开可访问的**。个人保存的号码记录保存在浏览器 localStorage，而不是提交到GitHub服务器。
- 首期默认同步的数据截至2026-10-18第26119期。之后以平台实际获取的最新开奖记录为准。
- 如果 Action 因Pages权限不足失败，在Settings/Pages中选择GitHub Actions，并检查仓库对Actions的使用权限。

## 4. 算法与数据架构

```text
公开历史开奖（yangxb919/lottery-data，由500彩票网整理）
       ↓ Python 校验与离线更新（GitHub Actions）
web/data/history.json（Pages静态资产）
       ↓ 前端加载、必要时从公开 Raw 地址补抓
频率 / 当前遗漏 / 规则化排除6红2蓝
       ↓
剩余27红14蓝（默认） → 5注低交集红球置换模板
       ↓
选择蓝球配置：5 distinct / 2+2+1 / 3+2
       ↓
生成5注 + 精确组合概率 + 历史回放
       ↓
手动保存本地快照 → 历史开奖结果核对
```

### 数据可靠性与边界

- 通过`normalizeHistory`检查期号、日期格式、红球个数与无重复、号码范围、重复期号或日期。
- 公共历史仓库并非彩票发行机构官方数据，重要期次请在[四川福彩公告](https://www.scflcp.com.cn/ssq)或其他官方渠道核对。
- 默认按**普通六奖级**：一、二等奖浮动；三等奖3000元、四等奖200元、五等奖10元、六等奖5元。特别规定/福运奖生效时需重新计算。
- 如果五注包含一等奖或二等奖，平台历史结算标记“浮动奖”，**不冒充计算真实奖金**。
- `历史回放` 是固定号码对历史开奖结果做事后比较，不是未来预测准确度。`策略回测` 才是按时间向前的真实滚动检验。
- V1精确概率常量适用于特定5注模板及其任何一一号码置换。**禁止随意修改 `RED_TEMPLATE` 或 `STRATEGIES.bluePattern` 后沿用常量**；修改后须重新进行全组合枚举。

## 5. 文件说明

| 路径 | 用途 |
|---|---|
| `web/index.html` | UI布局、4个页面入口 |
| `web/style.css` | 桌面/移动端样式 |
| `web/app.js` | 前端状态与交互 |
| `web/engine.js` | 排除规则、生成、中奖判断、回测纯函数 |
| `web/data/fallback.csv` | 157期已核验离线样本 |
| `web/data/history.json` | 当前打包数据，Actions运行时更新 |
| `scripts/update_data.py` | 无第三方依赖的历史数据获取与验证脚本 |
| `.github/workflows/deploy.yml` | 自动数据更新、测试及 Pages 发布 |
| `tests/` | Python与Node自动测试 |
| `docs/` | 技术设计与部署说明 |

## 6. 测试

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/*.test.mjs
node --check web/app.js
```

V1不需要Python运行时API、不需要数据库或GPU。默认存储仅在本地浏览器；正式多用户、跨设备同步、登录与服务端持久化可以在V2接入。

## 7. 概率参考（5注，10元成本）

| 策略 | 至少一注中奖 | 至少回本 | 实现盈利 |
|---|---:|---:|---:|
| 中奖优先（5个不同蓝球） | 32.934660% | 4.097604% | 0.816344% |
| 回本优先（2+2+1蓝球） | 20.740961% | 14.974227% | 1.831801% |
| 盈利优先（3+2蓝球） | 14.644112% | 14.644112% | 7.124946% |

以上只针对预置模板，而非任意自选的5注组合。参考官方游戏规则：<https://www.scflcp.com.cn/yxgz/823145252.jhtml>。
