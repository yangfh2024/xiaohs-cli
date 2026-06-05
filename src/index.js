#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as searchCmd from './commands/search.js';
import * as fetchCmd from './commands/fetch.js';
import * as collectCmd from './commands/collect.js';
import * as collectLarkCmd from './commands/collect-lark.js';
import * as publishCmd from './commands/publish.js';
import * as dashboardCmd from './commands/dashboard.js';

const program = new Command();

program
  .name('xiaohs')
  .description('小红书 CLI - 搜索、采集、发布笔记')
  .version('1.0.0');

// 搜索命令
program
  .command('search <keyword>')
  .description('搜索小红书笔记')
  .option('-l, --limit <number>', '结果数量限制', '20')
  .option('-p, --page <number>', '页码', '1')
  .option('--time <time>', '时间筛选 all/day/week/half-year 或 全部/一天/一周/半年', 'all')
  .option('-s, --sort <sort>', '排序 comprehensive/latest/likes/comments 或 综合/最新/最多点赞/最多评论', 'comprehensive')
  .option('-o, --output <path>', '输出 JSON 文件路径')
  .action(searchCmd.execute);

// 采集命令
program
  .command('fetch <url-or-id>')
  .description('采集笔记详情 (支持 URL 或笔记 ID)')
  .option('-f, --format <format>', '输出格式 (json/markdown)', 'json')
  .option('-o, --output <path>', '输出文件路径')
  .option('-i, --interactive', '交互式选择笔记')
  .action(fetchCmd.execute);

// 批量采集命令
program
  .command('collect <keywords...>')
  .description('批量搜索并采集产品趋势分析 CSV')
  .option('-l, --limit <number>', '每个关键词采集数量', '5')
  .option('-p, --page <number>', '页码', '1')
  .option('--time <time>', '时间筛选 all/day/week/half-year 或 全部/一天/一周/半年', 'all')
  .option('-s, --sort <sort>', '排序 comprehensive/latest/likes/comments 或 综合/最新/最多点赞/最多评论', 'comprehensive')
  .option('--published-from <date>', '本地过滤：发布日期起始 YYYY-MM-DD')
  .option('--published-to <date>', '本地过滤：发布日期截止 YYYY-MM-DD')
  .option('--min-like <number>', '本地过滤：最少点赞数')
  .option('--min-collect <number>', '本地过滤：最少收藏数')
  .option('--min-comment <number>', '本地过滤：最少评论数')
  .option('--min-collect-like-ratio <number>', '本地过滤：最小收藏/点赞比')
  .option('--include <words>', '本地过滤：标题/正文/标签/评论包含任一词，逗号分隔')
  .option('--exclude <words>', '本地过滤：标题/正文/标签/评论命中则排除，逗号分隔')
  .option('--no-dedupe', '关闭 noteId 去重')
  .option('-o, --output <path>', 'CSV 输出文件路径')
  .option('--no-profile', '不采集作者主页粉丝数')
  .action(collectCmd.execute);

// 批量采集并写入飞书
program
  .command('collect-lark <keywords...>')
  .description('批量搜索并采集产品趋势分析数据，写入飞书多维表格')
  .option('-l, --limit <number>', '每个关键词采集数量', '5')
  .option('-p, --page <number>', '页码', '1')
  .option('--time <time>', '时间筛选 all/day/week/half-year 或 全部/一天/一周/半年', 'all')
  .option('-s, --sort <sort>', '排序 comprehensive/latest/likes/comments 或 综合/最新/最多点赞/最多评论', 'comprehensive')
  .option('--published-from <date>', '本地过滤：发布日期起始 YYYY-MM-DD')
  .option('--published-to <date>', '本地过滤：发布日期截止 YYYY-MM-DD')
  .option('--min-like <number>', '本地过滤：最少点赞数')
  .option('--min-collect <number>', '本地过滤：最少收藏数')
  .option('--min-comment <number>', '本地过滤：最少评论数')
  .option('--min-collect-like-ratio <number>', '本地过滤：最小收藏/点赞比')
  .option('--include <words>', '本地过滤：标题/正文/标签/评论包含任一词，逗号分隔')
  .option('--exclude <words>', '本地过滤：标题/正文/标签/评论命中则排除，逗号分隔')
  .option('--no-dedupe', '关闭 noteId 去重')
  .option('--no-profile', '不采集作者主页粉丝数')
  .option('--dry-run', '只采集并预览，不写入飞书')
  .action(collectLarkCmd.execute);

// 发布命令
program
  .command('publish')
  .description('发布小红书笔记 (打开发布页面)')
  .option('-t, --title <title>', '笔记标题')
  .option('-c, --content <content>', '笔记内容')
  .option('--images <paths>', '图片路径 (逗号分隔)')
  .action(publishCmd.execute);

// 创作中心
program
  .command('dashboard')
  .description('打开小红书创作中心')
  .action(dashboardCmd.execute);

program.parse();
