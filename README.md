# B 站动态评论整理与举报工作台

本工具链覆盖从采集到举报提交的完整流程：

1. 采集评论并导出 `csv/jsonl`
2. 清洗、去重、归并与证据类型初筛
3. 切片，交由 AI 批量打标违规原因
4. 合并需举报条目
5. 批量向 B 站提交举报

---

## 完整工作流程

### 第一步：准备 Cookie

把你的 B 站网页 Cookie 放进 `config/bili-cookie.txt`，或设置环境变量 `BILI_COOKIE`。

Cookie 获取方式：在浏览器登录 B 站后，打开开发者工具 → Network → 任意请求 → 复制 `cookie` 请求头的值。

### 第二步：采集评论

```powershell
npm run collect -- --url https://www.bilibili.com/opus/123456789012345678 --out data/raw/comments --mode 2 --max-pages 300 --delay-ms 800
```

如果在 PowerShell 下 `npm` 吞掉命名参数，也可以用位置参数：

```powershell
npm run collect -- https://www.bilibili.com/opus/123456789012345678 data/raw/comments 2 300 800
```

采集完成后生成 `data/raw/comments.jsonl` 和 `data/raw/comments.csv`。

**注意日志中打印的 `comment_id`，第五步提交举报时需要用到（即 `--oid` 参数）。**

### 第三步：规范化

```powershell
npm run normalize -- --input data/raw/comments.jsonl --out data/review/comments-review.csv
```

对评论做清洗、去重、证据类型初筛，生成统一格式的 CSV。

### 第四步：切片

```powershell
npm run slice -- --input data/review/comments-review.csv
```

将 CSV 按每 200 条切成多份，输出到 `data/slices/slice-001.csv`、`slice-002.csv` 等。

可用 `--size` 调整每片大小：

```powershell
npm run slice -- --input data/review/comments-review.csv --size 100
```

**注意**：每次切片会自动清理 `data/slices/` 下已有的旧切片文件，避免数据量减少时旧文件残留被误合并。

### 第五步：AI 批量打标

逐个处理 `data/slices/` 下的每个切片：

1. 打开切片 CSV，复制全部内容
2. 参照 `AI判断prompt模板.md` 中的 Prompt，将 CSV 内容粘给 AI
3. 将 AI 输出的 CSV 覆盖保存回原切片文件（AI 只修改 `reason` 列）
4. 重复直到所有切片处理完毕

`reason` 可选值与 B 站举报原因的对应关系（完整列表由 `src/shared/reasons.js` 统一维护）：

| reason 值 | B 站举报原因 |
|---|---|
| `abuse` | 人身攻击 |
| `doxxing` | 传播他人隐私信息 |
| `spam` | 刷屏 |
| `hate_flamebait` | 引战、不友善言论 |
| `shock_image` | 低俗 |
| `porn` | 色情 |
| `illegal` | 违法违规 |
| `gambling` | 赌博诈骗 |
| `external_link` | 违法信息外链 |
| `political_rumor` | 涉政谣言 |
| `fake_info` | 虚假不实信息 |
| `social_rumor` | 涉社会事件谣言 |
| `minor` | 青少年不良信息 |
| `ad` | 垃圾广告 |
| `spoiler` | 剧透 |
| `unrelated` | 视频不相关 |
| `illegal_lottery` | 违规抽奖 |
| `other` | 其他 |

合并时会自动校验 `reason` 是否在上表中，非法值会立即报错，不会进入举报队列。

### 第六步：合并需举报条目

```powershell
npm run merge-approved
```

扫描 `data/slices/` 下所有切片，将 `reason` 非空的行合并到 `data/review/approved.csv`，并自动将 `status` 设为 `approved`。

### 第七步：提交举报

建议先用 `--dry-run` 确认待举报条目：

```powershell
npm run report -- --input data/review/approved.csv --oid 388628063 --dry-run
```

确认无误后正式提交：

```powershell
npm run report -- --input data/review/approved.csv --oid 388628063
```

`--oid` 是动态的评论区 ID，即采集日志中打印的 `comment_id` 值。

举报命令行为：
- 逐条提交 `status=approved` 的记录
- 每条之间默认等待 10000ms（`--delay-ms` 可调整）
- 举报成功后将该行 `status` 更新为 `reported`
- 举报失败的条目打印错误并跳过，不中断后续

**完整参数：**

```
--input       CSV 路径（必填）
--oid         动态评论区 ID（必填）
--cookie-file Cookie 文件路径（默认 config/bili-cookie.txt）
--type        评论区类型（默认 11，动态固定值，无需修改）
--delay-ms    举报间隔毫秒数（默认 5000）
--dry-run     仅打印待举报条目，不实际提交
```

---

## 采集器行为

评论采集器是 B 站动态专用实现：

- 动态评论接口、字段映射、分页参数都写死在脚本里
- 你只需要提供动态链接，动态 ID 会自动解析
- Cookie 从 `config/bili-cookie.txt` 或 `BILI_COOKIE` 读取
- `--mode 2` 最新评论，`--mode 3` 热门评论
- `--max-pages` 控制最多抓取页数，默认 `300`
- `--delay-ms` 控制每次请求间隔，大评论区建议设置 `800` 以上

---

## 当前限制

直接请求 B 站评论接口时，可能在高评论量动态上触发 `412 Precondition Failed`，这通常是平台风控，不是参数错误。

当前采集器已做的处理：

- 先访问 `opus` 页面，自动解析真实 `comment_id` 和 `comment_type`
- 主评论使用 `wbi/main`，楼中楼使用 `reply/reply`
- 支持显式限速 `--delay-ms`

即便如此，仍可能被服务端拦截。更稳的方式是导入浏览器已成功加载的响应数据或 HAR，再做清洗和打标。

默认忽略的本地凭证文件在 `.gitignore` 里，不会进入版本控制。

---

## 项目结构（关键模块）

```
src/
├── collector/          采集器（B 站动态评论抓取）
├── normalizer/         规范化（清洗、去重、证据类型初筛）
├── slicer/             切片（将 CSV 按批次切分）
├── annotator/          AI 辅助打标（labelSlices）
├── merger/             合并已审核条目
├── reporter/           举报提交
├── reviewer/           本地 Web 审阅工作台
└── shared/
    ├── patterns.js     统一关键词模式库（doxxing/abuse/flamebait 等正则）
    ├── reasons.js      举报原因映射（BILI_REASON_MAP）及合法值列表（ALLOWED_REASONS）
    ├── csv.js          CSV 解析与生成
    ├── fs.js           文件读写工具
    └── json.js         JSON 工具
```
