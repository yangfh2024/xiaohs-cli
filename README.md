# xiaohs-cli

小红书 CLI 工具 - 搜索、采集、发布笔记，支持本地过滤和飞书多维表格写入。

## 环境要求

- Node.js >= 18.0.0
- [kimi-webbridge](https://github.com/HuolalaTech/kimi-workspace-bridge)（小红书登录态桥接）

## 安装

```bash
cd ~/xiaohs-cli
npm install
npm link
```

## 前置准备

### 1. 启动 kimi-webbridge

kimi-webbridge 用于保持小红书登录态，确保 CLI 能访问需要登录的数据。

```bash
# 检查状态
~/.kimi-webbridge/bin/kimi-webbridge status

# 启动（如未运行）
~/.kimi-webbridge/bin/kimi-webbridge start
```

### 2. 飞书配置（如使用 `collect-lark`）

在项目根目录创建 `.env` 文件，填入飞书应用凭证：

```env
LARK_APP_ID=cli_xxxxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
LARK_BITABLE_ID=xxxxxxxxxxxxxxxxxx
```

> 飞书多维表格 ID 获取方式：打开多维表格 → 地址栏 URL 中 `/base/` 后的字符即为 ID。

---

## 命令

### search - 搜索笔记

搜索小红书笔记并查看结果概览。

```bash
xiaohs search <关键词>
xiaohs search <关键词> --page 2 --limit 30
```

**选项：**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-l, --limit <number>` | 结果数量限制 | 20 |
| `-p, --page <number>` | 页码 | 1 |
| `--time <time>` | 时间筛选 | all |
| `-s, --sort <sort>` | 排序方式 | comprehensive |
| `-o, --output <path>` | 输出 JSON 文件路径 | - |

**时间筛选值：** `all` / `day` / `week` / `half-year`（也支持中文：全部/一天/一周/半年）

**排序值：** `comprehensive` / `latest` / `likes` / `comments`（也支持中文：综合/最新/最多点赞/最多评论）

---

### fetch - 采集单篇笔记

采集单篇笔记的完整详情。

```bash
xiaohs fetch <笔记URL或ID>
xiaohs fetch <笔记URL或ID> --format markdown --output note.md
```

**选项：**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-f, --format <format>` | 输出格式：`json` 或 `markdown` | json |
| `-o, --output <path>` | 输出文件路径 | stdout |
| `-i, --interactive` | 交互式选择笔记 | false |

---

### collect - 批量采集（CSV）

批量搜索关键词，采集笔记详情，输出适合产品趋势分析的 CSV 文件。

```bash
xiaohs collect "妈妈鞋" -l 10
xiaohs collect "妈妈鞋,真皮女鞋" -l 20 --time half-year --sort likes
```

**选项：**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-l, --limit <number>` | 每个关键词采集数量 | 5 |
| `-p, --page <number>` | 页码 | 1 |
| `--time <time>` | 时间筛选 | all |
| `-s, --sort <sort>` | 排序方式 | comprehensive |
| `--published-from <date>` | 本地过滤：发布日期起始（YYYY-MM-DD） | - |
| `--published-to <date>` | 本地过滤：发布日期截止（YYYY-MM-DD） | - |
| `--min-like <number>` | 本地过滤：最少点赞数 | - |
| `--min-collect <number>` | 本地过滤：最少收藏数 | - |
| `--min-comment <number>` | 本地过滤：最少评论数 | - |
| `--min-collect-like-ratio <number>` | 本地过滤：最小收藏/点赞比 | - |
| `--include <words>` | 本地过滤：标题/正文/标签/评论包含任一词（逗号分隔） | - |
| `--exclude <words>` | 本地过滤：标题/正文/标签/评论命中则排除（逗号分隔） | - |
| `--no-dedupe` | 关闭 noteId 去重 | false |
| `-o, --output <path>` | CSV 输出文件路径 | xiaohs-collect-YYYY-MM-DD.csv |
| `--no-profile` | 不采集作者主页粉丝数 | false |

**CSV 输出字段：**

采集日期、关键词、排序方式、笔记链接、标题、发布时间、作者类型、粉丝数、点赞、收藏、评论、鞋型、穿脱方式、鞋头、跟型、颜色、材质、价格、适用场景、核心卖点、高频评论关键词、负面反馈关键词、你的备注

**示例：**

```bash
# 采集女鞋趋势，筛选高互动、高收藏/点赞比的笔记
xiaohs collect "中年女鞋" -l 20 --time half-year --sort likes \
  --min-like 100 --min-collect 50 --min-collect-like-ratio 0.2 \
  --include "舒适,真皮,透气" --exclude "磨脚,掉跟"

# 关键词列表支持逗号分隔
xiaohs collect "妈妈鞋,奶奶鞋,乐福鞋" -l 10 -o shoes-trend.csv
```

---

### collect-lark - 批量采集并写入飞书

批量搜索关键词，采集笔记详情，自动写入飞书多维表格。

```bash
xiaohs collect-lark "中年女鞋" -l 10
xiaohs collect-lark "妈妈鞋" --time 半年 --sort 最多评论
```

**选项：** 与 `collect` 相同（飞书写入不支持 `-o, --output`）。

**额外选项：**

| 选项 | 说明 |
|------|------|
| `--dry-run` | 只采集并预览，不写入飞书 |

**特性：**

- 自动按小红书 `noteId` 去重，跳过历史已采集的笔记（适合断点重跑）
- 写入前读取飞书多维表格已有"笔记链接"字段
- 飞书写入不新增字段，筛选条件和过滤命中会合并写入"你的备注"字段

**示例：**

```bash
# 采集并写入飞书
xiaohs collect-lark "中年女鞋" -l 20 --time half-year --sort 最多评论 \
  --published-from 2026-01-01 --min-collect-like-ratio 0.2

# 预览模式（不写入飞书）
xiaohs collect-lark "妈妈鞋" -l 5 --dry-run
```

---

### publish - 发布笔记

打开发布页面（浏览器打开小红书发布入口）。

```bash
xiaohs publish
xiaohs publish --title "我的笔记标题" --content "笔记内容..."
```

**选项：**

| 选项 | 说明 |
|------|------|
| `-t, --title <title>` | 笔记标题 |
| `-c, --content <content>` | 笔记内容 |
| `--images <paths>` | 图片路径（逗号分隔） |

> 注：CLI 仅打开发布页面，具体发布操作仍需在浏览器中完成。

---

### dashboard - 创作中心

打开发布小红书创作中心页面。

```bash
xiaohs dashboard
```

---

## 飞书多维表格字段要求

`collect-lark` 命令要求目标多维表格包含以下字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 笔记链接 | 文本 | 小红书笔记链接 |
| 标题 | 文本 | 笔记标题 |
| 采集日期 | 文本 | 格式：YYYY-MM-DD |
| 关键词 | 文本 | 搜索关键词 |
| 排序方式 | 文本 | 如：最多评论 |
| 发布时间 | 文本 | 笔记原始发布时间 |
| 作者类型 | 文本 | 如：个人博主、商家 |
| 粉丝数 | 数字 | 作者粉丝数 |
| 点赞 | 数字 | 笔记点赞数 |
| 收藏 | 数字 | 笔记收藏数 |
| 评论 | 数字 | 笔记评论数 |
| 鞋型 | 文本 | 分析字段 |
| 穿脱方式 | 文本 | 分析字段 |
| 鞋头 | 文本 | 分析字段 |
| 跟型 | 文本 | 分析字段 |
| 颜色 | 文本 | 分析字段 |
| 材质 | 文本 | 分析字段 |
| 价格 | 文本 | 分析字段 |
| 适用场景 | 文本 | 分析字段 |
| 核心卖点 | 文本 | 分析字段 |
| 高频评论关键词 | 文本 | 分析字段 |
| 负面反馈关键词 | 文本 | 分析字段 |
| 你的备注 | 文本 | 采集备注信息 |

---

## 常见问题

**Q: 搜索提示"需要登录"**
A: 确保 kimi-webbridge 已启动并正常运行。在浏览器中打开 www.xiaohongshu.com 登录后重试。

**Q: 飞书写入失败**
A: 检查 `.env` 中的 `LARK_APP_ID`、`LARK_APP_SECRET`、`LARK_BITABLE_ID` 是否正确，以及飞书应用是否有该多维表格的读写权限。

**Q: 采集数量为 0**
A: 检查网络连接，以及 kimi-webbridge 是否正常保持登录态。可先用 `xiaohs search` 确认能获取到数据。

---

## License

MIT
