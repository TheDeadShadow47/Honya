/**
 * Background download worker — runs in a headless (no React) context, so it
 * re-reads the persisted queue every run rather than trusting in-memory state.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../db/database';
import * as downloadQueue from './downloadQueue';
import { setPrefsSource } from './notifications';
import { defineTask } from './backgroundTasks';

export const DOWNLOAD_WORKER_TASK = 'honya-download-worker';

// Bound the work a single OS execution slot performs (stay conservative so a slow source never overruns the window).
const MAX_ITEMS_PER_RUN = 4;
const TIME_BUDGET_MS = 20000;

async function runBackgroundDownload() {
  await db.initDatabase();
  // Headless: no React mount, so gate notifications by the user's persisted toggles explicitly.
  // Parse immediately inside the try/catch so malformed persisted JSON can't throw later during send.
  let prefs = {};
  try {
    const raw = await AsyncStorage.getItem('@honya/prefs');
    prefs = raw ? JSON.parse(raw) : {};
  } catch {}
  setPrefsSource(() => prefs);
  await downloadQueue.ensureInitialized();
  await downloadQueue.processNextBatch({
    maxItems: MAX_ITEMS_PER_RUN,
    timeBudgetMs: TIME_BUDGET_MS,
  });
}

// Registered once at module load; minimumInterval (minutes, inexact) is the shortest OS floor.
defineTask(DOWNLOAD_WORKER_TASK, runBackgroundDownload, { minimumInterval: 15 });
