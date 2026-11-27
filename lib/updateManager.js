import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { sendNotification, dismissNotification, setPrefsSource, NOTIF_TYPE, NOTIF_ID } from './notifications';
import { defineTask } from './backgroundTasks';
import { t } from './i18n';

const GITHUB_REPO = 'TheDeadShadow47/Honya';
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours
const APK_DIR = `${FileSystem.documentDirectory}honya-updates/`;
const APK_ASSET_PATTERN = /^Honya-v[\d.]+\.apk$/i;

const STATE_KEY = '@honya/updateState';

let state = {
  lastCheckAt: null,
  latestRelease: null,
  skippedVersion: null,
  downloadedVersion: null,
  downloadedPath: null,
  lastSeenVersion: null,
};

let downloading = false;
let downloadAbort = null;
let downloadProgress = { bytesWritten: 0, totalBytes: 0 };
let downloadError = null;
const listeners = new Set();
let initialized = false;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const snapshot = getState();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {}
  });
}

export function getState() {
  return {
    ...state,
    downloading,
    downloadProgress: { ...downloadProgress },
    downloadError,
  };
}

async function saveState() {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch {}
}

export async function initUpdateManager() {
  if (initialized) return;
  initialized = true;
  await loadState();
  try {
    const info = await FileSystem.getInfoAsync(APK_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(APK_DIR, { intermediates: true });
    }
  } catch {}

  // App storage survives installs, so persisted version state can still describe an APK that is
  // now installed. Reconcile that first; then drop a download whose file has disappeared.
  await reconcileWithInstalledVersion();

  if (state.downloadedPath) {
    try {
      const info = await FileSystem.getInfoAsync(state.downloadedPath);
      if (!info.exists) {
        state.downloadedVersion = null;
        state.downloadedPath = null;
        await saveState();
      }
    } catch {
      state.downloadedVersion = null;
      state.downloadedPath = null;
      await saveState();
    }
  }
  emit();
}

/** Keep version state strictly newer than the installed app; Android app storage survives upgrades. */
async function reconcileWithInstalledVersion() {
  const currentVersion = getCurrentVersion();
  let changed = false;

  // A downloaded APK is obsolete once the installed version catches up to or passes it.
  if (state.downloadedVersion && !isNewer(state.downloadedVersion, currentVersion)) {
    await deleteObsoleteApk(state.downloadedPath, state.downloadedVersion);
    state.downloadedVersion = null;
    state.downloadedPath = null;
    changed = true;
  }

  // checkForUpdates() handles this when it runs, but a throttled check can leave it stale across an update.
  if (state.latestRelease && !isNewer(state.latestRelease.version, currentVersion)) {
    state.latestRelease = null;
    changed = true;
  }

  // Forget skips the installed version has passed, so a future release isn't treated as skipped.
  if (state.skippedVersion && !isNewer(state.skippedVersion, currentVersion)) {
    state.skippedVersion = null;
    changed = true;
  }

  if (changed) {
    await saveState();
  }
}

/** Never throws: failed cleanup must not block init. */
async function deleteObsoleteApk(path, version) {
  if (!path) return;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch (e) {
    console.warn(`[UpdateManager] failed to delete obsolete APK for v${version}:`, e?.message ?? e);
  }
}

export function getCurrentVersion() {
  return Constants.expoConfig?.version ?? Constants.manifest?.version ?? '1.5.0';
}

/** Parse a semver-like string; pre-release tags are ignored for comparison (tagged versions compare older). */
function parseVersion(v) {
  if (!v) return [0, 0, 0];
  const cleaned = String(v).replace(/^v/i, '');
  const parts = cleaned.split('-');
  const nums = parts[0].split('.').map((n) => parseInt(n, 10) || 0);
  const hasPreRelease = parts.length > 1;
  const major = nums[0] || 0;
  const minor = nums[1] || 0;
  const patch = nums[2] || 0;
  return [major, minor, patch, hasPreRelease ? -1 : 0];
}

export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 4; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function isNewer(remote, current) {
  return compareVersions(remote, current) > 0;
}

async function fetchLatestRelease() {
  const response = await fetch(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Honya/${getCurrentVersion()}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`GitHub API responded with ${response.status}`);
  }

  const release = await response.json();
  if (!release || !release.tag_name) return null;

  const version = release.tag_name.replace(/^v/i, '');

  const assets = release.assets || [];
  let apkAsset = null;

  for (const asset of assets) {
    if (APK_ASSET_PATTERN.test(asset.name)) {
      apkAsset = asset;
      break;
    }
  }

  if (!apkAsset) {
    for (const asset of assets) {
      if (asset.name && asset.name.toLowerCase().endsWith('.apk')) {
        apkAsset = asset;
        break;
      }
    }
  }

  if (!apkAsset) {
    return null;
  }

  return {
    version,
    body: release.body || '',
    publishedAt: release.published_at || null,
    apkUrl: apkAsset.browser_download_url,
    apkName: apkAsset.name,
    apkSize: apkAsset.size || null,
  };
}

/** `force` skips the 24h throttle. */
export async function checkForUpdates({ force = false } = {}) {
  if (!force && state.lastCheckAt && Date.now() - state.lastCheckAt < CHECK_THROTTLE_MS) {
    return {
      available: !!state.latestRelease && isNewer(state.latestRelease.version, getCurrentVersion()),
      release: state.latestRelease,
      throttled: true,
    };
  }

  try {
    const release = await fetchLatestRelease();
    const currentVersion = getCurrentVersion();

    state.lastCheckAt = Date.now();

    if (release && isNewer(release.version, currentVersion)) {
      if (release.version !== state.skippedVersion) {
        state.latestRelease = release;
      } else {
        state.latestRelease = null;
      }
    } else {
      state.latestRelease = null;
      state.skippedVersion = null;
    }

    await saveState();
    emit();

    return {
      available: !!state.latestRelease,
      release: state.latestRelease,
      throttled: false,
    };
  } catch (e) {
    console.warn('[UpdateManager] check failed:', e.message);
    emit();
    return {
      available: false,
      release: null,
      error: e.message,
    };
  }
}

/** Downloads with a progress notification; cancellable via cancelDownload(). */
export async function downloadUpdate() {
  const release = state.latestRelease;
  if (!release || downloading) return { started: false };

  if (state.downloadedVersion === release.version && state.downloadedPath) {
    try {
      const info = await FileSystem.getInfoAsync(state.downloadedPath);
      if (info.exists && info.size > 0) {
        emit();
        return { started: false, alreadyDownloaded: true };
      }
    } catch {}
  }

  downloading = true;
  downloadProgress = { bytesWritten: 0, totalBytes: release.apkSize || 0 };
  downloadAbort = { cancelled: false };
  downloadError = null;
  emit();

  const destPath = `${APK_DIR}Honya-v${release.version}.apk`;

  try {
    await FileSystem.deleteAsync(destPath, { idempotent: true });
  } catch {}

  sendNotification({
    type: NOTIF_TYPE.UPDATE_PROGRESS,
    identifier: NOTIF_ID.UPDATE_DOWNLOAD,
    title: t('update.notificationProgressTitle'),
    body: t('update.notificationProgressBody', { version: release.version }),
    data: { screen: '/settings/update', params: {} },
  }).catch(() => {});

  try {
    const downloadResumable = FileSystem.createDownloadResumable(
      release.apkUrl,
      destPath,
      {
        headers: {
          'User-Agent': `Honya/${getCurrentVersion()}`,
        },
      },
      (downloadProgressData) => {
        if (downloadAbort?.cancelled) return;
        downloadProgress = {
          bytesWritten: downloadProgressData.totalBytesWritten,
          totalBytes: downloadProgressData.totalBytesExpectedToWrite,
        };
        emit();
        updateProgressNotification(release.version).catch(() => {});
      },
    );

    downloadAbort.abortFn = () => downloadResumable.cancelAsync();

    const result = await downloadResumable.downloadAsync();

    if (downloadAbort?.cancelled) {
      await cleanupPartialDownload(destPath);
      downloading = false;
      downloadProgress = { bytesWritten: 0, totalBytes: 0 };
      downloadAbort = null;
      downloadError = null;
      await dismissNotification(NOTIF_ID.UPDATE_DOWNLOAD);
      emit();
      return { started: true, cancelled: true };
    }

    if (!result || !result.uri) {
      throw new Error('Download failed — no file produced');
    }

    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    if (!fileInfo.exists || fileInfo.size === 0) {
      throw new Error('Downloaded file is empty or missing');
    }

    // A much smaller file than advertised is probably truncated.
    if (release.apkSize && fileInfo.size < release.apkSize * 0.9) {
      throw new Error('Downloaded file is incomplete');
    }

    state.downloadedVersion = release.version;
    state.downloadedPath = result.uri;
    await saveState();

    await dismissNotification(NOTIF_ID.UPDATE_DOWNLOAD);
    await sendNotification({
      type: NOTIF_TYPE.UPDATE_READY,
      identifier: NOTIF_ID.UPDATE_DOWNLOAD,
      title: t('update.notificationReadyTitle'),
      body: t('update.notificationReadyBody', { version: release.version }),
      data: { screen: '/settings/update', params: {} },
    });

    downloading = false;
    downloadProgress = { bytesWritten: 0, totalBytes: 0 };
    downloadAbort = null;
    downloadError = null;
    emit();
    return { started: true, completed: true, path: result.uri };
  } catch (e) {
    console.warn('[UpdateManager] download failed:', e.message);

    await cleanupPartialDownload(destPath);

    await dismissNotification(NOTIF_ID.UPDATE_DOWNLOAD);
    await sendNotification({
      type: NOTIF_TYPE.UPDATE_FAILED,
      title: t('update.downloadFailed'),
      body: e.message,
      data: { screen: '/settings/update', params: {} },
    }).catch(() => {});

    downloading = false;
    downloadProgress = { bytesWritten: 0, totalBytes: 0 };
    downloadAbort = null;
    downloadError = e?.message ?? 'Download failed';
    emit();
    return { started: true, completed: false, error: e.message };
  }
}

async function cleanupPartialDownload(path) {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {}
}

let lastProgressNotifyAt = 0;
const PROGRESS_NOTIFY_THROTTLE_MS = 2000;

async function updateProgressNotification(version) {
  const now = Date.now();
  if (now - lastProgressNotifyAt < PROGRESS_NOTIFY_THROTTLE_MS) return;
  lastProgressNotifyAt = now;

  const { bytesWritten, totalBytes } = downloadProgress;
  const pct = totalBytes > 0 ? Math.round((bytesWritten / totalBytes) * 100) : 0;
  const body = `${t('update.downloadingVersion', { version })}\n${pct}%`;

  await sendNotification({
    type: NOTIF_TYPE.UPDATE_PROGRESS,
    identifier: NOTIF_ID.UPDATE_DOWNLOAD,
    title: t('update.notificationProgressTitle'),
    body,
    data: { screen: '/settings/update', params: {} },
  });
}

export async function cancelDownload() {
  if (!downloading || !downloadAbort) return;
  downloadAbort.cancelled = true;
  if (downloadAbort.abortFn) {
    try {
      await downloadAbort.abortFn();
    } catch {}
  }
}

/** Hands the APK to Android's installer; returns `{ success, error, needsPermission }`. */
export async function installUpdate() {
  if (!state.downloadedPath || !state.downloadedVersion) {
    return { success: false, error: 'No downloaded update' };
  }

  if (Platform.OS !== 'android') {
    return { success: false, error: 'Installation is only supported on Android' };
  }

  try {
    const info = await FileSystem.getInfoAsync(state.downloadedPath);
    if (!info.exists || info.size === 0) {
      state.downloadedVersion = null;
      state.downloadedPath = null;
      await saveState();
      emit();
      return { success: false, error: 'Downloaded file no longer exists' };
    }
  } catch {
    state.downloadedVersion = null;
    state.downloadedPath = null;
    await saveState();
    emit();
    return { success: false, error: 'Could not verify downloaded file' };
  }

  try {
    const contentUri = await FileSystem.getContentUriAsync(state.downloadedPath);
    const result = await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
    // Some launchers resolve instead of throwing when no handler is available.
    if (result && result.resultCode === 0 && !result.data) {
      return { success: false, error: 'No app is available to install this update', needsPermission: true };
    }
    await dismissNotification(NOTIF_ID.UPDATE_DOWNLOAD);
    return { success: true };
  } catch (e) {
    const message = e?.message || 'Install failed';
    const isPermission =
      /security|permission|activityNotFound|not found|cannot resolve|no handler/i.test(message);
    console.warn('[UpdateManager] install intent failed:', message);
    return { success: false, error: message, needsPermission: isPermission };
  }
}

export async function skipVersion() {
  if (state.latestRelease) {
    state.skippedVersion = state.latestRelease.version;
    state.latestRelease = null;
    await saveState();
    await dismissNotification(NOTIF_ID.UPDATE_DOWNLOAD);
    emit();
  }
}

export async function dismissUpdate() {
  // Keep the update available but don't nag; it stays in Settings.
  await dismissNotification(NOTIF_ID.UPDATE_DOWNLOAD);
}

export async function checkWhatsNew() {
  await initUpdateManager();
  const currentVersion = getCurrentVersion();
  if (state.lastSeenVersion === currentVersion) return null;

  if (state.latestRelease && state.latestRelease.version === currentVersion) {
    return {
      version: currentVersion,
      body: state.latestRelease.body,
    };
  }

  return {
    version: currentVersion,
    body: null,
  };
}

export async function markWhatsNewSeen() {
  const currentVersion = getCurrentVersion();
  state.lastSeenVersion = currentVersion;
  await saveState();
  emit();
}

/** Notifies only, never downloads; respects the normal throttle. */
export async function backgroundCheckForUpdate() {
  try {
    const result = await checkForUpdates({ force: false });
    if (result.available && result.release) {
      await sendNotification({
        type: NOTIF_TYPE.UPDATE_AVAILABLE,
        title: t('update.notificationAvailableTitle', { version: result.release.version }),
        body: t('update.notificationAvailableBody'),
        data: { screen: '/settings/update', params: {} },
      });
    }
  } catch {
    // Background checks should never crash.
  }
}

export function hasDownloadedUpdate() {
  return !!(state.downloadedVersion && state.downloadedPath);
}

export function getDownloadedVersion() {
  return state.downloadedVersion;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseReleaseNotes(body) {
  if (!body) return { newFeatures: [], improvements: [], bugFixes: [] };

  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const result = { newFeatures: [], improvements: [], bugFixes: [] };
  let currentSection = 'newFeatures';

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('### ') || lower.startsWith('## ')) {
      const header = lower.replace(/^#+\s*/, '');
      if (header.includes('new') || header.includes('feature')) currentSection = 'newFeatures';
      else if (header.includes('improv') || header.includes('enhance') || header.includes('perf')) currentSection = 'improvements';
      else if (header.includes('fix') || header.includes('bug')) currentSection = 'bugFixes';
      else currentSection = 'newFeatures';
      continue;
    }

    const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
    if (!cleaned) continue;

    // "fix"/"bug" in a line means bug fixes even if the heading was vague.
    if (lower.includes('fix') || lower.includes('bug')) {
      result.bugFixes.push(cleaned);
    } else if (lower.includes('improv') || lower.includes('faster') || lower.includes('better') || lower.includes('optim')) {
      result.improvements.push(cleaned);
    } else {
      result.newFeatures.push(cleaned);
    }
  }

  return result;
}

// Same check as a foreground wake, from an OS-scheduled headless wake. The 15-minute minimum is
// just the OS floor; actual cadence comes from checkForUpdates()' persisted 24h throttle. Download
// and install stay foreground-only.
export const SELF_UPDATE_TASK = 'honya-selfupdate-check';

async function runBackgroundSelfUpdateCheck() {
  // No React mount in a headless wake: load persisted state and prefs source explicitly.
  await initUpdateManager();
  try {
    const raw = await AsyncStorage.getItem('@honya/prefs');
    setPrefsSource(() => (raw ? JSON.parse(raw) : {}));
  } catch {}
  // The check swallows its own errors, so a failure never crashes the task.
  await backgroundCheckForUpdate();
}

// Module-load registration also covers headless launches; useStore imports this unconditionally.
defineTask(SELF_UPDATE_TASK, runBackgroundSelfUpdateCheck, { minimumInterval: 15 });
