const TIME_OPTIONS = {
  all: {
    value: 'all',
    label: '全部',
    aliases: ['all', '全部'],
    uiLabels: ['全部']
  },
  day: {
    value: 'day',
    label: '一天',
    aliases: ['day', '一天', '1天', '24小时', '24h'],
    uiLabels: ['一天', '一天内', '24小时内']
  },
  week: {
    value: 'week',
    label: '一周',
    aliases: ['week', '一周', '7天', '7日'],
    uiLabels: ['一周', '一周内', '7天内']
  },
  'half-year': {
    value: 'half-year',
    label: '半年',
    aliases: ['half-year', 'halfyear', 'half_year', '半年', '6个月', '六个月'],
    uiLabels: ['半年', '半年内']
  }
};

const SORT_OPTIONS = {
  comprehensive: {
    value: 'comprehensive',
    label: '综合',
    aliases: ['comprehensive', '综合', '默认'],
    uiLabels: ['综合']
  },
  latest: {
    value: 'latest',
    label: '最新',
    aliases: ['latest', '最新', '新发布'],
    uiLabels: ['最新']
  },
  likes: {
    value: 'likes',
    label: '最多点赞',
    aliases: ['likes', 'like', 'liked', '最多点赞', '点赞最多'],
    uiLabels: ['最多点赞', '点赞最多']
  },
  comments: {
    value: 'comments',
    label: '最多评论',
    aliases: ['comments', 'comment', 'commented', '最多评论', '评论最多'],
    uiLabels: ['最多评论', '评论最多']
  }
};

function normalizeChoice(input, options, fallback, optionName) {
  const value = String(input ?? fallback).trim();
  const normalized = value.toLowerCase();
  const found = Object.values(options).find((option) =>
    option.aliases.some((alias) => alias.toLowerCase() === normalized || alias === value)
  );
  if (found) return found;
  const allowed = Object.values(options).map((option) => option.value).join('/');
  throw new Error(`Invalid ${optionName}: ${value}. Allowed: ${allowed}`);
}

export function normalizeSearchFilters(options = {}) {
  const time = normalizeChoice(options.time, TIME_OPTIONS, 'all', '--time');
  const sort = normalizeChoice(options.sort, SORT_OPTIONS, 'comprehensive', '--sort');
  return {
    time: time.value,
    timeLabel: time.label,
    timeUiLabels: time.uiLabels,
    sort: sort.value,
    sortLabel: sort.label,
    sortUiLabels: sort.uiLabels
  };
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number;
}

function parseWordList(value) {
  return String(value || '')
    .split(/[,，]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

function parseDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD`);
  }
  return date.getTime();
}

export function normalizeCollectFilters(options = {}) {
  const publishedFrom = parseDateBoundary(options.publishedFrom, false);
  const publishedTo = parseDateBoundary(options.publishedTo, true);
  if (publishedFrom && publishedTo && publishedFrom > publishedTo) {
    throw new Error('--published-from cannot be later than --published-to');
  }

  return {
    publishedFrom,
    publishedTo,
    publishedFromText: options.publishedFrom || '',
    publishedToText: options.publishedTo || '',
    minLike: parseNumber(options.minLike),
    minCollect: parseNumber(options.minCollect),
    minComment: parseNumber(options.minComment),
    minCollectLikeRatio: parseNumber(options.minCollectLikeRatio),
    include: parseWordList(options.include),
    exclude: parseWordList(options.exclude),
    dedupe: options.dedupe !== false
  };
}

export function hasActiveCollectFilters(filters = {}) {
  return Boolean(
    filters.publishedFrom ||
      filters.publishedTo ||
      filters.minLike !== null ||
      filters.minCollect !== null ||
      filters.minComment !== null ||
      filters.minCollectLikeRatio !== null ||
      filters.include?.length ||
      filters.exclude?.length
  );
}

export function parseCount(value, rawValue = null) {
  if (Number.isFinite(rawValue)) return rawValue;
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!text) return 0;
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*(万|w|W)?$/);
  if (!match) return 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  return match[2] ? Math.round(number * 10000) : number;
}

function getPublishTimestamp(detail = {}, item = {}) {
  const raw = Number(detail.publishTimestamp || item.publishTimestamp || 0);
  if (raw > 0) return raw;
  const text = detail.publishTime || item.publishTime || '';
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildSearchableText(detail = {}, item = {}) {
  const comments = (detail.comments || [])
    .flatMap((comment) => [comment.content, ...(comment.replies || []).map((reply) => reply.content)])
    .filter(Boolean);
  return [
    item.title,
    detail.title,
    detail.content,
    ...(detail.tags || []),
    ...comments
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function appendThresholdReason(reasons, name, actual, min) {
  if (min !== null && actual < min) {
    reasons.push(`${name}<${min}(${actual})`);
  }
}

export function evaluateCollectFilters({ item = {}, detail = {}, filters = {} }) {
  const like = parseCount(detail.likeCount || item.likeCount, detail.likeCountRaw ?? item.likeCountRaw);
  const collect = parseCount(detail.collectCount || item.collectCount, detail.collectCountRaw ?? item.collectCountRaw);
  const comment = parseCount(detail.commentCount || item.commentCount, detail.commentCountRaw ?? item.commentCountRaw);
  const publishedAt = getPublishTimestamp(detail, item);
  const text = buildSearchableText(detail, item);
  const reasons = [];
  const hits = [];

  if ((filters.publishedFrom || filters.publishedTo) && !publishedAt) {
    reasons.push('published_time_unknown');
  }
  if (filters.publishedFrom && publishedAt && publishedAt < filters.publishedFrom) {
    reasons.push(`published_before_${filters.publishedFromText}`);
  }
  if (filters.publishedTo && publishedAt && publishedAt > filters.publishedTo) {
    reasons.push(`published_after_${filters.publishedToText}`);
  }

  appendThresholdReason(reasons, 'like', like, filters.minLike);
  appendThresholdReason(reasons, 'collect', collect, filters.minCollect);
  appendThresholdReason(reasons, 'comment', comment, filters.minComment);

  if (filters.minCollectLikeRatio !== null) {
    const ratio = like > 0 ? collect / like : 0;
    if (ratio < filters.minCollectLikeRatio) {
      reasons.push(`collect_like_ratio<${filters.minCollectLikeRatio}(${ratio.toFixed(2)})`);
    }
  }

  if (filters.include?.length) {
    const matched = filters.include.filter((word) => text.includes(word));
    if (!matched.length) {
      reasons.push(`include_miss:${filters.include.join('|')}`);
    } else {
      hits.push(`include:${matched.join('|')}`);
    }
  }

  if (filters.exclude?.length) {
    const matched = filters.exclude.filter((word) => text.includes(word));
    if (matched.length) {
      reasons.push(`exclude_hit:${matched.join('|')}`);
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
    hits,
    metrics: { like, collect, comment }
  };
}

export function buildFilterRemark({ searchFilters, appliedFilters, localFilterResult, dedupeStatus }) {
  const parts = [
    `search_time=${searchFilters.time}(${searchFilters.timeLabel})`,
    `search_sort=${searchFilters.sort}(${searchFilters.sortLabel})`
  ];
  if (appliedFilters?.status) {
    parts.push(`filter_status=${appliedFilters.status}`);
  }
  if (localFilterResult) {
    parts.push(localFilterResult.passed ? 'local_filter=pass' : `local_filter=drop:${localFilterResult.reasons.join('|')}`);
    parts.push(...(localFilterResult.hits || []));
  }
  if (dedupeStatus) {
    parts.push(`dedupe=${dedupeStatus}`);
  }
  return parts.join('; ');
}

export function mergeRemarks(...parts) {
  return parts
    .flat()
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('; ');
}
