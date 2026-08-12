import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../db/database';
import { fetchRepository, fetchPluginCode } from '../lib/repository';
import { loadPlugin, pluginApi, unloadPlugin } from '../lib/pluginEngine';
import { stripHtml } from '../lib/clean';
import { loadChapterPrefs } from '../lib/chapterPrefs';

const DOWNLOAD_CONCURRENCY = 3;

const PREFS_KEY = '@shosetsu/prefs';
const REPOS_KEY = '@shosetsu/repos';

export const DEFAULT_PREFS = {
  theme: 'honya',
  readerBackground: 'black',
  fontSize: 18,
  lineHeight: 1.7,
  horizontalPadding: 20,
  gridColumns: 3,
  markReadOnOpen: false,
};

export const useStore = create((set, get) => ({
  ready: false,
  prefs: DEFAULT_PREFS,
  userRepositories: [],
  installedExtensions: {}, // { [pluginId]: { id, name, version, lang, iconUrl, code, ... } }
  repoCatalog: {}, // { [repoUrl]: normalizedPlugin[] }
  repoLoading: false,
  repoError: null,
  library: [],
  updates: [],
  history: [],
  downloadStates: {}, // { [chapterId]: 'downloading' | 'failed' }

  /* ---------- bootstrap ---------- */
  hydrate: async () => {
    await db.initDatabase();
    const [prefsRaw, reposRaw] = await AsyncStorage.multiGet([PREFS_KEY, REPOS_KEY]);
    let prefs = DEFAULT_PREFS;
    let repos = [];
    try {
      prefs = { ...DEFAULT_PREFS, ...JSON.parse(prefsRaw[1] || '{}') };
    } catch {}
    try {
      repos = JSON.parse(reposRaw[1] || '[]');
    } catch {}
    const plugins = await db.getPlugins();
    const installedExtensions = {};
    plugins.forEach((p) => {
      installedExtensions[p.id] = p;
    });
    // Warm the chapter-prefs cache before `ready` lifts, so the novel screen's
    // first render can read saved filters/sort/display synchronously.
    await loadChapterPrefs();
    set({ prefs, userRepositories: repos, installedExtensions, ready: true });
    await get().refreshLibrary();
    await get().refreshUpdates();
    await get().refreshHistory();
  },

  /* ---------- preferences ---------- */
  setPref: async (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  },
  resetPrefs: async () => {
    set({ prefs: DEFAULT_PREFS });
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(DEFAULT_PREFS));
  },

  /* ---------- repositories ---------- */
  addRepository: async (url) => {
    const clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) throw new Error('Enter a full http(s) URL');
    if (get().userRepositories.includes(clean)) throw new Error('Repository already added');
    const plugins = await fetchRepository(clean); // validate before saving
    const repos = [...get().userRepositories, clean];
    set({ userRepositories: repos, repoCatalog: { ...get().repoCatalog, [clean]: plugins } });
    await AsyncStorage.setItem(REPOS_KEY, JSON.stringify(repos));
  },
  removeRepository: async (url) => {
    const repos = get().userRepositories.filter((r) => r !== url);
    const catalog = { ...get().repoCatalog };
    delete catalog[url];
    set({ userRepositories: repos, repoCatalog: catalog });
    await AsyncStorage.setItem(REPOS_KEY, JSON.stringify(repos));
  },
  refreshRepositories: async () => {
    const repos = get().userRepositories;
    if (!repos.length) {
      set({ repoCatalog: {}, repoError: null });
      return;
    }
    set({ repoLoading: true, repoError: null });
    const catalog = {};
    const errors = [];
    for (const repo of repos) {
      try {
        catalog[repo] = await fetchRepository(repo);
      } catch (e) {
        catalog[repo] = [];
        errors.push(`${repo}: ${e.message}`);
      }
    }
    set({ repoCatalog: catalog, repoLoading: false, repoError: errors.join('\n') || null });
  },

  /* ---------- extensions ---------- */
  installExtension: async (meta) => {
    const code = await fetchPluginCode(meta.codeUrl);
    const record = { ...meta, code };
    await db.savePlugin(record);
    unloadPlugin(meta.id);
    set({ installedExtensions: { ...get().installedExtensions, [meta.id]: record } });
  },
  uninstallExtension: async (pluginId) => {
    await db.deletePlugin(pluginId);
    unloadPlugin(pluginId);
    const next = { ...get().installedExtensions };
    delete next[pluginId];
    set({ installedExtensions: next });
  },

  /* ---------- global search ---------- */
  globalSearch: async (query) => {
    const q = query.trim();
    const extensions = Object.values(get().installedExtensions);
    if (!q || !extensions.length) return { results: [], errors: [] };
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('Source timed out')), ms))]);
    const results = [];
    const errors = [];
    await Promise.all(
      extensions.map(async (record) => {
        try {
          const instance = loadPlugin(record);
          const raw = await withTimeout(pluginApi.search(instance, q, 1), 20000);
          const list = Array.isArray(raw) ? raw : [];
          list.forEach((n) => {
            results.push({
              id: `${record.id}::${n.path ?? n.url ?? n.name}`,
              pluginId: record.id,
              sourceName: record.name,
              path: n.path ?? n.url,
              title: n.name ?? n.title ?? 'Untitled',
              cover: n.cover ?? n.coverUrl ?? null,
            });
          });
        } catch (e) {
          errors.push({ pluginId: record.id, message: e.message ?? 'Search failed' });
        }
      }),
    );
    return { results, errors };
  },

  /* ---------- downloads ---------- */
  downloadChapter: async (chapter) => {
    const id = chapter?.id;
    if (!id) return;
    if (get().downloadStates[id] === 'downloading') return;
    set({ downloadStates: { ...get().downloadStates, [id]: 'downloading' } });
    try {
      const nv = await db.getNovel(chapter.novelId);
      const record = nv?.pluginId ? get().installedExtensions[nv.pluginId] : null;
      if (!record) throw new Error('The source extension for this novel is not installed');
      const instance = loadPlugin(record);
      const raw = await pluginApi.chapter(instance, chapter.path);
      const clean = stripHtml(raw);
      if (!clean) throw new Error('The source returned an empty chapter');
      await db.saveChapterText(id, clean);
      const next = { ...get().downloadStates };
      delete next[id];
      set({ downloadStates: next });
    } catch (e) {
      set({ downloadStates: { ...get().downloadStates, [id]: 'failed' } });
      throw e;
    }
  },

  downloadMany: async (chapters) => {
    const queue = (Array.isArray(chapters) ? chapters : []).filter((c) => c && c.id && !c.downloaded);
    let ok = 0;
    let failed = 0;
    const limit = Math.max(1, Math.min(DOWNLOAD_CONCURRENCY, queue.length));
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift();
        try {
          await get().downloadChapter(c);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: limit }, worker));
    return { ok, failed };
  },

  removeDownload: async (chapterId) => {
    await db.deleteChapterText(chapterId);
    const next = { ...get().downloadStates };
    delete next[chapterId];
    set({ downloadStates: next });
  },

  /* ---------- library ---------- */
  refreshLibrary: async () => set({ library: await db.getLibrary() }),
  refreshUpdates: async () => set({ updates: await db.getRecentUpdates() }),

  /* ---------- history ----------
   * Reads straight from the chapters table (the existing source of truth for
   * reading state). No separate history storage exists.
   */
  refreshHistory: async () => set({ history: await db.getHistory() }),
  removeHistoryEntry: async (chapterId) => {
    await db.removeHistoryEntry(chapterId);
    await get().refreshHistory();
  },
  clearHistory: async () => {
    await db.clearHistory();
    set({ history: [] });
  },
  toggleLibrary: async (novel) => {
    const existing = await db.getNovel(novel.id);
    if (existing) await db.setInLibrary(novel.id, !existing.inLibrary);
    else await db.upsertNovel({ ...novel, inLibrary: true });
    await get().refreshLibrary();
  },
  removeFromLibraryHard: async (novelId) => {
    await db.deleteNovel(novelId);
    await get().refreshLibrary();
    await get().refreshUpdates();
    await get().refreshHistory();
  },
}));

export const useTheme = () => useStore((s) => s.prefs.theme);
