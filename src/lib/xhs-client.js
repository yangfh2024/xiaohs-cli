/**
 * 小红书特定页面交互逻辑
 */
import * as browser from './browser.js';
import chalk from 'chalk';
import { cacheSearchResults, getCachedNote } from './cache.js';
import { normalizeSearchFilters } from './filter-options.js';

const XHS_BASE = 'https://www.xiaohongshu.com';
const XHS_SEARCH = `${XHS_BASE}/search_result`;
const XHS_EXPLORE = `${XHS_BASE}/explore/`;
const XHS_PROFILE = `${XHS_BASE}/user/profile/`;

export function parseNoteId(input) {
  if (/^[0-9a-f]{24}$/i.test(input)) return input;
  const match = String(input).match(/(?:explore|search_result)\/([0-9a-f]{24})/i);
  return match ? match[1] : String(input).trim();
}

export function parseNoteRef(input) {
  const value = String(input).trim();
  const noteId = parseNoteId(value);
  const tokenMatch = value.match(/[?&]xsec_token=([^&]+)/i);
  const sourceMatch = value.match(/[?&]xsec_source=([^&]+)/i);
  const isFullUrl = /^https?:\/\//i.test(value);

  return {
    noteId,
    isFullUrl,
    xsecToken: tokenMatch ? decodeURIComponent(tokenMatch[1]) : '',
    xsecSource: sourceMatch ? decodeURIComponent(sourceMatch[1]) : 'pc_search',
    raw: value
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCount(value) {
  if (value === undefined || value === null || value === '') return '0';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  if (numeric >= 10000) {
    const wan = numeric / 10000;
    return `${wan >= 100 ? wan.toFixed(0) : wan.toFixed(1).replace(/\.0$/, '')}万`;
  }
  return String(numeric);
}

function formatTimestamp(timestamp) {
  const value = Number(timestamp);
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function normalizeImageUrl(url = '') {
  if (!url) return '';
  return url.replace(/^http:\/\//i, 'https://');
}

function buildSearchUrl(keyword, page = 1) {
  const params = new URLSearchParams({
    keyword,
    type: '51'
  });
  if (page > 1) {
    params.set('page', String(page));
  }
  return `${XHS_SEARCH}?${params.toString()}`;
}

function buildSearchNoteUrl(noteId, xsecToken, xsecSource = 'pc_search') {
  const params = new URLSearchParams();
  if (xsecToken) params.set('xsec_token', xsecToken);
  if (xsecSource) params.set('xsec_source', xsecSource);
  const query = params.toString();
  return `${XHS_SEARCH}/${noteId}${query ? `?${query}` : ''}`;
}

function buildPublicNoteUrl(noteId) {
  return `${XHS_EXPLORE}${noteId}`;
}

function buildUserProfileUrl(userId, xsecToken = '') {
  const params = new URLSearchParams();
  if (xsecToken) params.set('xsec_token', xsecToken);
  const query = params.toString();
  return `${XHS_PROFILE}${userId}${query ? `?${query}` : ''}`;
}

async function navigateTo(url, groupTitle) {
  let result = await browser.navigate(url, { newTab: false, group_title: groupTitle });
  if (!result?.ok) {
    result = await browser.navigate(url, { newTab: true, group_title: groupTitle });
  }
  if (!result?.ok) {
    throw new Error(`页面打开失败: ${result?.error?.message || url}`);
  }
  await sleep(5000);
}

function extractPublishTimeFromCard(noteCard = {}) {
  const publishTag = (noteCard.cornerTagInfo || []).find((tag) => tag?.type === 'publish_time' && tag?.text);
  return publishTag?.text || '';
}

function mapSearchItem(feed, keyword, page, rank) {
  const noteCard = feed?.noteCard || {};
  const interactInfo = noteCard.interactInfo || {};
  const user = noteCard.user || {};
  const noteId = feed?.id || noteCard?.noteId || '';
  const xsecToken = feed?.xsecToken || noteCard?.xsecToken || '';
  const imageList = noteCard.imageList || [];
  const cover = noteCard.cover || {};
  const coverImage = normalizeImageUrl(
    cover.urlDefault ||
      cover.urlPre ||
      imageList[0]?.urlDefault ||
      imageList[0]?.urlPre ||
      imageList[0]?.infoList?.find?.((info) => info?.imageScene === 'WB_DFT')?.url ||
      imageList[0]?.infoList?.[0]?.url ||
      ''
  );
  const noteType = noteCard.type === 'video' ? '视频' : '图文';
  const publishTimeRaw = noteCard.time || feed?.publishTime || '';
  const publishTime = publishTimeRaw ? formatTimestamp(publishTimeRaw) : extractPublishTimeFromCard(noteCard);

  return {
    keyword,
    page,
    rank,
    noteId,
    noteUrl: buildSearchNoteUrl(noteId, xsecToken, 'pc_search'),
    publicNoteUrl: buildPublicNoteUrl(noteId),
    title: noteCard.displayTitle || noteCard.title || '',
    authorName: user.nickname || user.nickName || '',
    authorId: user.userId || '',
    authorXsecToken: user.xsecToken || '',
    likeCount: formatCount(interactInfo.likedCount),
    likeCountRaw: Number(interactInfo.likedCount || 0),
    collectCount: formatCount(interactInfo.collectedCount),
    collectCountRaw: Number(interactInfo.collectedCount || 0),
    commentCount: formatCount(interactInfo.commentCount),
    commentCountRaw: Number(interactInfo.commentCount || 0),
    shareCount: formatCount(interactInfo.sharedCount || interactInfo.shareCount),
    shareCountRaw: Number(interactInfo.sharedCount || interactInfo.shareCount || 0),
    coverImage,
    noteType,
    publishTime,
    xsecToken,
    raw: {
      feedId: feed?.id || '',
      trackId: feed?.trackId || '',
      modelType: feed?.modelType || '',
      noteCard
    }
  };
}

function extractDetailEntry(detailMap, expectedId) {
  if (expectedId && detailMap?.[expectedId]?.note) {
    return detailMap[expectedId];
  }

  for (const [key, entry] of Object.entries(detailMap || {})) {
    if (entry?.note?.noteId === expectedId || key === expectedId) {
      return entry;
    }
  }

  return Object.values(detailMap || {}).find((entry) => entry?.note) || null;
}

function mapComments(commentState) {
  const list = Array.isArray(commentState?.list) ? commentState.list : [];
  return list.map((comment) => ({
    id: comment.id || '',
    content: comment.content || '',
    likeCount: formatCount(comment.likeCount),
    likeCountRaw: Number(comment.likeCount || 0),
    createTime: formatTimestamp(comment.createTime),
    userId: comment.userInfo?.userId || '',
    userName: comment.userInfo?.nickname || '',
    userAvatar: normalizeImageUrl(comment.userInfo?.image || ''),
    ipLocation: comment.ipLocation || '',
    subCommentCount: Number(comment.subCommentCount || 0),
    replies: Array.isArray(comment.subComments)
      ? comment.subComments.map((reply) => ({
          id: reply.id || '',
          content: reply.content || '',
          userId: reply.userInfo?.userId || '',
          userName: reply.userInfo?.nickname || '',
          createTime: formatTimestamp(reply.createTime)
        }))
      : []
  }));
}

function mapImageList(imageList) {
  return (imageList || [])
    .map((image) =>
      normalizeImageUrl(
        image?.urlDefault ||
          image?.urlPre ||
          image?.url ||
          image?.infoList?.find?.((info) => info?.imageScene === 'WB_DFT')?.url ||
          image?.infoList?.[0]?.url ||
          ''
      )
    )
    .filter(Boolean);
}

function extractCountBeforeLabel(lines, label) {
  const index = lines.findIndex((line) => line === label || line.endsWith(label));
  if (index > 0) return lines[index - 1] || '';
  const inline = lines.find((line) => line.includes(label) && /[0-9.]+/.test(line));
  return inline?.match(/([0-9.]+\s*[万wW]?)/)?.[1]?.trim() || '';
}

async function extractSearchState(limit) {
  return browser.evalJS(`function () {
    const state = window.__INITIAL_STATE__ || {};
    const searchState = state.search || {};
    const feeds = searchState.feeds?._value || searchState.feeds?._rawValue || searchState.feeds || [];
    const searchContext = searchState.searchContext || {};
    const items = feeds
      .filter((feed) => feed && feed.noteCard)
      .slice(0, ${Math.max(1, Number(limit) || 20)});
    return JSON.stringify({
      title: document.title,
      url: location.href,
      searchContext,
      feeds: items
    });
  }`);
}

async function clickVisibleText(labels, debugLabel) {
  return browser.evalJS(`function () {
    const labels = ${JSON.stringify(labels)};
    const debugLabel = ${JSON.stringify(debugLabel)};
    const normalize = (value) => String(value || '').replace(/\\s+/g, '').trim();
    const wanted = labels.map(normalize).filter(Boolean);
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], a, li, span, div'));
    const candidates = nodes
      .filter(isVisible)
      .map((el) => {
        const text = normalize(el.innerText || el.textContent || '');
        return { el, text };
      })
      .filter(({ text }) => text && wanted.some((label) => text === label || text.includes(label)))
      .sort((a, b) => {
        const aExact = wanted.includes(a.text) ? 0 : 1;
        const bExact = wanted.includes(b.text) ? 0 : 1;
        return aExact - bExact || a.text.length - b.text.length;
      });

    const picked = candidates[0];
    if (!picked) {
      return JSON.stringify({ ok: false, debugLabel, labels, reason: 'text_not_found' });
    }

    const target = picked.el.closest('button, [role="button"], a, li') || picked.el;
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    target.click();
    return JSON.stringify({
      ok: true,
      debugLabel,
      labels,
      clickedText: picked.text,
      tagName: target.tagName,
      className: target.className || ''
    });
  }`);
}

async function clickFilterOption({ labels, triggerLabels = [], debugLabel }) {
  if (triggerLabels.length) {
    const trigger = await clickVisibleText(triggerLabels, `${debugLabel}_trigger`);
    await sleep(800);
    const afterTrigger = await clickVisibleText(labels, debugLabel);
    if (afterTrigger?.ok) {
      return { ...afterTrigger, mode: 'after_trigger', trigger };
    }

    const direct = await clickVisibleText(labels, debugLabel);
    if (direct?.ok) return { ...direct, mode: 'direct_fallback', trigger, afterTrigger };

    return {
      ...afterTrigger,
      ok: false,
      mode: 'after_trigger',
      trigger,
      direct
    };
  }

  const direct = await clickVisibleText(labels, debugLabel);
  if (direct?.ok) return { ...direct, mode: 'direct' };
  return direct;
}

async function readFilterSnapshot() {
  return browser.evalJS(`function () {
    return JSON.stringify({
      url: location.href,
      title: document.title,
      text: document.body ? document.body.innerText.slice(0, 2000) : ''
    });
  }`);
}

async function applySearchFilters(filters) {
  const normalized = normalizeSearchFilters(filters);
  const steps = [];
  const requests = [];

  if (normalized.time !== 'all') {
    requests.push({
      type: 'time',
      labels: normalized.timeUiLabels,
      triggerLabels: ['筛选', '时间', '发布时间', '全部'],
      debugLabel: `time_${normalized.time}`
    });
  }

  if (normalized.sort !== 'comprehensive') {
    requests.push({
      type: 'sort',
      labels: normalized.sortUiLabels,
      triggerLabels: ['综合', '排序'],
      debugLabel: `sort_${normalized.sort}`
    });
  }

  for (const request of requests) {
    const step = await clickFilterOption(request).catch((err) => ({
      ok: false,
      debugLabel: request.debugLabel,
      reason: err.message
    }));
    steps.push({ type: request.type, ...step });
    if (step?.ok) await sleep(2000);
  }

  const snapshot = await readFilterSnapshot().catch((err) => ({ error: err.message }));
  const status = requests.length === 0
    ? 'default'
    : steps.every((step) => step.ok)
      ? 'applied'
      : steps.some((step) => step.ok)
        ? 'partial'
        : 'not_applied';

  return {
    requested: {
      time: normalized.time,
      timeLabel: normalized.timeLabel,
      sort: normalized.sort,
      sortLabel: normalized.sortLabel
    },
    status,
    strategy: 'ui_click_best_effort',
    steps,
    finalUrl: snapshot?.url || '',
    pageTitle: snapshot?.title || '',
    error: snapshot?.error || ''
  };
}

async function extractDetailState(noteId) {
  return browser.evalJS(`function () {
    const state = window.__INITIAL_STATE__ || {};
    const noteState = state.note || {};
    const detailMap = noteState.noteDetailMap || {};
    const noteId = ${JSON.stringify(noteId)};
    const entry = detailMap[noteId] || Object.values(detailMap).find((item) => item && item.note && item.note.noteId === noteId) || null;
    const note = entry?.note || null;
    const comments = entry?.comments || null;
    return JSON.stringify({
      title: document.title,
      url: location.href,
      note,
      comments,
      mapKeys: Object.keys(detailMap)
    });
  }`);
}

async function openSearchResultDetail(item) {
  await navigateTo(buildSearchUrl(item.keyword, item.page || 1), '小红书搜索');

  const clickResult = await browser.evalJS(`function () {
    const noteId = ${JSON.stringify(item.noteId)};
    const token = ${JSON.stringify(item.xsecToken || '')};
    const links = Array.from(document.querySelectorAll('a'));
    const matched = links.find((a) => {
      const href = a.href || '';
      return href.includes('/search_result/' + noteId) && (!token || href.includes('xsec_token=' + token));
    });
    if (!matched) {
      return JSON.stringify({ found: false });
    }
    matched.click();
    return JSON.stringify({
      found: true,
      href: matched.href,
      className: matched.className || '',
      text: (matched.innerText || matched.textContent || '').trim()
    });
  }`);

  if (!clickResult?.found) {
    throw new Error(`未在搜索页找到笔记 ${item.noteId} 的入口`);
  }

  await sleep(6000);
  return clickResult;
}

async function resolveNoteNavigation(ref) {
  const cached = getCachedNote(ref.noteId);

  if (ref.xsecToken) {
    return {
      noteId: ref.noteId,
      keyword: cached?.keyword || '',
      page: cached?.page || 1,
      xsecToken: ref.xsecToken,
      noteUrl: ref.isFullUrl ? ref.raw : buildSearchNoteUrl(ref.noteId, ref.xsecToken, ref.xsecSource || 'pc_search'),
      publicNoteUrl: buildPublicNoteUrl(ref.noteId)
    };
  }

  if (cached) {
    return cached;
  }

  return {
    noteId: ref.noteId,
    keyword: '',
    page: 1,
    xsecToken: '',
    noteUrl: buildPublicNoteUrl(ref.noteId),
    publicNoteUrl: buildPublicNoteUrl(ref.noteId)
  };
}

/**
 * 搜索笔记
 */
export async function search(keyword, page = 1, limit = 20, filters = {}) {
  const searchFilters = normalizeSearchFilters(filters);
  await navigateTo(buildSearchUrl(keyword, page), '小红书搜索');

  const appliedFilters = await applySearchFilters(searchFilters);
  const searchState = await extractSearchState(limit);
  const feeds = Array.isArray(searchState?.feeds) ? searchState.feeds : [];
  const items = feeds.map((feed, index) => mapSearchItem(feed, keyword, page, index + 1));

  const result = {
    keyword,
    page,
    items,
    total: items.length,
    isLoggedIn: true,
    source: 'initial_state.search.feeds',
    filters: {
      time: searchFilters.time,
      timeLabel: searchFilters.timeLabel,
      sort: searchFilters.sort,
      sortLabel: searchFilters.sortLabel
    },
    appliedFilters,
    searchContext: searchState?.searchContext || {},
    pageTitle: searchState?.title || '',
    pageUrl: searchState?.url || buildSearchUrl(keyword, page)
  };

  cacheSearchResults(keyword, result);
  return result;
}

/**
 * 获取笔记详情
 */
export async function getNoteDetail(input) {
  const ref = parseNoteRef(input);
  const navigation = await resolveNoteNavigation(ref);
  let openMode = 'direct';
  let openError = null;

  try {
    if (ref.isFullUrl && ref.xsecToken) {
      await navigateTo(buildSearchNoteUrl(ref.noteId, ref.xsecToken, ref.xsecSource || 'pc_search'), '笔记详情');
      openMode = 'token_url';
    } else if (navigation.xsecToken && navigation.keyword) {
      await openSearchResultDetail(navigation);
      openMode = 'search_click';
    } else {
      await navigateTo(navigation.noteUrl, '笔记详情');
    }
  } catch (err) {
    openError = err;
  }

  let detailState = openError ? { error: openError.message } : await extractDetailState(ref.noteId).catch((err) => ({ error: err.message }));

  if (!detailState?.note && navigation.xsecToken && navigation.keyword && openMode !== 'search_click') {
    try {
      await openSearchResultDetail(navigation);
      openMode = 'search_click';
      detailState = await extractDetailState(ref.noteId).catch((err) => ({ error: err.message }));
    } catch (err) {
      detailState = {
        ...(detailState || {}),
        fallbackError: err.message
      };
    }
  }

  if (!detailState?.note && navigation.xsecToken && openMode !== 'token_url') {
    try {
      await navigateTo(buildSearchNoteUrl(ref.noteId, navigation.xsecToken, 'pc_search'), '笔记详情');
      openMode = 'token_url';
      detailState = await extractDetailState(ref.noteId).catch((err) => ({ error: err.message }));
    } catch (err) {
      detailState = {
        ...(detailState || {}),
        tokenUrlError: err.message
      };
    }
  }

  const entry = extractDetailEntry(
    detailState?.note
      ? { [ref.noteId]: { note: detailState.note, comments: detailState.comments } }
      : null,
    ref.noteId
  );
  const note = entry?.note || detailState?.note || null;
  const comments = entry?.comments || detailState?.comments || null;

  if (!note) {
    return {
      noteId: ref.noteId,
      noteUrl: detailState?.url || navigation.noteUrl,
      publicNoteUrl: buildPublicNoteUrl(ref.noteId),
      title: '',
      content: '',
      authorName: '',
      authorId: '',
      likeCount: '0',
      likeCountRaw: 0,
      collectCount: '0',
      collectCountRaw: 0,
      commentCount: '0',
      commentCountRaw: 0,
      shareCount: '0',
      shareCountRaw: 0,
      coverImages: [],
      noteType: '',
      tags: [],
      publishTime: '',
      publishTimestamp: 0,
      comments: [],
      commentCursor: '',
      commentHasMore: false,
      xsecToken: navigation.xsecToken || '',
      isLoggedIn: true,
      openMode,
      raw: detailState || {}
    };
  }

  const interactInfo = note.interactInfo || {};
  const imageUrls = mapImageList(note.imageList);
  const tagNames = (note.tagList || []).map((tag) => tag?.name).filter(Boolean);
  const publishTimestamp = Number(note.time || note.lastUpdateTime || 0);

  return {
    noteId: note.noteId || ref.noteId,
    noteUrl: detailState?.url || navigation.noteUrl,
    publicNoteUrl: buildPublicNoteUrl(note.noteId || ref.noteId),
    title: note.title || '',
    content: note.desc || '',
    authorName: note.user?.nickname || '',
    authorId: note.user?.userId || '',
    authorXsecToken: note.user?.xsecToken || '',
    authorAvatar: normalizeImageUrl(note.user?.avatar || ''),
    likeCount: formatCount(interactInfo.likedCount),
    likeCountRaw: Number(interactInfo.likedCount || 0),
    collectCount: formatCount(interactInfo.collectedCount),
    collectCountRaw: Number(interactInfo.collectedCount || 0),
    commentCount: formatCount(interactInfo.commentCount),
    commentCountRaw: Number(interactInfo.commentCount || 0),
    shareCount: formatCount(interactInfo.shareCount || interactInfo.sharedCount),
    shareCountRaw: Number(interactInfo.shareCount || interactInfo.sharedCount || 0),
    coverImages: imageUrls,
    noteType: note.type === 'video' ? '视频' : '图文',
    tags: tagNames,
    publishTime: formatTimestamp(publishTimestamp),
    publishTimestamp,
    comments: mapComments(comments),
    commentCursor: comments?.cursor || '',
    commentHasMore: Boolean(comments?.hasMore),
    xsecToken: note.xsecToken || navigation.xsecToken || '',
    isLoggedIn: true,
    openMode,
    raw: {
      note,
      comments,
      mapKeys: detailState?.mapKeys || []
    }
  };
}

export async function getUserProfile(userId, xsecToken = '') {
  if (!userId) {
    return {
      userId: '',
      fansCount: '',
      profileUrl: ''
    };
  }

  const profileUrl = buildUserProfileUrl(userId, xsecToken);
  await navigateTo(profileUrl, '作者主页');

  const state = await browser.evalJS(`function () {
    const text = document.body ? document.body.innerText.slice(0, 3000) : '';
    const title = document.title || '';
    const userState = (window.__INITIAL_STATE__ || {}).user || {};
    const userInfo = userState.userInfo?._value || userState.userInfo?._rawValue || userState.userInfo || {};
    return JSON.stringify({
      title,
      url: location.href,
      text,
      userInfo: {
        nickname: userInfo.nickname || userInfo.nickName || '',
        redId: userInfo.redId || userInfo.red_id || '',
        fansCount: userInfo.fansCount || userInfo.followerCount || userInfo.followersCount || ''
      }
    });
  }`);

  const lines = String(state?.text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    userId,
    profileUrl: state?.url || profileUrl,
    title: state?.title || '',
    nickname: state?.userInfo?.nickname || '',
    redId: state?.userInfo?.redId || '',
    fansCount: state?.userInfo?.fansCount || extractCountBeforeLabel(lines, '粉丝'),
    raw: state
  };
}

/**
 * 检查登录状态
 */
export async function checkLogin() {
  await browser.navigate(XHS_BASE, { newTab: false, group_title: '登录检查' });
  await sleep(2000);
  const raw = await browser.evalJS(`function () {
    return JSON.stringify({
      title: document.title,
      text: document.body ? document.body.innerText.slice(0, 500) : ''
    });
  }`);

  const text = `${raw?.title || ''}\n${raw?.text || ''}`;
  const loggedOut =
    text.includes('登录后查看') ||
    text.includes('扫码登录') ||
    text.includes('登录后解锁更多功能');

  if (loggedOut) {
    console.log(chalk.yellow('\n⚠️  检测到小红书未登录'));
    console.log(chalk.cyan('请在浏览器中完成登录，然后重试'));
    return false;
  }

  console.log(chalk.green('\n✅ 小红书已登录'));
  return true;
}

/**
 * 打开创作者中心
 */
export async function openDashboard() {
  await browser.navigate('https://creator.xiaohongshu.com/publish/publish', {
    newTab: false,
    group_title: '小红书创作'
  });
  await sleep(3000);
  return { ok: true };
}

export async function openPublish() {
  return openDashboard();
}
