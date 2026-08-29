/**
 * Library update engine: walks every novel and re-fetches it through the existing
 * plugin API (the same call the details screen makes) with progress/notifications.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../db/database';
import { loadPlugin, pluginApi } from './pluginEngine';
import { sendNotification, dismissNotification, NOTIF_TYPE, NOTIF_ID, NOTIF_ACTION, setPrefsSource } from './notifications';
import { markFetched } from './novelFetchThrottle';
import { defineTask } from './backgroundTasks';
import { t } from './i18n';

export const LIBRARY_UPDATE_TASK = 'honya-library-update';

const SUMMARY_KEY = '@honya/updateSummary';
const AUTO_UPDATE_STATE_KEY = '@honya/autoUpdateState';

const INTERVAL_MS = {
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

let running = false;
let _cancelled = false;
const listeners = new Set();
let lastNotifyAt = 0;
const NOTIFY_THROTTLE_MS = 1200;
let lastEmitAt = 0;
const EMIT_THROTTLE_MS = 300;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Cancel the current library update run. */
export function cancelLibraryUpdate() {
  _cancelled = true;
}

/** Handle notification action button presses. */
export function handleNotificationAction(action) {
  if (action === NOTIF_ACTION.UPDATE_CANCEL) {
    cancelLibraryUpdate();
  }
}

function emit(payload, force = false) {
  const now = Date.now();
  // Throttle per-novel progress ticks so a fast run doesn't flood React; start/end always pass through.
  if (!force && now - lastEmitAt < EMIT_THROTTLE_MS) return;
  lastEmitAt = now;
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch {}
  });
}

export async function loadPersistedSummary() {
  try {
    const raw = await AsyncStorage.getItem(SUMMARY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function persistSummary(summary) {
  try {
    await AsyncStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
  } catch {}
}

function chapterId(novelId, c, i) {
  return c.id ?? `${novelId}::${c.path ?? c.name ?? i}`;
}

/** Checks one novel and applies any changes, exactly mirroring the manual per-novel refresh. Returns the count of genuinely new chapters. */
async function checkNovel(novel, pluginRecord) {
  const instance = loadPlugin(pluginRecord);
  const detail = await pluginApi.novel(instance, novel.path);

  const merged = {
    ...novel,
    title: detail?.name ?? detail?.title ?? novel.title,
    author: detail?.author ?? novel.author,
    cover: detail?.cover ?? novel.cover,
    status: detail?.status ?? novel.status,
    summary: detail?.summary ?? detail?.description ?? novel.summary,
    genres: Array.isArray(detail?.genres)
      ? detail.genres
      : typeof detail?.genres === 'string'
        ? detail.genres.split(/,\s*/)
        : novel.genres,
    inLibrary: novel.inLibrary,
  };
  await db.upsertNovel(merged);

  const incoming = Array.isArray(detail?.chapters) ? detail.chapters : [];
  if (!incoming.length) return 0;

  const existing = await db.getChapters(novel.id);
  const existingIds = new Set(existing.map((c) => c.id));
  const withIds = incoming.map((c, i) => ({ ...c, id: chapterId(novel.id, c, i) }));
  const newCount = withIds.filter((c) => !existingIds.has(c.id)).length;

  await db.replaceChapters(novel.id, withIds);
  markFetched(novel.id);
  return newCount;
}

async function updateProgressNotification(current, total, novelTitle, force = false) {
  const now = Date.now();
  if (!force && now - lastNotifyAt < NOTIFY_THROTTLE_MS) return;
  lastNotifyAt = now;
  await sendNotification({
    type: NOTIF_TYPE.LIBRARY_UPDATE_PROGRESS,
    identifier: NOTIF_ID.LIBRARY_UPDATE,
    title: t('updates.updating'),
    body: t('updates.checkingProgress', { current, total }) + (novelTitle ? `\n${novelTitle}` : ''),
    data: { screen: '(tabs)', params: { screen: 'updates' } },
    actions: [
      { identifier: NOTIF_ACTION.UPDATE_CANCEL, title: t('updates.actionCancel') },
    ],
  });
}

/** Runs a full library check; a second call while one is running is a no-op (guards manual vs background overlap). */
export async function runLibraryUpdate() {
  if (running) return { skipped: true };
  running = true;
  _cancelled = false;

  const library = await db.getLibrary();
  const total = library.length;
  const failed = [];
  let checked = 0;
  let updatedNovels = 0;
  let totalNewChapters = 0;
  const updatedTitles = [];

  emit({ progress: { running: true, current: 0, total, novelTitle: null } }, true);

  try {
    for (const novel of library) {
      checked += 1;
      if (_cancelled) {
        _cancelled = false;
        await dismissNotification(NOTIF_ID.LIBRARY_UPDATE);
        if (checked > 0) {
          await sendNotification({
            type: NOTIF_TYPE.LIBRARY_UPDATE_COMPLETE,
            identifier: NOTIF_ID.LIBRARY_UPDATE,
            title: t('updates.cancelled'),
            body: t('updates.cancelledBody', { checked, total }),
            data: { screen: '(tabs)', params: { screen: 'updates' } },
          });
        }
        const partialSummary = {
          lastUpdateAt: Date.now(),
          checked,
          updated: updatedNovels,
          newChapters: totalNewChapters,
          failed,
        };
        await persistSummary(partialSummary);
        emit({ progress: { running: false, current: checked, total, novelTitle: null }, summary: partialSummary }, true);
        return partialSummary;
      }
      // Always show the first and last novel of the run immediately; ticks in between are throttled.
      emit({ progress: { running: true, current: checked, total, novelTitle: novel.title } }, checked === 1 || checked === total);
      updateProgressNotification(checked, total, novel.title).catch(() => {});

      try {
        const pluginRecord = novel.pluginId ? await db.getPlugin(novel.pluginId) : null;
        if (!pluginRecord) throw new Error('Source extension not installed');
        if (!novel.path) throw new Error('Novel is missing a source path');
        const newCount = await checkNovel(novel, pluginRecord);
        if (newCount > 0) {
          updatedNovels += 1;
          totalNewChapters += newCount;
          updatedTitles.push({ id: novel.id, title: novel.title, newCount });
        }
      } catch (e) {
        failed.push({ novelId: novel.id, title: novel.title, message: e?.message ?? 'Update failed' });
      }
    }

    const summary = {
      lastUpdateAt: Date.now(),
      checked,
      updated: updatedNovels,
      newChapters: totalNewChapters,
      failed,
    };
    await persistSummary(summary);
    await AsyncStorage.setItem(AUTO_UPDATE_STATE_KEY, JSON.stringify({ lastRunAt: Date.now() }));

    await dismissNotification(NOTIF_ID.LIBRARY_UPDATE);
    await sendCompletionNotifications({ updatedTitles, totalNewChapters, summary });

    emit({ progress: { running: false, current: total, total, novelTitle: null }, summary }, true);
    return summary;
  } finally {
    running = false;
  }
}

/** "New chapters found" + "Library update complete" — at most two notifications per run, never one per novel. */
async function sendCompletionNotifications({ updatedTitles, totalNewChapters, summary }) {
  if (totalNewChapters > 0) {
    if (updatedTitles.length === 1) {
      const only = updatedTitles[0];
      await sendNotification({
        type: NOTIF_TYPE.NEW_CHAPTERS,
        title: t('updates.newChaptersTitle'),
        body: t('updates.newChaptersBody', {
          novel: only.title,
          count: only.newCount,
          plural: only.newCount === 1 ? '' : 's',
        }),
        data: { screen: '(tabs)', params: { screen: 'updates' } },
      });
    } else {
      await sendNotification({
        type: NOTIF_TYPE.NEW_CHAPTERS,
        title: t('updates.newChaptersTitle'),
        body: t('updates.newChaptersSummary', {
          novels: updatedTitles.length,
          novelsPlural: updatedTitles.length === 1 ? '' : 's',
          chapters: totalNewChapters,
          chaptersPlural: totalNewChapters === 1 ? '' : 's',
        }),
        data: { screen: '(tabs)', params: { screen: 'updates' } },
      });
    }
  }

  if (summary.failed.length && summary.failed.length === summary.checked) {
    await sendNotification({
      type: NOTIF_TYPE.LIBRARY_UPDATE_FAILED,
      title: t('updates.completeWithErrors', { checked: summary.checked, failed: summary.failed.length }),
      body: '',
      data: { screen: '(tabs)', params: { screen: 'updates' } },
    });
    return;
  }

  const body = summary.newChapters > 0
    ? t('updates.completeBody', { checked: summary.checked, updated: summary.updated, newChapters: summary.newChapters })
    : t('updates.completeNoNew', { checked: summary.checked });

  await sendNotification({
    type: NOTIF_TYPE.LIBRARY_UPDATE_COMPLETE,
    title: t('updates.updateComplete'),
    body: summary.failed.length
      ? body + `\n${t('updates.summaryFailed', { count: summary.failed.length })}`
      : body,
    data: { screen: '(tabs)', params: { screen: 'updates' } },
  });
}

/** Called from the background task; reads prefs from AsyncStorage (background context may run before store hydration). */
export async function maybeRunAutoUpdate() {
  try {
    // Headless wake: ensure SQLite is migrated and notifications respect toggles (no React mount to do it).
    await db.initDatabase();
    const raw = await AsyncStorage.getItem('@honya/prefs');
    const prefs = raw ? JSON.parse(raw) : {};
    setPrefsSource(() => prefs);
    const interval = prefs.autoUpdateInterval;
    if (!interval || interval === 'never') return { skipped: true };
    const ms = INTERVAL_MS[interval];
    if (!ms) return { skipped: true };

    const stateRaw = await AsyncStorage.getItem(AUTO_UPDATE_STATE_KEY);
    const state = stateRaw ? JSON.parse(stateRaw) : {};
    if (state.lastRunAt && Date.now() - state.lastRunAt < ms) return { skipped: true };

    return await runLibraryUpdate();
  } catch (e) {
    return { skipped: true, error: e?.message };
  }
}

// Registered once at module load; minimumInterval stays at the shortest floor and maybeRunAutoUpdate() does the real interval gating.
defineTask(LIBRARY_UPDATE_TASK, maybeRunAutoUpdate, { minimumInterval: 15 });
