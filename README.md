# xiaohs-cli

小红书 CLI - 搜索、采集、发布笔记

## 安装

```bash
cd ~/xiaohs-cli
npm install
npm link
```

## 使用前准备

确保已启动 kimi-webbridge:
```bash
~/.kimi-webbridge/bin/kimi-webbridge status
```

## 命令

### 搜索笔记
```bash
xiaohs search <关键词>
xiaohs search <关键词> --page 2
```

### 采集笔记
```bash
xiaohs fetch <笔记URL或ID>
xiaohs fetch <笔记URL或ID> --format json --output note.json
```

### 打开发布页面
```bash
xiaohs publish
```

### 打开创作中心
```bash
xiaohs dashboard
```

## 选项

- `--help` 显示帮助
- `--version` 显示版本

### 搜索筛选与本地过滤

```bash
xiaohs search "妈妈鞋" --time week --sort latest -l 20
xiaohs collect "妈妈鞋" -l 20 --time half-year --sort likes --min-like 100 --include "舒适,真皮" --exclude "磨脚"
xiaohs collect-lark "中年女鞋" --time 半年 --sort 最多评论 --published-from 2026-01-01 --min-collect-like-ratio 0.2
```

- `--time` 支持 `all/day/week/half-year`，也支持 `全部/一天/一周/半年`。
- `--sort` 支持 `comprehensive/latest/likes/comments`，也支持 `综合/最新/最多点赞/最多评论`。
- `collect` 和 `collect-lark` 支持本地二次过滤：`--published-from`、`--published-to`、`--min-like`、`--min-collect`、`--min-comment`、`--min-collect-like-ratio`、`--include`、`--exclude`。
- 采集默认按 `noteId` 去重；需要保留重复项可加 `--no-dedupe`。
- `collect-lark` 写入前会读取飞书多维表格已有“笔记链接”，按小红书 `noteId` 跳过历史重复记录，适合断点重跑和补采。
- 飞书写入不新增字段，筛选条件、应用状态和过滤命中会合并写入已有“你的备注”字段。
