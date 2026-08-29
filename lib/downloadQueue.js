/**
 * Centralized chapter download queue: single worker, SQLite-backed (survives app close/crash),
 * reusing the existing plugin API/db path (not a second download engine). The headless
 * `honya-download-worker` (lib/backgroundDownload.js) re-hydrates from SQLite and processes a
 * bounded window per OS slot, so worker/UI/notifications all agree on persisted state.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../db/database';
import { loadPlugin, pluginApi } from './pluginEngine';
import { sanitizeChapter } from './clean';
import { sendNotification, dismissNotification, NOTIF_TYPE, NOTIF_ID, NOTIF_ACTION } from './notifications';
import { t } from './i18n';

const items = new Map(); // chapterId -> { chapterId, novelId, status, error, chapterName, chapterNumber, novelTitle, novelCover, createdAt, updatedAt }
let order = []; // chapterId order for the 'queued' portion of the queue
let nextPos = 0;
let paused = false;
let working = false;
let initialized = false;
const listeners = new Set();
const cancelRequested = new Set(); // chapterIds whose in-flight download should be discarded on completion
let _batchCancelled = false; // set true by the "Cancel" action on the progress notification

// Batch "N of M" counters, persisted under BATCH_KEY so foreground UI and headless worker agree.
let batchTotal = 0;
let batchDone = 0;
let batchFailed = 0;
let lastNotifyAt = 0;
const NOTIFY_THROTTLE_MS = 1200;
let lastEmitAt = 0;
const EMIT_THROTTLE_MS = 150;
let batchJustStarted = false;
const BATCH_KEY = '@honya/downloadBatch';

async function loadBatchDims() {
  try {
    const raw = await AsyncStorage.getItem(BATCH_KEY);
    const p = raw ? JSON.parse(raw) : {};
    batchTotal = p.total ?? 0;
    batchDone = p.done ?? 0;
    batchFailed = p.failed ?? 0;
  } catch {}
}

async function persistBatchDims() {
  try {
    await AsyncStorage.setItem(BATCH_KEY, JSON.stringify({ total: batchTotal, done: batchDone, failed: batchFailed }));
  } catch {}
}

function emit(force = false) {
  const now = Date.now();
  if (batchJustStarted) {
    force = true;
    batchJustStarted = false;
  }
  // Throttle so a run of instant failures (e.g. an uninstalled extension) doesn't flood the store with a render per item.
  if (!force && now - lastEmitAt < EMIT_THROTTLE_MS) return;
  lastEmitAt = now;
  const snapshot = getSnapshot();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {}
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot() {
  const all = [...items.values()];
  const byStatus = (s) => all.filter((i) => i.status === s);
  return {
    paused,
    downloading: byStatus('downloading'),
    queued: byStatus('queued').sort((a, b) => (a.queuePos ?? 0) - (b.queuePos ?? 0)),
    failed: byStatus('failed'),
    completed: byStatus('completed').sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    cancelled: byStatus('cancelled'),
    // Real batch counts for "Chapter X / Y" UI.
    batchTotal,
    batchDone,
    // Mirrors the old store.downloadStates { [chapterId]: status } shape so existing UI (ChapterRow, SelectionBar) works unmodified.
    states: Object.fromEntries(all.filter((i) => i.status !== 'completed').map((i) => [i.chapterId, i.status])),
  };
}

function toRow(it) {
  return {
    chapterId: it.chapterId,
    novelId: it.novelId,
    status: it.status,
    queuePos: it.queuePos ?? null,
    error: it.error ?? null,
    createdAt: it.createdAt,
    updatedAt: it.updatedAt,
  };
}

/** Hydrate the queue from SQLite (idempotent); rows mid-download when the app/worker died are demoted back to queued. Does not start pumping. */
async function loadPersistedQueue() {
  if (initialized) return;
  initialized = true;
  const rows = await db.getDownloadQueue();
  for (const row of rows) {
    const status = row.status === 'downloading' ? 'queued' : row.status;
    items.set(row.chapterId, {
      chapterId: row.chapterId,
      novelId: row.novelId,
      status,
      error: row.error ?? null,
      chapterName: row.chapterName,
      chapterNumber: row.chapterNumber,
      novelTitle: row.novelTitle,
      novelCover: row.novelCover,
      queuePos: row.queuePos ?? nextPos++,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    if (status === 'queued') order.push(row.chapterId);
  }
  order.sort((a, b) => (items.get(a)?.queuePos ?? 0) - (items.get(b)?.queuePos ?? 0));
  if (order.length) {
    // Persist the demoted downloading->queued rows so a second crash doesn't lose them either.
    await db.upsertDownloadQueueItems(order.map((id) => toRow(items.get(id))));
  }
  await loadBatchDims();
}

/**
 * Safe for the headless background worker to call directly; ensures the queue
 * reflects SQLite without starting a foreground pump loop.
 */
export async function ensureInitialized() {
  if (initialized) return;
  await loadPersistedQueue();
}

/** Reconcile persisted queue rows on boot, then start processing leftover work. */
export async function initDownloadQueue() {
  await loadPersistedQueue();
  pump();
}

/** Add chapters to the queue (accepts db.getChapters row shape); already-downloaded/queued/downloading chapters are skipped. */
export async function enqueue(chapters, { novel } = {}) {
  const list = (Array.isArray(chapters) ? chapters : [chapters]).filter(
    (c) => c?.id && !c.downloaded && !items.has(c.id),
  );
  if (!list.length) return;
  const now = Date.now();
  if (isQueueIdle()) {
    // Fresh batch — reset the "N of M" counters for the progress notification.
    batchTotal = 0;
    batchDone = 0;
    batchFailed = 0;
    batchJustStarted = true;
  }
  for (const c of list) {
    const it = {
      chapterId: c.id,
      novelId: c.novelId,
      status: 'queued',
      error: null,
      chapterName: c.name,
      chapterNumber: c.number,
      novelTitle: novel?.title,
      novelCover: novel?.cover,
      queuePos: nextPos++,
      createdAt: now,
      updatedAt: now,
    };
    items.set(c.id, it);
    order.push(c.id);
  }
  batchTotal += list.length;
  await persistBatchDims();
  await db.upsertDownloadQueueItems(list.map((c) => toRow(items.get(c.id))));
  emit();
  pump();
}

function isQueueIdle() {
  const all = [...items.values()];
  return !all.some((i) => i.status === 'queued' || i.status === 'downloading');
}

/** Drop every queue entry for a novel (queued, downloading marker stays until it settles, failed, completed).
 * Called when a novel is removed from the library so its rows don't linger in the Downloads screen. */
export async function removeByNovel(novelId) {
  const toRemove = [...items.values()].filter((i) => i.novelId === novelId && i.status !== 'downloading');
  if (!toRemove.length) return;
  order = order.filter((id) => !toRemove.some((i) => i.chapterId === id));
  toRemove.forEach((i) => items.delete(i.chapterId));
  await db.removeDownloadQueueItems(toRemove.map((i) => i.chapterId));
  emit(true);
}

/** Cancel every queued item (the whole batch, minus whatever is already mid-flight). */
export async function cancelAllQueued() {
  const toRemove = order.slice();
  order = [];
  toRemove.forEach((id) => items.delete(id));
  if (toRemove.length) await db.removeDownloadQueueItems(toRemove);
  emit(true);
}

/** Cancel a chapter: queued items are removed immediately; an in-flight download (not abortable in the plugin API) is flagged for discard once it settles. */
export async function cancel(chapterId) {
  const it = items.get(chapterId);
  if (!it) return;
  if (it.status === 'queued') {
    order = order.filter((id) => id !== chapterId);
    items.delete(chapterId);
    await db.removeDownloadQueueItems([chapterId]);
    emit(true);
  } else if (it.status === 'downloading') {
    cancelRequested.add(chapterId);
  }
}

/** Stops the next queued item from starting. The current in-flight download still finishes/settles. */
export function pauseQueue() {
  paused = true;
  emit(true);
}

export function resumeQueue() {
  paused = false;
  emit(true);
  pump();
}

export async function retryFailed() {
  const failed = [...items.values()].filter((i) => i.status === 'failed');
  if (!failed.length) return;
  for (const it of failed) {
    it.status = 'queued';
    it.error = null;
    it.queuePos = nextPos++;
    it.updatedAt = Date.now();
    order.push(it.chapterId);
  }
  await db.upsertDownloadQueueItems(failed.map(toRow));
  emit(true);
  pump();
}

export async function clearCompleted() {
  const done = [...items.values()].filter((i) => i.status === 'completed');
  if (!done.length) return;
  done.forEach((i) => items.delete(i.chapterId));
  await db.removeDownloadQueueItems(done.map((i) => i.chapterId));
  emit(true);
}

export async function clearFailed() {
  const failed = [...items.values()].filter((i) => i.status === 'failed');
  if (!failed.length) return;
  failed.forEach((i) => items.delete(i.chapterId));
  await db.removeDownloadQueueItems(failed.map((i) => i.chapterId));
  emit(true);
}

/** Handle notification action buttons (Pause/Resume/Cancel); hydrates first so it's safe in a headless wake before store hydration. */
export async function handleNotificationAction(action, data) {
  switch (action) {
    case NOTIF_ACTION.DOWNLOAD_PAUSE:
      await ensureInitialized();
      pauseQueue();
      break;
    case NOTIF_ACTION.DOWNLOAD_RESUME:
      await ensureInitialized();
      resumeQueue();
      break;
    case NOTIF_ACTION.DOWNLOAD_CANCEL:
      await ensureInitialized();
      _batchCancelled = true;
      cancelAllQueued();
      break;
  }
}

async function updateProgressNotification(force = false) {
  // Only spend the throttle window when a chapter is actually downloading (a no-op call once held it and left the ticker stuck).
  const current = [...items.values()].find((i) => i.status === 'downloading');
  if (!current) return;
  const now = Date.now();
  if (!force && now - lastNotifyAt < NOTIFY_THROTTLE_MS) return;
  lastNotifyAt = now;
  const label = batchTotal > 1 ? `${batchDone + 1} / ${batchTotal}` : current.chapterName;
  const notifTitle = batchTotal > 1 ? t('downloads.downloadingChapters') : t('downloads.downloading');
  await sendNotification({
    type: NOTIF_TYPE.DOWNLOAD_PROGRESS,
    identifier: NOTIF_ID.DOWNLOAD_QUEUE,
    title: notifTitle,
    body: batchTotal > 1 ? `${current.novelTitle}\n${current.chapterName} (${label})` : `${current.novelTitle}\n${current.chapterName}`,
    data: { screen: '/downloads' },
    actions: [
      { identifier: NOTIF_ACTION.DOWNLOAD_CANCEL, title: t('downloads.actionCancel') },
    ],
  });
}

async function sendBatchCompleteNotification() {
  await dismissNotification(NOTIF_ID.DOWNLOAD_QUEUE);
  if (_batchCancelled) {
    _batchCancelled = false;
    if (batchDone > 0) {
      await sendNotification({
        type: NOTIF_TYPE.DOWNLOAD_COMPLETE,
        identifier: NOTIF_ID.DOWNLOAD_QUEUE,
        title: t('downloads.cancelled'),
        body: t('downloads.cancelledBody', { done: batchDone }),
        data: { screen: '/downloads' },
      });
    }
    return;
  }
  if (batchDone <= 0) return;
  const countLabel = batchDone > 99 ? '99+' : String(batchDone);
  await sendNotification({
    type: NOTIF_TYPE.DOWNLOAD_COMPLETE,
    identifier: NOTIF_ID.DOWNLOAD_QUEUE,
    title: t('downloads.complete'),
    body: t('downloads.completeBody', { count: countLabel }),
    data: { screen: '/downloads' },
  });
  if (batchFailed > 0) {
    await sendNotification({
      type: NOTIF_TYPE.DOWNLOAD_FAILED,
      title: t('downloads.failedCount', { count: batchFailed }),
      body: '',
      data: { screen: '/downloads' },
    });
  }
}

/** Download one queued item to completion (fetch -> sanitize -> save -> persist); shared by foreground pump and headless worker. `it` must be 'downloading'. */
async function downloadItem(it) {
  const chapterId = it.chapterId;
  try {
    const chapterRow = await db.getChapter(chapterId);
    if (!chapterRow) throw new Error('Chapter no longer exists');
    // If text was already saved before the status row committed (crash), reconcile rather than re-fetch to avoid duplicating.
    if (chapterRow.downloadedText) {
      it.status = 'completed';
      it.updatedAt = Date.now();
      batchDone += 1;
      await db.upsertDownloadQueueItems([toRow(it)]);
      await persistBatchDims();
      return;
    }
    const novel = await db.getNovel(it.novelId);
    const pluginRecord = novel?.pluginId ? await db.getPlugin(novel.pluginId) : null;
    if (!pluginRecord) throw new Error('The source extension for this novel is not installed');
    const instance = loadPlugin(pluginRecord);
    const raw = await pluginApi.chapter(instance, chapterRow.path);
    const clean = sanitizeChapter(raw, { title: chapterRow.name });
    if (!clean) throw new Error('The source returned an empty chapter');

    if (cancelRequested.has(chapterId)) {
      cancelRequested.delete(chapterId);
      it.status = 'cancelled';
      it.updatedAt = Date.now();
      items.delete(chapterId);
      await db.removeDownloadQueueItems([chapterId]);
    } else {
      await db.saveChapterText(chapterId, clean);
      it.status = 'completed';
      it.updatedAt = Date.now();
      batchDone += 1;
      await db.upsertDownloadQueueItems([toRow(it)]);
    }
    await persistBatchDims();
  } catch (e) {
    cancelRequested.delete(chapterId);
    it.status = 'failed';
    it.error = e?.message ?? 'Download failed';
    it.updatedAt = Date.now();
    batchFailed += 1;
    await db.upsertDownloadQueueItems([toRow(it)]);
    await persistBatchDims();
  }
}

/** The foreground worker loop. Idempotent — safe to call any number of times; only one instance ever runs. */
async function pump() {
  if (working) return;
  working = true;
  try {
    while (!paused && !_batchCancelled && order.length) {
      const chapterId = order.shift();
      const it = items.get(chapterId);
      if (!it || it.status !== 'queued') continue;

      it.status = 'downloading';
      it.updatedAt = Date.now();
      // Not persisted: the DB row is already 'queued', and a crash demotes 'downloading' back to 'queued' on restart anyway.
      emit();
      // Force only the first item of a batch through (concurrency is 1) so instant failures respect the throttle instead of notifying per chapter.
      updateProgressNotification(batchDone === 0 && batchFailed === 0).catch(() => {});

      await downloadItem(it);
      // No progress-notification call here: the settled item is no longer 'downloading' and the next isn't yet, so it could report nothing (see updateProgressNotification).
      emit();
    }
  } finally {
    working = false;
  }
  if (_batchCancelled && isQueueIdle()) {
    _batchCancelled = false;
    emit(true);
    sendBatchCompleteNotification().catch(() => {});
    batchTotal = 0;
    batchDone = 0;
    batchFailed = 0;
    persistBatchDims();
  }
  if (!paused && isQueueIdle() && batchTotal > 0) {
    // Always land on the true final state — never let the throttle strand the UI on a stale "downloading" row.
    emit(true);
    sendBatchCompleteNotification().catch(() => {});
    batchTotal = 0;
    batchDone = 0;
    batchFailed = 0;
    persistBatchDims();
  }
}

/** Background-worker entry: downloads a bounded window (maxItems/timeBudget) so it returns inside the OS-granted slot; returns { processed, done }. */
export async function processNextBatch({ maxItems = 4, timeBudgetMs = 20000 } = {}) {
  await loadPersistedQueue();
  if (paused || _batchCancelled) return { processed: 0, done: isQueueIdle() };
  const start = Date.now();
  let processed = 0;
  while (
    !paused &&
    !_batchCancelled &&
    order.length &&
    processed < maxItems &&
    Date.now() - start < timeBudgetMs
  ) {
    const chapterId = order.shift();
    const it = items.get(chapterId);
    if (!it || it.status !== 'queued') continue;
    it.status = 'downloading';
    it.updatedAt = Date.now();
    emit();
    updateProgressNotification(processed === 0).catch(() => {});
    await downloadItem(it);
    processed += 1;
    emit();
  }
  // Land on an accurate notification from persisted state even if a budget cap stopped us mid-list.
  updateProgressNotification(true).catch(() => {});
  const done = isQueueIdle();
  if (!paused && done && batchTotal > 0) {
    emit(true);
    sendBatchCompleteNotification().catch(() => {});
    batchTotal = 0;
    batchDone = 0;
    batchFailed = 0;
    await persistBatchDims();
  }
  return { processed, done };
}
