import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = '@honya/chapterPrefs';

// Default chapter-list view settings, matching the novel screen's defaults.
export const DEFAULT_CHAPTER_PREFS = {
  filters: { downloaded: false, unread: false },
  sortKey: 'numberAsc',
  display: { sourceTitle: false, chapterNumber: false },
};

// Per-novel chapter-list settings in one AsyncStorage map, served from a module-level cache.
let cache = null; // null = not loaded yet, {} = loaded but empty

export async function loadChapterPrefs() {
  // Cache-loaded once at hydrate; a no-op afterwards.
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache;
}

/** Synchronous read for the novel screen. null while prefs are still loading. */
export function getCachedChapterPrefs(novelId) {
  if (!cache) return null;
  return mergePrefs(cache[novelId]);
}

function mergePrefs(saved) {
  if (!saved || typeof saved !== 'object') return null;
  return {
    filters: { ...DEFAULT_CHAPTER_PREFS.filters, ...(saved.filters ?? {}) },
    sortKey: ['numberAsc', 'numberDesc', 'newest', 'oldest'].includes(saved.sortKey)
      ? saved.sortKey
      : DEFAULT_CHAPTER_PREFS.sortKey,
    display: { ...DEFAULT_CHAPTER_PREFS.display, ...(saved.display ?? {}) },
  };
}

export async function saveChapterPrefs(novelId, prefs) {
  if (!cache) cache = {};
  cache[novelId] = prefs;
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(cache));
  } catch {
    // Non-fatal: prefs stay in memory even if the write fails.
  }
}

export const CHAPTER_PREFS_KEY = PREFS_KEY;

/** Full per-novel prefs map, for backup export. */
export async function getChapterPrefsSnapshot() {
  return { ...(await loadChapterPrefs()) };
}

/** Merges a backed-up prefs map into the cache and persists it. */
export async function restoreChapterPrefsSnapshot(map) {
  if (!cache) await loadChapterPrefs();
  cache = { ...cache, ...(map ?? {}) };
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(cache));
  } catch {
    // Non-fatal: prefs stay in memory even if the write fails.
  }
  return cache;
}
