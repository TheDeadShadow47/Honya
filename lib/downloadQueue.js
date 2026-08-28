/**
 * Centralized chapter download queue.
 *
 * Single worker, one chapter at a time by default. Backed by the `downloads`
 * SQLite table so the queue survives navigation, app close and crashes.
 * Reuses the existing plugin API / db layer — this is not a second download
 * engine, just the one download path (fetch chapter -> sanitize -> save)
 * pulled out of screen components and centralized.
 */
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

// Batch bookkeeping for the "N of M" ongoing notification / summary.
let batchTotal = 0;
let batchDone = 0;
let batchFailed = 0;
let lastNotifyAt = 0;
const NOTIFY_THROTTLE_MS = 1200;
let lastEmitAt = 0;
const EMIT_THROTTLE_MS = 150;
let batchJustStarted = false;

function emit(force = false) {
  const now = Date.now();
  if (batchJustStarted) {
    force = true;
    batchJustStarted = false;
  }
  // A queue full of instant failures (e.g. the extension for those chapters got
  // uninstalled) would otherwise flood the store with a render per item; a real
  // download's network latency is always well above this window so it's never
  // noticeable on the common path.
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
    // Real counts from this batch (not a fake percentage) — used by the
    // Downloads screen to show "Chapter X / Y" style batch position.
    batchTotal,
    batchDone,
    // Flat map mirroring the old store.downloadStates shape { [chapterId]: 'queued'|'downloading'|'failed' }
    // so existing UI (ChapterRow, SelectionBar) keeps working unmodified.
    states: Object.fromEntries(all.filter((i) => i.status !== 'completed').map((i) => [i.chapterId, i.status])),
  };
}

/** Reconcile persisted queue rows on boot. Anything mid-download when the app died goes back to queued. */
export async function initDownloadQueue() {
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
  pump();
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

/**
 * Add chapters to the queue. Accepts the lightweight chapter rows from
 * db.getChapters (id, novelId, name, number, downloaded). Already-downloaded
 * or already-queued/downloading chapters are skipped.
 */
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

/** Cancel a chapter. Queued items are removed immediately; an in-flight
 * download can't be aborted (no cancellation in the plugin API), so it's
 * flagged to be discarded once the current request settles. */
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

/**
 * Handle notification action button presses (Pause/Resume/Cancel).
 * Called from the notification action handler in _layout.js.
 */
export function handleNotificationAction(action, data) {
  switch (action) {
    case NOTIF_ACTION.DOWNLOAD_PAUSE:
      pauseQueue();
      break;
    case NOTIF_ACTION.DOWNLOAD_RESUME:
      resumeQueue();
      break;
    case NOTIF_ACTION.DOWNLOAD_CANCEL:
      _batchCancelled = true;
      cancelAllQueued();
      break;
  }
}

async function updateProgressNotification(force = false) {
  // Resolve the actual chapter that's downloading *before* touching the
  // throttle timestamp. Root cause of the notification getting stuck on the
  // first chapter: this used to stamp `lastNotifyAt` even when there was no
  // in-flight chapter to report (e.g. the call made right after a chapter
  // settles, before the next one is marked 'downloading'). That no-op call
  // consumed the throttle window, so the very next call — the one made right
  // as chapter 2+ actually started downloading — was immediately throttled
  // and silently dropped, leaving the tray notification showing chapter 1
  // forever. Only spend the throttle window when we're about to send.
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

/** The worker loop. Idempotent — safe to call any number of times; only one instance ever runs. */
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
      // Not persisted: a crash mid-download demotes 'downloading' rows back to
      // 'queued' on restart anyway (see initDownloadQueue), so writing this
      // transition to SQLite would just be an extra write with no recovery
      // benefit — the DB row is already 'queued', which is exactly right.
      emit();
      // Force only the very first item of a batch through immediately (concurrency
      // is 1, so batchDone/batchFailed are still both 0 only for that first item) —
      // otherwise a run of instant failures would fire a native notification call
      // per chapter instead of respecting the throttle.
      updateProgressNotification(batchDone === 0 && batchFailed === 0).catch(() => {});

      try {
        const chapterRow = await db.getChapter(chapterId);
        if (!chapterRow) throw new Error('Chapter no longer exists');
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
      } catch (e) {
        cancelRequested.delete(chapterId);
        it.status = 'failed';
        it.error = e?.message ?? 'Download failed';
        it.updatedAt = Date.now();
        batchFailed += 1;
        await db.upsertDownloadQueueItems([toRow(it)]);
      }
      // No `updateProgressNotification()` call here: the item that just
      // settled is no longer 'downloading' and the next one (if any) hasn't
      // been marked 'downloading' yet, so there is nothing this call could
      // ever report — it would just be a wasted throttle-window spend (see
      // the note inside updateProgressNotification). The next loop iteration
      // covers the update once the next chapter actually starts.
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
  }
  if (!paused && isQueueIdle() && batchTotal > 0) {
    // Always land on the true final state — never let the throttle strand the UI on a stale "downloading" row.
    emit(true);
    sendBatchCompleteNotification().catch(() => {});
    batchTotal = 0;
    batchDone = 0;
    batchFailed = 0;
  }
}
