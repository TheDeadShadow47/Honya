import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = '@shosetsu/chapterPrefs';

/**
 * Default chapter-list view settings. The same defaults the novel screen uses
 * when no saved prefs exist, so a novel opened for the first time behaves
 * exactly as before.
 */
export const DEFAULT_CHAPTER_PREFS = {
  filters: { downloaded: false, unread: false },
  sortKey: 'numberAsc',
  display: { sourceTitle: false, chapterNumber: false },
};

/**
 * Per-novel chapter-list settings (filters / sort / display). Stored as a
 * single AsyncStorage JSON map keyed by novel id, mirroring how the app already
 * persists prefs and repositories.
 *
 * All reads are served from a module-level cache so the novel screen can get
 * the saved settings synchronously on mount without a flash of defaults. The
 * cache is populated by loadChapterPrefs() (called during hydrate/bootstrap)
 * and kept in sync by saveChapterPrefs().
 */
let cache = null; // null = not loaded yet, {} = loaded but empty

export async function loadChapterPrefs() {
  // Already warm (loaded at hydrate, or by an earlier novel screen) — every
  // novel-detail mount used to call this and re-read AsyncStorage every time,
  // which meant re-opening a novel always paid for a disk round trip it didn't
  // need. Once populated, this is a no-op.
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
    // Non-fatal: prefs stay in memory for this session even if the write fails.
  }
}

export const CHAPTER_PREFS_KEY = PREFS_KEY;
