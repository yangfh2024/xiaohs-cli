/**
 * collect-lark 命令 - 批量搜索并采集笔记，写入飞书多维表格
 */
import chalk from 'chalk';
import ora from 'ora';
import * as xhs from '../lib/xhs-client.js';
import { analyzeProduct } from '../lib/product-analyzer.js';
import { validateBitableConfig, writeRowsToBitable } from '../lib/lark-client.js';
import {
  buildFilterRemark,
  evaluateCollectFilters,
  mergeRemarks,
  normalizeCollectFilters,
  normalizeSearchFilters
} from '../lib/filter-options.js';

function todayInChina() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeKeywords(keywords) {
  return keywords
    .flatMap((keyword) => String(keyword).split(/[，,\n\r]+/))
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

export async function execute(keywords, options) {
  const keywordList = normalizeKeywords(keywords);
  const limit = Math.max(1, parseInt(options.limit, 10) || 5);
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const searchFilters = normalizeSearchFilters(options);
  const collectFilters = normalizeCollectFilters(options);
  const sort = searchFilters.sortLabel;
  const collectionDate = todayInChina();
  const rows = [];
  const seenNoteIds = new Set();
  const detailCache = new Map();
  const profileCache = new Map();

  if (!keywordList.length) {
    throw new Error('请至少提供一个关键词');
  }

  if (!options.dryRun) {
    try {
      validateBitableConfig();
    } catch (err) {
      console.error(chalk.red(err.message));
      process.exitCode = 1;
      return { rows: [], total: 0, error: err.message };
    }
  }

  console.log(chalk.cyan(`准备采集 ${keywordList.length} 个关键词，每个关键词前 ${limit} 条，并写入飞书`));

  for (const keyword of keywordList) {
    const searchSpinner = ora(chalk.cyan(`搜索: ${keyword}`)).start();
    let result;

    try {
      result = await xhs.search(keyword, page, limit, searchFilters);
      searchSpinner.succeed(chalk.green(`搜索完成: ${keyword} (${result.items.length} 条)`));
    } catch (err) {
      searchSpinner.fail(chalk.red(`搜索失败: ${keyword} - ${err.message}`));
      continue;
    }

    for (const item of result.items.slice(0, limit)) {
      const noteKey = item.noteId || item.noteUrl;
      const fetchSpinner = ora(chalk.cyan(`采集详情: ${keyword} #${item.rank} ${item.title || item.noteId}`)).start();
      let detail = null;

      try {
        if (noteKey && detailCache.has(noteKey)) {
          detail = detailCache.get(noteKey);
        } else {
          detail = await xhs.getNoteDetail(item.noteUrl || item.noteId);
          if (noteKey) detailCache.set(noteKey, detail);
        }
        fetchSpinner.succeed(chalk.green(`详情完成: ${item.title || item.noteId}`));
      } catch (err) {
        fetchSpinner.fail(chalk.yellow(`详情失败，保留搜索卡片: ${item.title || item.noteId} - ${err.message}`));
        detail = {
          noteUrl: item.noteUrl,
          title: item.title,
          publishTime: item.publishTime,
          authorName: item.authorName,
          authorId: item.authorId,
          authorXsecToken: item.authorXsecToken,
          likeCount: item.likeCount,
          collectCount: item.collectCount,
          commentCount: item.commentCount,
          comments: [],
          tags: []
        };
      }

      if (options.profile !== false) {
        const authorId = detail.authorId || item.authorId;
        const authorToken = detail.authorXsecToken || item.authorXsecToken || '';
        if (authorId) {
          const profileSpinner = ora(chalk.cyan(`采集作者: ${detail.authorName || item.authorName || authorId}`)).start();
          try {
            let profile = profileCache.get(authorId);
            if (!profile) {
              profile = await xhs.getUserProfile(authorId, authorToken);
              profileCache.set(authorId, profile);
            }
            detail.fansCount = profile.fansCount || '';
            profileSpinner.succeed(chalk.green(`作者完成: ${detail.authorName || item.authorName || authorId}`));
          } catch (err) {
            profileSpinner.fail(chalk.yellow(`作者失败，粉丝数留空: ${detail.authorName || item.authorName || authorId} - ${err.message}`));
          }
        }
      }

      const noteId = detail.noteId || item.noteId || '';
      if (collectFilters.dedupe && noteId) {
        if (seenNoteIds.has(noteId)) {
          console.log(chalk.gray(`跳过去重: ${keyword} ${item.title || noteId}`));
          continue;
        }
        seenNoteIds.add(noteId);
      }

      const localFilterResult = evaluateCollectFilters({ item, detail, filters: collectFilters });
      if (!localFilterResult.passed) {
        console.log(chalk.gray(`跳过过滤: ${keyword} ${item.title || item.noteId} - ${localFilterResult.reasons.join(', ')}`));
        continue;
      }

      const filterRemark = buildFilterRemark({
        searchFilters,
        appliedFilters: result.appliedFilters,
        localFilterResult,
        dedupeStatus: collectFilters.dedupe ? 'kept' : 'off'
      });

      const row = analyzeProduct({
        searchItem: item,
        detail,
        collectionDate,
        sort
      });
      row['你的备注'] = mergeRemarks(row['你的备注'], filterRemark);
      rows.push(row);
    }
  }

  if (options.dryRun) {
    console.log(chalk.yellow(`\nDry run: 已采集 ${rows.length} 行，未写入飞书`));
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return { rows, total: rows.length, dryRun: true };
  }

  const writeSpinner = ora(chalk.cyan(`正在写入飞书多维表格: ${rows.length} 行`)).start();
  try {
    const result = await writeRowsToBitable(rows);
    writeSpinner.succeed(chalk.green(`飞书写入完成: ${result.created} 行，${result.batches} 批，跳过 ${result.skipped || 0} 行，批内重复 ${result.duplicates || 0} 行`));
    return { rows, total: rows.length, lark: result };
  } catch (err) {
    writeSpinner.fail(chalk.red(`飞书写入失败: ${err.message}`));
    throw err;
  }
}
