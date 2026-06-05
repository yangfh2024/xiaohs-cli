/**
 * collect 命令 - 批量搜索并采集笔记，输出适合产品趋势分析的 CSV
 */
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as xhs from '../lib/xhs-client.js';
import { toCsv } from '../lib/csv.js';
import { analyzeNote } from '../lib/product-analyzer.js';
import {
  buildFilterRemark,
  evaluateCollectFilters,
  mergeRemarks,
  normalizeCollectFilters,
  normalizeSearchFilters
} from '../lib/filter-options.js';

const COLUMNS = [
  '采集日期',
  '关键词',
  '排序方式',
  '笔记链接',
  '标题',
  '发布时间',
  '作者类型',
  '粉丝数',
  '点赞',
  '收藏',
  '评论',
  '鞋型',
  '穿脱方式',
  '鞋头',
  '跟型',
  '颜色',
  '材质',
  '价格',
  '适用场景',
  '核心卖点',
  '高频评论关键词',
  '负面反馈关键词',
  '你的备注'
];

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

function resolveOutputPath(output, collectionDate) {
  if (output) return path.resolve(output);
  return path.resolve(process.cwd(), `xiaohs-collect-${collectionDate}.csv`);
}

function toRow({ collectionDate, keyword, sort, item, detail, filterRemark }) {
  const analysis = analyzeNote(detail, item);
  return {
    采集日期: collectionDate,
    关键词: keyword,
    排序方式: sort,
    笔记链接: detail.noteUrl || item.noteUrl || item.publicNoteUrl || '',
    标题: detail.title || item.title || '',
    发布时间: detail.publishTime || item.publishTime || '',
    作者类型: analysis.authorType,
    粉丝数: analysis.followerCount,
    点赞: detail.likeCount || item.likeCount || '',
    收藏: detail.collectCount || item.collectCount || '',
    评论: detail.commentCount || item.commentCount || '',
    鞋型: analysis.shoeType,
    穿脱方式: analysis.wearMethod,
    鞋头: analysis.toeShape,
    跟型: analysis.heelType,
    颜色: analysis.colors,
    材质: analysis.material,
    价格: analysis.price,
    适用场景: analysis.scenes,
    核心卖点: analysis.sellingPoints,
    高频评论关键词: analysis.frequentCommentKeywords,
    负面反馈关键词: analysis.negativeKeywords,
    你的备注: mergeRemarks(analysis.remarks, filterRemark)
  };
}

export async function execute(keywords, options) {
  const keywordList = normalizeKeywords(keywords);
  const limit = Math.max(1, parseInt(options.limit, 10) || 5);
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const searchFilters = normalizeSearchFilters(options);
  const collectFilters = normalizeCollectFilters(options);
  const sort = searchFilters.sortLabel;
  const collectionDate = todayInChina();
  const outputPath = resolveOutputPath(options.output, collectionDate);
  const rows = [];
  const seenNoteIds = new Set();
  const detailCache = new Map();
  const profileCache = new Map();

  if (!keywordList.length) {
    throw new Error('请至少提供一个关键词');
  }

  console.log(chalk.cyan(`准备采集 ${keywordList.length} 个关键词，每个关键词前 ${limit} 条`));

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

      rows.push(toRow({
        item,
        detail,
        collectionDate,
        keyword,
        sort,
        filterRemark
      }));
    }
  }

  const csv = toCsv(rows, COLUMNS);
  fs.writeFileSync(outputPath, `\uFEFF${csv}`, 'utf-8');

  console.log(chalk.green(`\n采集完成: ${rows.length} 行`));
  console.log(chalk.gray(`CSV: ${outputPath}`));

  return {
    outputPath,
    rows,
    total: rows.length
  };
}
