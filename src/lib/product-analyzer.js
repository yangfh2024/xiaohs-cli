const SHOE_TYPE_RULES = [
  ['玛丽珍', ['玛丽珍', 'mary jane', 'maryjane']],
  ['乐福鞋', ['乐福', 'loafer', '豆豆鞋']],
  ['一脚蹬/懒人鞋', ['一脚蹬', '懒人鞋', '套脚', '蹬鞋']],
  ['深口单鞋', ['深口', '深口单鞋']],
  ['妈妈鞋', ['妈妈鞋', '奶奶鞋', '中老年鞋']],
  ['小白鞋', ['小白鞋']],
  ['单鞋', ['单鞋']],
  ['休闲鞋', ['休闲鞋']],
  ['运动鞋', ['运动鞋', '健步鞋', '走路鞋']]
];

const WEAR_RULES = [
  ['一脚蹬', ['一脚蹬', '懒人', '套脚', '蹬']],
  ['松紧带', ['松紧', '弹力带']],
  ['魔术贴', ['魔术贴', '粘扣']],
  ['系带', ['系带', '绑带', '鞋带']],
  ['搭扣/扣带', ['搭扣', '扣带', '扣子']],
  ['拉链', ['拉链']]
];

const TOE_RULES = [
  ['圆头', ['圆头']],
  ['方头', ['方头', '小方头']],
  ['尖头', ['尖头']],
  ['杏仁头', ['杏仁头']]
];

const HEEL_RULES = [
  ['平底', ['平底', '无跟']],
  ['厚底', ['厚底', '松糕底']],
  ['坡跟', ['坡跟']],
  ['低跟', ['低跟', '小低跟']],
  ['粗跟', ['粗跟']],
  ['细跟', ['细跟']],
  ['内增高', ['内增高', '增高']]
];

const COLOR_RULES = [
  ['黑色', ['黑色', '黑']],
  ['米色/杏色', ['米色', '杏色', '奶油色', '米白']],
  ['白色', ['白色', '小白', '奶白']],
  ['棕色/咖色', ['棕色', '咖色', '焦糖', '卡其']],
  ['灰色', ['灰色', '灰']],
  ['红色', ['红色', '酒红', '枣红']],
  ['蓝色', ['蓝色', '藏青']],
  ['绿色', ['绿色']]
];

const MATERIAL_RULES = [
  ['真皮', ['真皮', '头层皮']],
  ['牛皮', ['牛皮']],
  ['羊皮', ['羊皮']],
  ['软皮', ['软皮', '软面']],
  ['PU/人造革', ['pu', '人造革', '合成革']],
  ['绒面/麂皮', ['绒面', '麂皮', '反绒']],
  ['布面/帆布', ['布面', '帆布']],
  ['网面/飞织', ['网面', '飞织', '针织']]
];

const SCENE_RULES = [
  ['日常通勤', ['通勤', '上班', '上课', '日常']],
  ['广场舞/跳舞', ['广场舞', '跳舞', '舞蹈']],
  ['带娃/带孙子', ['带娃', '带孙', '接娃', '遛娃']],
  ['买菜/家务出门', ['买菜', '家务', '菜市场']],
  ['旅游/走路多', ['旅游', '旅行', '走路', '暴走', '逛街']],
  ['开车', ['开车']],
  ['秋季穿搭', ['秋季', '秋天', '入秋', '早秋']]
];

const SELLING_POINT_RULES = [
  ['舒服', ['舒服', '舒适', '脚感', '不累脚', '久走']],
  ['软底/软面', ['软底', '软皮', '软乎', '踩屎感', '柔软']],
  ['轻便', ['轻便', '轻巧', '不重']],
  ['防滑', ['防滑', '抓地']],
  ['百搭', ['百搭', '好搭', '不挑衣服']],
  ['显脚瘦', ['显脚瘦', '显瘦', '瘦脚']],
  ['显腿长/增高', ['显腿长', '增高', '内增高']],
  ['不磨脚', ['不磨脚', '不打脚']],
  ['好穿脱', ['一脚蹬', '好穿脱', '方便穿脱', '懒人']]
];

const COMMENT_KEYWORDS = [
  '链接', '怎么买', '价格', '多少钱', '尺码', '偏大', '偏小', '舒服',
  '软', '磨脚', '真皮', '质量', '颜色', '显脚瘦', '有货', '同款'
];

const NEGATIVE_KEYWORDS = [
  '磨脚', '累脚', '不舒服', '硬', '掉跟', '偏大', '偏小', '挤脚',
  '窄', '质量差', '色差', '贵', '退货', '踩雷', '不一样', '没链接'
];

function normalizeText(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function pickLabels(text, rules, limit = 3) {
  return rules
    .filter(([, words]) => words.some((word) => text.includes(word.toLowerCase())))
    .map(([label]) => label)
    .slice(0, limit);
}

function countKeywords(text, words, limit = 8) {
  return words
    .map((word) => ({
      word,
      count: (text.match(new RegExp(escapeRegExp(word.toLowerCase()), 'g')) || []).length
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => `${item.word}(${item.count})`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPrice(text) {
  const patterns = [
    /[¥￥]\s*\d+(?:\.\d+)?/g,
    /\d+(?:\.\d+)?\s*元/g,
    /\d+(?:\.\d+)?\s*rmb/g,
    /\d{2,4}\s*块/g,
    /百元内|百元|几十块/g
  ];
  const prices = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      prices.push(match[0].replace(/\s+/g, ''));
    }
  }
  return [...new Set(prices)].slice(0, 3).join('；');
}

function inferAuthorType(authorName, text) {
  const author = (authorName || '').toLowerCase();
  const salesWords = ['店', '鞋业', '女鞋', '工厂', '厂家', '服饰', '严选', '好物', '穿搭', '源头', '直播', '下单', '链接', '现货'];
  const hasSalesSignal = salesWords.some((word) => author.includes(word) || text.includes(word.toLowerCase()));
  if (hasSalesSignal) return '商家/导购号';
  if (text.includes('测评') || text.includes('分享') || text.includes('推荐')) return '达人/分享号';
  return '普通用户/待确认';
}

function extractFollowerCount(note) {
  if (note?.fansCount) return note.fansCount;
  const user = note?.raw?.note?.user || {};
  return user.fansCount || user.followersCount || user.followerCount || '';
}

export function analyzeNote(note, searchItem = {}) {
  const commentTexts = (note?.comments || [])
    .flatMap((comment) => [comment.content, ...(comment.replies || []).map((reply) => reply.content)])
    .filter(Boolean);
  const text = normalizeText(
    searchItem.title,
    note?.title,
    note?.content,
    note?.tags || [],
    commentTexts
  );
  const commentsText = normalizeText(commentTexts);
  const followerCount = extractFollowerCount(note);

  const remarks = ['商品字段为规则抽取'];
  if (!followerCount) remarks.push('粉丝数当前页面未提供');
  if (!note?.title && !note?.content) remarks.push('详情页未取到，仅保留搜索卡片字段');

  return {
    authorType: inferAuthorType(note?.authorName || searchItem.authorName, text),
    followerCount,
    shoeType: pickLabels(text, SHOE_TYPE_RULES).join('；'),
    wearMethod: pickLabels(text, WEAR_RULES).join('；'),
    toeShape: pickLabels(text, TOE_RULES).join('；'),
    heelType: pickLabels(text, HEEL_RULES).join('；'),
    colors: pickLabels(text, COLOR_RULES, 4).join('；'),
    material: pickLabels(text, MATERIAL_RULES).join('；'),
    price: extractPrice(text),
    scenes: pickLabels(text, SCENE_RULES, 4).join('；'),
    sellingPoints: pickLabels(text, SELLING_POINT_RULES, 6).join('；'),
    frequentCommentKeywords: countKeywords(commentsText, COMMENT_KEYWORDS).join('；'),
    negativeKeywords: countKeywords(commentsText, NEGATIVE_KEYWORDS).join('；'),
    remarks: remarks.join('；')
  };
}

export const PRODUCT_ANALYSIS_COLUMNS = [
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
  '封面',
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

export function analyzeProduct({ searchItem = {}, detail = {}, collectionDate, sort = '综合' }) {
  const analyzed = analyzeNote(detail, searchItem);
  const coverImage = detail.coverImages?.[0] || searchItem.coverImage || '';

  return {
    采集日期: collectionDate,
    关键词: searchItem.keyword || '',
    排序方式: sort,
    笔记链接: detail.noteUrl || searchItem.noteUrl || searchItem.publicNoteUrl || '',
    标题: detail.title || searchItem.title || '',
    发布时间: detail.publishTime || searchItem.publishTime || '',
    作者类型: analyzed.authorType,
    粉丝数: analyzed.followerCount,
    点赞: detail.likeCount || searchItem.likeCount || '',
    收藏: detail.collectCount || searchItem.collectCount || '',
    评论: detail.commentCount || searchItem.commentCount || '',
    封面: coverImage,
    鞋型: analyzed.shoeType,
    穿脱方式: analyzed.wearMethod,
    鞋头: analyzed.toeShape,
    跟型: analyzed.heelType,
    颜色: analyzed.colors,
    材质: analyzed.material,
    价格: analyzed.price,
    适用场景: analyzed.scenes,
    核心卖点: analyzed.sellingPoints,
    高频评论关键词: analyzed.frequentCommentKeywords,
    负面反馈关键词: analyzed.negativeKeywords,
    你的备注: analyzed.remarks
  };
}
