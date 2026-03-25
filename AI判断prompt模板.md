# B站评论违规判断 Prompt

使用方法：把下面这段话连同切片 CSV 内容一起粘给 AI，让 AI 直接输出修改后的完整 CSV，覆盖原文件保存。

---

## Prompt 正文（直接复制使用）

```
以下是一批 B站评论区的评论数据（CSV格式），请你逐行判断每条评论是否违规，并在 reason 列填入对应的违规类型标签。

规则：
- 不违规的评论，reason 列留空（什么都不填）
- 违规的评论，填入下方对应的标签字符串（只填一个，选最严重的）

reason 标签对照表：
doxxing      = 泄露他人隐私（开盒：包含手机号/身份证/家庭住址/真实姓名+地址组合）
abuse        = 人身攻击（直接辱骂、侮辱性称呼、诅咒）
spam         = 刷屏（同一内容大量重复出现）
hate_flamebait = 引战（煽动对立、挑衅、故意挑起群体矛盾）
shock_image  = 不适图片（鬼图、猎奇、恶心图片）
porn         = 色情
illegal      = 违法违规
gambling     = 赌博诈骗
external_link = 违法信息外链
political_rumor = 涉政谣言
fake_info    = 虚假不实信息
social_rumor = 涉社会事件谣言
minor        = 青少年不良信息
ad           = 垃圾广告
spoiler      = 剧透
unrelated    = 视频不相关
illegal_lottery = 违规抽奖
other        = 其他违规（不符合上述分类但明显违规）

注意事项：
- 有些骂人会用谐音/拼音/符号代替，请识别语义而非字面
- picture_urls 列有值但 content_raw 为空 → 大概率是纯图片评论，判断为 shock_image
- evidence_type 列是脚本预判结果，仅供参考，你需独立判断
- doxxing 优先级最高，同时触发多条时选 doxxing
- 同时触发多条（非 doxxing）时，选择最严重的一条
- 正常发言（支持/普通评价/不涉及违规）reason 留空，不要强行打标签
- 只修改 reason 列，其他所有列保持原样不变

请直接输出修改后的完整 CSV，保持原有列顺序。

以下是 CSV 数据：

[在此粘贴切片 CSV 内容]
```

---

## 完整工作流程

1. 采集评论：
   ```powershell
   npm run collect -- --url <动态URL> --out data/raw/comments --mode 2 --max-pages 300 --delay-ms 800
   ```

2. 规范化为 CSV：
   ```powershell
   npm run normalize -- --input data/raw/comments.jsonl --out data/review/comments-review.csv
   ```

3. 切片（每 200 条一份）：
   ```powershell
   npm run slice -- --input data/review/comments-review.csv
   ```
   输出到 `data/slices/slice-001.csv`、`slice-002.csv` ... 依此类推。

4. AI 批量打标：
   - 逐个打开 `data/slices/` 下的每个切片 CSV
   - 复制上方 Prompt，将 `[在此粘贴切片 CSV 内容]` 替换为切片文件的全部内容
   - 将 AI 输出的 CSV 覆盖保存回原切片文件（只改 reason 列）
   - 重复直到所有切片处理完毕

5. 合并需举报条目：
   ```powershell
   npm run merge-approved
   ```
   扫描所有切片，将 `reason` 非空的行合并到 `data/review/approved.csv`，并自动将 `status` 设为 `approved`。

6. 提交举报：
   ```powershell
   npm run report -- --input data/review/approved.csv --oid <动态评论区ID>
   ```
   `--oid` 见采集日志中打印的 `comment_id` 值。建议先加 `--dry-run` 确认条目无误再正式提交。

---

## CSV 关键列说明

| 列名 | 说明 |
|------|------|
| `content_raw` | 评论原文 |
| `content_normalized` | 脚本标准化后的文本（小写、去空格）|
| `picture_urls` | 图片链接，`\|` 分隔，空则无图 |
| `evidence_type` | 脚本预判类型，`\|` 分隔，仅供参考 |
| `reason` | **AI 填写的违规标签**，留空表示不违规 |
| `status` | 由 merge-approved 自动设置，`approved` 表示待举报 |

---

## 切片数量建议

| 评论数量 | 切片大小建议 |
|---------|-------------|
| < 500 条 | 默认 200，3 片以内 |
| 500~2000 条 | 默认 200，约 10 片 |
| > 2000 条 | 可适当减小到 100（`--size 100`），减少单次 AI 上下文压力 |
