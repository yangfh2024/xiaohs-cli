import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.resolve(__dirname, '..', '..', '.xiaohs-cache.json');

function createEmptyCache() {
  return {
    updatedAt: '',
    searches: {},
    notes: {}
  };
}

export function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      return createEmptyCache();
    }
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyCache(),
      ...parsed,
      searches: parsed?.searches || {},
      notes: parsed?.notes || {}
    };
  } catch {
    return createEmptyCache();
  }
}

export function writeCache(cache) {
  const next = {
    ...createEmptyCache(),
    ...cache,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export function cacheSearchResults(keyword, result) {
  const cache = readCache();
  const itemMap = {};

  for (const item of result?.items || []) {
    if (!item?.noteId) continue;
    itemMap[item.noteId] = {
      noteId: item.noteId,
      noteUrl: item.noteUrl,
      publicNoteUrl: item.publicNoteUrl || '',
      xsecToken: item.xsecToken || '',
      authorName: item.authorName || '',
      title: item.title || '',
      keyword,
      page: item.page || result.page || 1,
      cachedAt: new Date().toISOString()
    };
  }

  cache.searches[keyword] = {
    keyword,
    page: result?.page || 1,
    source: result?.source || '',
    cachedAt: new Date().toISOString(),
    noteIds: Object.keys(itemMap)
  };

  cache.notes = {
    ...cache.notes,
    ...itemMap
  };

  return writeCache(cache);
}

export function getCachedNote(noteId) {
  const cache = readCache();
  return cache.notes[noteId] || null;
}

export function getCachePath() {
  return CACHE_PATH;
}
