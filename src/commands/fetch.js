/**
 * fetch 命令 - 采集笔记详情
 */
import chalk from 'chalk';
import ora from 'ora';
import * as xhs from '../lib/xhs-client.js';
import * as browser from '../lib/browser.js';
import fs from 'fs';

export async function execute(urlOrId, options) {
  const spinner = ora(chalk.cyan('正在采集笔记...')).start();

  try {
    const data = await xhs.getNoteDetail(urlOrId);
    spinner.succeed(chalk.green('采集完成'));

    // 结构化输出
    const summary = {
      noteId: data.noteId,
      noteUrl: data.noteUrl,
      title: data.title,
      noteType: data.noteType,
      authorName: data.authorName,
      authorId: data.authorId,
      likeCount: data.likeCount,
      collectCount: data.collectCount,
      commentCount: data.commentCount,
      shareCount: data.shareCount,
      publishTime: data.publishTime,
      tags: data.tags,
      coverImage: data.coverImages?.[0] || '',
      imageCount: data.coverImages?.length || 0,
      commentSampleCount: data.comments?.length || 0
    };

    console.log(chalk.bold('\n📊 笔记概要:'));
    console.log(`  标题: ${data.title || chalk.gray('无标题')}`);
    console.log(`  类型: ${data.noteType} | 点赞: ${data.likeCount} | 收藏: ${data.collectCount} | 评论: ${data.commentCount} | 分享: ${data.shareCount}`);
    console.log(`  作者: ${data.authorName} (${data.authorId})`);
    console.log(`  时间: ${data.publishTime || '未知'}`);
    console.log(`  标签: ${data.tags?.join(', ') || '无'}`);
    console.log(`  封面: ${data.coverImages?.[0] || chalk.gray('无')}`);
    console.log(`  图片: ${data.coverImages?.length || 0} 张`);
    console.log(`  打开方式: ${data.openMode || 'unknown'}`);

    if (data.content) {
      console.log(chalk.bold('\n📝 内容:'));
      console.log(`  ${data.content.substring(0, 200)}${data.content.length > 200 ? '...' : ''}`);
    }

    if (data.coverImages?.length > 0) {
      console.log(chalk.bold('\n🖼️  图片列表:'));
      data.coverImages.forEach((url, i) => {
        console.log(`  ${i + 1}. ${url}`);
      });
    }

    if (data.comments?.length > 0) {
      console.log(chalk.bold('\n💬 评论样本:'));
      data.comments.slice(0, 5).forEach((comment, index) => {
        console.log(`  ${index + 1}. ${comment.userName || '匿名'}: ${comment.content}`);
      });
    }

    // 输出完整 JSON
    const outputData = options.format === 'json'
      ? JSON.stringify(data, null, 2)
      : toMarkdown(data);
    if (options.output) {
      fs.writeFileSync(options.output, outputData, 'utf-8');
      console.log(chalk.gray(`\n已保存到: ${options.output}`));
    } else {
      if (options.format === 'json') {
        console.log(chalk.bold('\n📄 完整 JSON:'));
        console.log(outputData);
      } else {
        console.log(chalk.bold('\n📄 Markdown:'));
        console.log(outputData);
      }
    }

    // 截图
    try {
      const screenshot = await browser.screenshot({ format: 'jpeg', quality: 80 });
      console.log(chalk.gray(`截图: ${screenshot?.data?.path || screenshot?.path || 'unknown'}`));
    } catch (e) {
      // 截图失败不影响主流程
    }

    return data;
  } catch (err) {
    spinner.fail(chalk.red(`采集失败: ${err.message}`));
    throw err;
  }
}

function toMarkdown(data) {
  return `# ${data.title || '无标题'}\n\n` +
    `> 作者: ${data.authorName} | 类型: ${data.noteType} | 点赞: ${data.likeCount} | 收藏: ${data.collectCount} | 评论: ${data.commentCount}\n\n` +
    `![封面](${data.coverImages?.[0] || ''})\n\n` +
    `${data.content || ''}\n\n` +
    `标签: ${data.tags?.join(', ') || '无'}\n\n` +
    `图片数: ${data.coverImages?.length || 0}\n\n` +
    `评论样本:\n${(data.comments || []).slice(0, 5).map((comment) => `- ${comment.userName || '匿名'}: ${comment.content}`).join('\n')}\n`;
}
