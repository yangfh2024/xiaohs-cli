/**
 * dashboard 命令 - 打开创作中心
 */
import chalk from 'chalk';
import ora from 'ora';
import * as xhs from '../lib/xhs-client.js';

export async function execute() {
  const spinner = ora(chalk.cyan('正在打开创作中心...')).start();

  try {
    await xhs.openDashboard();
    spinner.succeed(chalk.green('创作中心已打开'));

    console.log(chalk.yellow('\n请在浏览器中管理您的笔记和创作内容'));

    return { success: true };
  } catch (err) {
    spinner.fail(chalk.red(`打开创作中心失败: ${err.message}`));
    throw err;
  }
}
