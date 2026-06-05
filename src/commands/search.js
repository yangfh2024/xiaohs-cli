/**
 * search 命令 - 搜索小红书笔记
 */
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import * as xhs from '../lib/xhs-client.js';
import { normalizeSearchFilters } from '../lib/filter-options.js';

export async function execute(keyword, options) {
  const searchFilters = normalizeSearchFilters(options);
  const spinner = ora(chalk.cyan(`正在搜索: ${keyword}`)).start();

  try {
    const result = await xhs.search(
      keyword,
      parseInt(options.page, 10),
      parseInt(options.limit, 10),
      searchFilters
    );

    if (!result.isLoggedIn) {
      spinner.warn(chalk.yellow('需要登录'));
      console.log(chalk.cyan('提示: 请先在浏览器中打开 www.xiaohongshu.com 登录后重试'));
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    spinner.succeed(chalk.green(`搜索完成`));

    // 结构化输出
    const summary = {
      keyword: result.keyword,
      page: result.page,
      totalFound: result.total,
      source: result.source,
      filters: result.filters,
      appliedFilters: result.appliedFilters
    };

    console.log(chalk.bold('\n📊 搜索统计:'));
    console.log(`  关键词: ${summary.keyword}`);
    console.log(`  页码: ${summary.page}`);
    console.log(`  结果数: ${summary.totalFound}`);
    console.log(`  数据源: ${summary.source || 'unknown'}`);

    console.log(`  Time filter: ${summary.filters?.time || searchFilters.time} (${summary.filters?.timeLabel || searchFilters.timeLabel})`);
    console.log(`  Sort: ${summary.filters?.sort || searchFilters.sort} (${summary.filters?.sortLabel || searchFilters.sortLabel})`);
    console.log(`  Filter status: ${summary.appliedFilters?.status || 'unknown'} (${summary.appliedFilters?.strategy || 'unknown'})`);

    if (result.items.length > 0) {
      console.log(chalk.bold('\n📋 搜索结果:'));
      result.items.forEach((item, i) => {
        console.log(`\n  ${chalk.yellow(`${i + 1}.`)} ${item.title || chalk.gray('无标题')}`);
        console.log(`     类型: ${item.noteType} | 点赞: ${item.likeCount} | 收藏: ${item.collectCount} | 评论: ${item.commentCount}`);
        console.log(`     作者: ${item.authorName} (${item.authorId})`);
        if (item.publishTime) {
          console.log(`     发布时间: ${item.publishTime}`);
        }
        console.log(`     抓取链接: ${item.noteUrl}`);
        console.log(`     公开链接: ${item.publicNoteUrl}`);
        if (item.coverImage) {
          console.log(`     封面: ${item.coverImage.substring(0, 60)}...`);
        }
      });
    }

    // 输出完整 JSON
    console.log(chalk.bold('\n📄 完整 JSON 数据:'));
    const outputData = JSON.stringify(result, null, 2);
    if (options.output) {
      fs.writeFileSync(options.output, outputData, 'utf-8');
      console.log(chalk.gray(`已保存到: ${options.output}`));
    } else {
      console.log(outputData);
    }

    return result;
  } catch (err) {
    spinner.fail(chalk.red(`搜索失败: ${err.message}`));
    throw err;
  }
}
