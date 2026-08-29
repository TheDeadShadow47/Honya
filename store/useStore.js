import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../db/database';
import { fetchRepository, fetchPluginCode } from '../lib/repository';
import { loadPlugin, pluginApi, unloadPlugin } from '../lib/pluginEngine';
import { loadChapterPrefs, getChapterPrefsSnapshot, restoreChapterPrefsSnapshot, CHAPTER_PREFS_KEY } from '../lib/chapterPrefs';
import { setLanguage, applyDirection } from '../lib/i18n';
import * as backup from '../lib/backup';
import * as downloadQueue from '../lib/downloadQueue';
import * as libraryUpdate from '../lib/libraryUpdate';
// Side-effect import: registers the OS background download worker via module-level defineTask().
import '../lib/backgroundDownload';
import * as updateManager from '../lib/updateManager';

const PREFS_KEY = '@honya/prefs';
const REPOS_KEY = '@honya/repos';

const LEGACY_KEY_MAP = {
  '@shosetsu/prefs': PREFS_KEY,
  '@shosetsu/repos': REPOS_KEY,
  '@shosetsu/chapterPrefs': CHAPTER_PREFS_KEY,
};

async function migrateLegacyStorageKeys() {
  const pairs = Object.entries(LEGACY_KEY_MAP);
  const allKeys = pairs.flatMap(([oldKey, newKey]) => [oldKey, newKey]);
  const results = await AsyncStorage.multiGet(allKeys);
  const values = Object.fromEntries(results);
  const toSet = [];
  const toRemove = [];
  for (const [oldKey, newKey] of pairs) {
    if (values[oldKey] != null) {
      if (values[newKey] == null) toSet.push([newKey, values[oldKey]]);
      toRemove.push(oldKey);
    }
  }
  if (toSet.length) await AsyncStorage.multiSet(toSet);
  if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
}

export const DEFAULT_PREFS = {
  theme: 'honya',
  lang: 'en',
  readerBackground: 'black',
  fontSize: 18,
  lineHeight: 1.7,
  horizontalPadding: 20,
  gridColumns: 3,
  markReadOnOpen: false,
  notificationsEnabled: true,
  notificationsUpdates: true,
  notificationsDownloads: true,
  notifyDownloadStart: true,
  notifyDownloadComplete: true,
  notifyDownloadFailed: true,
  notifyNewChaptersFound: true,
  notifyUpdateComplete: true,
  notifyUpdateFailed: true,
  autoUpdateInterval: 'never', // 'never' | '6h' | '12h' | 'daily'
  notificationPromptSeen: false, // has the first-launch notification permission prompt been resolved?
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
  downloadStates: {},
  downloadQueueState: { paused: false, downloading: [], queued: [], failed: [], completed: [], batchTotal: 0, batchDone: 0 },
  updateProgress: { running: false, current: 0, total: 0, novelTitle: null },
  updateSummary: { lastUpdateAt: null, checked: 0, updated: 0, newChapters: 0, failed: [] },
  appUpdateState: updateManager.getState(),

  hydrate: async () => {
    await db.initDatabase();
    await migrateLegacyStorageKeys();
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

    await loadChapterPrefs();
    setLanguage(prefs.lang);
    applyDirection();
    set({ prefs, userRepositories: repos, installedExtensions, ready: true });
    await get().refreshLibrary();
    await get().refreshUpdates();
    await get().refreshHistory();

    downloadQueue.subscribe((snapshot) => {
      set({ downloadQueueState: snapshot, downloadStates: snapshot.states });
    });
    await downloadQueue.initDownloadQueue();

    libraryUpdate.subscribe(({ progress, summary }) => {
      set((s) => ({
        updateProgress: progress ?? s.updateProgress,
        updateSummary: summary ?? s.updateSummary,
      }));
      if (summary) {
        // A finished update almost certainly touched chapters/novels.
        get().refreshLibrary();
        get().refreshUpdates();
      }
    });
    const savedSummary = await libraryUpdate.loadPersistedSummary();
    if (savedSummary) set({ updateSummary: savedSummary });

    updateManager.subscribe((appUpdateState) => {
      set({ appUpdateState });
    });
    await updateManager.initUpdateManager();
  },

  /* preferences */
  setPref: async (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  },
  resetPrefs: async () => {
    set({ prefs: DEFAULT_PREFS });
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(DEFAULT_PREFS));
  },

  /* repositories  */
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

  /* extensions  */
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

  /* global search  */
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

  downloadChapter: async (chapter) => {
    if (!chapter?.id) return;
    const novel = await db.getNovel(chapter.novelId);
    await downloadQueue.enqueue([chapter], { novel });
  },

  downloadMany: async (chapters) => {
    const list = (Array.isArray(chapters) ? chapters : []).filter((c) => c && c.id && !c.downloaded);
    if (!list.length) return { queued: 0 };
    const novelId = list[0]?.novelId;
    const novel = novelId ? await db.getNovel(novelId) : null;
    await downloadQueue.enqueue(list, { novel });
    return { queued: list.length };
  },

  cancelDownload: (chapterId) => downloadQueue.cancel(chapterId),
  cancelAllQueuedDownloads: () => downloadQueue.cancelAllQueued(),
  pauseDownloadQueue: () => downloadQueue.pauseQueue(),
  resumeDownloadQueue: () => downloadQueue.resumeQueue(),
  retryFailedDownloads: () => downloadQueue.retryFailed(),
  clearCompletedDownloads: () => downloadQueue.clearCompleted(),
  clearFailedDownloads: () => downloadQueue.clearFailed(),

  // Also clears completed-queue history so the Downloads screen doesn't list wiped content.
  clearAllDownloads: async () => {
    await db.clearDownloads();
    await downloadQueue.clearCompleted();
  },

  removeDownload: async (chapterId) => {
    await db.deleteChapterText(chapterId);
    const next = { ...get().downloadStates };
    delete next[chapterId];
    set({ downloadStates: next });
  },

  runLibraryUpdate: (opts) => libraryUpdate.runLibraryUpdate(opts),
  cancelLibraryUpdate: () => libraryUpdate.cancelLibraryUpdate(),

  /* library  */
  refreshLibrary: async () => set({ library: await db.getLibrary() }),
  refreshUpdates: async () => set({ updates: await db.getRecentUpdates() }),

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
    await downloadQueue.removeByNovel(novelId);
    await get().refreshLibrary();
    await get().refreshUpdates();
    await get().refreshHistory();
  },

  createBackup: async () => {
    const data = {
      prefs: get().prefs,
      chapterPrefs: await getChapterPrefsSnapshot(),
      repositories: get().userRepositories,
      extensions: await db.getExtensionsMeta(),
      novels: await db.getBackupSnapshot(),
    };
    const file = await backup.createBackupInFolder(data);
    return { ...file, novels: data.novels.length, extensions: data.extensions.length };
  },

  restoreBackup: async (fileUri) => {
    const raw = await backup.readBackupFile(fileUri);
    const parsed = backup.validateBackup(raw);

    // Only accept known pref keys with the expected type — backups are untrusted input.
    const safePrefs = {};
    for (const key of Object.keys(DEFAULT_PREFS)) {
      if (key in parsed.prefs && typeof parsed.prefs[key] === typeof DEFAULT_PREFS[key]) {
        safePrefs[key] = parsed.prefs[key];
      }
    }

    await db.restoreLibrarySnapshot(parsed.novels);
    await restoreChapterPrefsSnapshot(parsed.chapterPrefs);

    const mergedRepos = Array.from(new Set([...get().userRepositories, ...parsed.repositories]));
    const mergedPrefs = { ...DEFAULT_PREFS, ...get().prefs, ...safePrefs };
    await AsyncStorage.setItem(REPOS_KEY, JSON.stringify(mergedRepos));
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(mergedPrefs));

    setLanguage(mergedPrefs.lang);
    applyDirection();
    set({ prefs: mergedPrefs, userRepositories: mergedRepos });

    await get().refreshLibrary();
    await get().refreshUpdates();
    await get().refreshHistory();

    return parsed.meta;
  },

  /* app update */
  checkForAppUpdate: (opts) => updateManager.checkForUpdates(opts),
  downloadAppUpdate: () => updateManager.downloadUpdate(),
  cancelAppUpdateDownload: () => updateManager.cancelDownload(),
  installAppUpdate: () => updateManager.installUpdate(),
  skipAppUpdateVersion: () => updateManager.skipVersion(),
  dismissAppUpdate: () => updateManager.dismissUpdate(),
  checkWhatsNew: () => updateManager.checkWhatsNew(),
  markWhatsNewSeen: () => updateManager.markWhatsNewSeen(),
}));

export const useTheme = () => useStore((s) => s.prefs.theme);
