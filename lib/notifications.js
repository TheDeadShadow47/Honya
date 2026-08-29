import { Linking, Platform } from 'react-native';
import { isExpoGo } from './nativeSupport';

// expo-notifications / expo-task-manager call requireNativeModule() at import and throw when the
// native module is absent, so load them only outside Expo Go (notifications are unavailable there).
let Notifications = null;
let TaskManagerModule = null;
if (!isExpoGo()) {
  try {
    Notifications = require('expo-notifications');
    TaskManagerModule = require('expo-task-manager');
  } catch (e) {
    console.warn('[Notifications] native modules unavailable', e?.message);
  }
}

// Notification types — future features add entries here
export const NOTIF_TYPE = {
  NEW_CHAPTERS: 'new_chapters',
  DOWNLOAD_COMPLETE: 'download_complete',
  DOWNLOAD_FAILED: 'download_failed',
  DOWNLOAD_PROGRESS: 'download_progress',
  BACKUP_COMPLETE: 'backup_complete',
  BACKUP_FAILED: 'backup_failed',
  LIBRARY_UPDATE_PROGRESS: 'library_update_progress',
  LIBRARY_UPDATE_COMPLETE: 'library_update_complete',
  LIBRARY_UPDATE_FAILED: 'library_update_failed',
  UPDATE_AVAILABLE: 'update_available',
  UPDATE_PROGRESS: 'update_progress',
  UPDATE_READY: 'update_ready',
  UPDATE_FAILED: 'update_failed',
  GENERAL: 'general',
};

// Stable identifiers so an "ongoing" notification updates in place (same Android id) instead of stacking a new one every tick.
export const NOTIF_ID = {
  LIBRARY_UPDATE: 'honya-library-update',
  DOWNLOAD_QUEUE: 'honya-download-queue',
  UPDATE_DOWNLOAD: 'honya-update-download',
};

// Notification action identifiers — used by notification action buttons
export const NOTIF_ACTION = {
  DOWNLOAD_PAUSE: 'download_pause',
  DOWNLOAD_RESUME: 'download_resume',
  DOWNLOAD_CANCEL: 'download_cancel',
  UPDATE_CANCEL: 'update_cancel',
};

// Map notification types to Android channels. The channel governs audio/alert behavior and is
// persistent per-device, so ongoing/ticker types must land on a silent (LOW) channel and only
// meaningful "result" types on an alerting (DEFAULT) channel. See ensureChannels()/CHANNELS.
const CHANNEL_MAP = {
  [NOTIF_TYPE.NEW_CHAPTERS]: 'updates',
  [NOTIF_TYPE.LIBRARY_UPDATE_PROGRESS]: 'downloads',
  [NOTIF_TYPE.LIBRARY_UPDATE_COMPLETE]: 'updates',
  [NOTIF_TYPE.LIBRARY_UPDATE_FAILED]: 'updates',
  [NOTIF_TYPE.UPDATE_AVAILABLE]: 'updates',
  [NOTIF_TYPE.UPDATE_READY]: 'updates',
  [NOTIF_TYPE.UPDATE_FAILED]: 'updates',
  [NOTIF_TYPE.DOWNLOAD_PROGRESS]: 'downloads',
  [NOTIF_TYPE.DOWNLOAD_COMPLETE]: 'downloads_results',
  [NOTIF_TYPE.DOWNLOAD_FAILED]: 'downloads_results',
  [NOTIF_TYPE.UPDATE_PROGRESS]: 'downloads',
  [NOTIF_TYPE.GENERAL]: 'general',
  [NOTIF_TYPE.BACKUP_COMPLETE]: 'general',
  [NOTIF_TYPE.BACKUP_FAILED]: 'general',
};

// Map notification types to the user-facing preference category used by the master toggles
// (separate from CHANNEL_MAP: the channel decides audio, the category decides whether the user
// can silence the kind of notification). Keep every download type under 'downloads' so the
// existing "download notifications" toggle keeps working even though results use their own channel.
const CATEGORY_MAP = {
  [NOTIF_TYPE.NEW_CHAPTERS]: 'updates',
  [NOTIF_TYPE.LIBRARY_UPDATE_PROGRESS]: 'updates',
  [NOTIF_TYPE.LIBRARY_UPDATE_COMPLETE]: 'updates',
  [NOTIF_TYPE.LIBRARY_UPDATE_FAILED]: 'updates',
  [NOTIF_TYPE.UPDATE_AVAILABLE]: 'updates',
  [NOTIF_TYPE.UPDATE_READY]: 'updates',
  [NOTIF_TYPE.UPDATE_FAILED]: 'updates',
  [NOTIF_TYPE.DOWNLOAD_PROGRESS]: 'downloads',
  [NOTIF_TYPE.DOWNLOAD_COMPLETE]: 'downloads',
  [NOTIF_TYPE.DOWNLOAD_FAILED]: 'downloads',
  [NOTIF_TYPE.UPDATE_PROGRESS]: 'downloads',
  [NOTIF_TYPE.GENERAL]: 'general',
  [NOTIF_TYPE.BACKUP_COMPLETE]: 'general',
  [NOTIF_TYPE.BACKUP_FAILED]: 'general',
};

// Notification types that drive an ongoing ticker. These must never re-alert (sound/vibration) on
// each progress update; they're posted to the silent LOW "downloads" channel and forced silent.
const PROGRESS_TYPES = new Set([
  NOTIF_TYPE.DOWNLOAD_PROGRESS,
  NOTIF_TYPE.LIBRARY_UPDATE_PROGRESS,
  NOTIF_TYPE.UPDATE_PROGRESS,
]);

// Fine-grained per-type preference, checked in addition to the category master toggle.
const FINE_PREF_MAP = {
  [NOTIF_TYPE.DOWNLOAD_PROGRESS]: 'notifyDownloadStart',
  [NOTIF_TYPE.DOWNLOAD_COMPLETE]: 'notifyDownloadComplete',
  [NOTIF_TYPE.DOWNLOAD_FAILED]: 'notifyDownloadFailed',
  [NOTIF_TYPE.NEW_CHAPTERS]: 'notifyNewChaptersFound',
  [NOTIF_TYPE.LIBRARY_UPDATE_COMPLETE]: 'notifyUpdateComplete',
  [NOTIF_TYPE.LIBRARY_UPDATE_FAILED]: 'notifyUpdateFailed',
};

let _initialized = false;
let _channelsCreated = false;
let _responseSubscription = null;
let _foregroundSubscription = null;
let _pendingNotificationData = null;
let _routerRef = null;
let _getPrefs = null;
let _onNotificationAction = null;

/** Seed the prefs source; required for headless background tasks (no React mount) so notifications respect toggles. Last getter wins. */
export function setPrefsSource(getPrefs) {
  _getPrefs = getPrefs || null;
}

// Android notification channels; importance uses expo-notifications AndroidImportance numerics
// (DEFAULT=3, LOW=2) so this module can be evaluated without importing the native module (e.g. Expo Go).
// LOW channels are silent (used for the ongoing progress tickers); DEFAULT channels may alert once
// per posting (used for meaningful results). Never lower an existing channel's importance — Android
// persists channel settings after first creation, so a code change can't silence an already-created
// channel. Add a new channel instead of mutating an existing one.
const CHANNELS = [
  { id: 'general', name: 'General', importance: 3 },
  { id: 'updates', name: 'Honya Updates', importance: 3 },
  { id: 'downloads', name: 'Honya Downloads', importance: 2 },
  // Download results (complete/failed) alert once on their own channel so the silent progress
  // ticker never re-alerts them; separated from the LOW "downloads" ticker channel on purpose.
  { id: 'downloads_results', name: 'Honya Download Results', importance: 3 },
];

// Foreground notification handler — show banner when app is open
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Resolve notification type to Android channel ID
function channelId(type) {
  return CHANNEL_MAP[type] || 'general';
}

// Initialize notification channels on Android
async function ensureChannels() {
  if (!Notifications || _channelsCreated) return;
  if (Platform.OS !== 'android') {
    _channelsCreated = true;
    return;
  }
  try {
    for (const ch of CHANNELS) {
      await Notifications.setNotificationChannelAsync(ch.id, {
        name: ch.name,
        importance: ch.importance,
      });
    }
    _channelsCreated = true;
  } catch (e) {
    console.warn('[Notifications] channel setup failed', e.message);
  }
}

// Resolve where a notification tap should navigate
function resolveNavigationTarget(data) {
  if (!data) return null;

  if (data.screen && data.params) {
    return { screen: data.screen, params: data.params };
  }

  const type = data.type;
  if (type === NOTIF_TYPE.NEW_CHAPTERS || type === NOTIF_TYPE.LIBRARY_UPDATE_COMPLETE) {
    return { screen: '(tabs)', params: { screen: 'updates' } };
  }
  if (
    type === NOTIF_TYPE.DOWNLOAD_PROGRESS ||
    type === NOTIF_TYPE.DOWNLOAD_COMPLETE ||
    type === NOTIF_TYPE.DOWNLOAD_FAILED
  ) {
    return { screen: '/downloads', params: {} };
  }
  if (
    type === NOTIF_TYPE.UPDATE_AVAILABLE ||
    type === NOTIF_TYPE.UPDATE_PROGRESS ||
    type === NOTIF_TYPE.UPDATE_READY
  ) {
    return { screen: '/settings/update', params: {} };
  }

  return null;
}

// Navigate to target once router is ready
function _navigateToTarget(target) {
  if (!target || !_routerRef) return;
  try {
    _routerRef.push(target.screen, target.params || {});
  } catch {}
}

// Process a notification tap (called from response listener)
function _handleNotificationResponse(response) {
  const data = response?.notification?.request?.content?.data;
  if (!data) return;

  // Check if this is a notification action button press
  const action = response?.actionIdentifier;
  const defaultActionId = Notifications?.DEFAULT_ACTION_IDENTIFIER || 'default';
  if (action && action !== defaultActionId) {
    // Map expo-notifications action identifier to our action constant
    const actionMap = {
      [NOTIF_ACTION.DOWNLOAD_PAUSE]: NOTIF_ACTION.DOWNLOAD_PAUSE,
      [NOTIF_ACTION.DOWNLOAD_RESUME]: NOTIF_ACTION.DOWNLOAD_RESUME,
      [NOTIF_ACTION.DOWNLOAD_CANCEL]: NOTIF_ACTION.DOWNLOAD_CANCEL,
      [NOTIF_ACTION.UPDATE_CANCEL]: NOTIF_ACTION.UPDATE_CANCEL,
    };
    const mappedAction = actionMap[action];
    if (mappedAction && _onNotificationAction) {
      _onNotificationAction(mappedAction, data);
      return;
    }
  }

  // Normal tap — navigate
  const target = resolveNavigationTarget(data);
  if (_routerRef) {
    _navigateToTarget(target);
  } else {
    _pendingNotificationData = data;
  }
}

// ── Public API ───────────────────────────────────────────────────────────

// Check current permission status without prompting
export async function getPermissionStatus() {
  if (!Notifications) return 'denied'; // notifications unavailable (e.g. Expo Go)
  const { status } = await Notifications.getPermissionsAsync();
  return status; // 'granted' | 'denied' | 'undetermined'
}

/** Like getPermissionStatus, but also reports `canAskAgain` (once denied, Android stops showing the permission dialog). */
export async function getPermissionInfo() {
  if (!Notifications) {
    return { status: 'denied', canAskAgain: false };
  }
  const result = await Notifications.getPermissionsAsync();
  return {
    status: result.status,
    canAskAgain: result.canAskAgain !== false,
  };
}

/** Returns true if the OS-level notification permission is actually granted. */
export async function areNotificationsEnabled() {
  const status = await getPermissionStatus();
  return status === 'granted';
}

// Request notification permission — only call when the user triggers it
export async function requestPermission() {
  if (!Notifications) return 'denied';
  const { status } = await Notifications.requestPermissionsAsync();
  return status;
}

// Open the OS-level app notification settings — the only path left once
// canAskAgain is false.
export function openNotificationSettings() {
  try {
    Linking.openSettings();
  } catch {}
}

// Initialize the notification system — call once after hydration
export async function initNotifications({ getPrefs, onNotificationAction } = {}) {
  if (_initialized) return;
  _initialized = true;
  _getPrefs = getPrefs || null;
  _onNotificationAction = onNotificationAction || null;

  // Notifications are unavailable in Expo Go — nothing to set up.
  if (!Notifications) return;

  await ensureChannels();

  _foregroundSubscription = Notifications.addNotificationReceivedListener(() => {});

  _responseSubscription = Notifications.addNotificationResponseReceivedListener(
    _handleNotificationResponse,
  );
}

// Set the router reference — call from RootLayout once navigation is ready
export function setRouterReference(router) {
  _routerRef = router;

  // Process any notification that arrived before the router was ready
  if (_pendingNotificationData) {
    const target = resolveNavigationTarget(_pendingNotificationData);
    _pendingNotificationData = null;
    _navigateToTarget(target);
  }
}

// Remove listeners — call on cleanup
export function removeNotificationListeners() {
  // expo-notifications 0.32 removed Notifications.removeNotificationSubscription(sub);
  // subscriptions now remove themselves via sub.remove() — calling the old API would throw.
  if (_foregroundSubscription) {
    _foregroundSubscription.remove();
    _foregroundSubscription = null;
  }
  if (_responseSubscription) {
    _responseSubscription.remove();
    _responseSubscription = null;
  }
}

// Check if a notification category is enabled in user preferences
export function isNotificationEnabled(category, prefs) {
  if (!prefs?.notificationsEnabled) return false;

  switch (category) {
    case 'updates':
      return prefs.notificationsUpdates !== false;
    case 'downloads':
      return prefs.notificationsDownloads !== false;
    default:
      return true;
  }
}

// Category + fine-grained-toggle check for a specific notification type.
function isTypeEnabled(type, prefs) {
  const category = CATEGORY_MAP[type] || 'general';
  if (!isNotificationEnabled(category, prefs)) return false;
  const fineKey = FINE_PREF_MAP[type];
  if (fineKey && prefs[fineKey] === false) return false;
  return true;
}

// Send a notification (checks permission + prefs). Pass `identifier` to update an "ongoing" notification
// in place (same Android id replaces, not stacks).
//
// On Android the channel is resolved by expo-notifications from the *trigger* (not the content), so we
// pass it via a `{ type: 'channel', channelId }` trigger. Passing `trigger: null` makes expo fall back to
// its own HIGH-importance "fallback" channel, which re-alerts (plays sound) on every update — the cause
// of the download-progress notification sound spam. Progress/ticker types are also forced silent via
// `content.sound: false` so they never re-alert regardless of the device's channel state.
export async function sendNotification({ type = NOTIF_TYPE.GENERAL, title, body, data, identifier, actions }) {
  if (!title) return null;

  const status = await getPermissionStatus();
  if (status !== 'granted') return null;

  const prefs = _getPrefs ? _getPrefs() : null;
  if (prefs && !isTypeEnabled(type, prefs)) return null;

  await ensureChannels();

  const progress = PROGRESS_TYPES.has(type);

  try {
    const notificationContent = {
      title,
      body: body || undefined,
      data: { type, ...data },
      ...(Platform.OS === 'android' ? { channelId: channelId(type) } : {}),
      // Ongoing/ticker notifications must never re-alert on each progress tick.
      ...(progress ? { sound: false } : {}),
    };

    // Add Android notification actions (buttons)
    if (Platform.OS === 'android' && actions && actions.length) {
      notificationContent.actions = actions.map((a) => ({
        identifier: a.identifier,
        buttonTitle: a.title,
        ...(a.input ? { input: a.input } : {}),
      }));
    }

    const id = await Notifications.scheduleNotificationAsync({
      ...(identifier ? { identifier } : {}),
      content: notificationContent,
      // On Android route the channel via the trigger so the native builder uses it (see comment above).
      trigger: Platform.OS === 'android' ? { type: 'channel', channelId: channelId(type) } : null,
    });
    return id;
  } catch (e) {
    console.warn('[Notifications] send failed', e.message);
    return null;
  }
}

// Dismiss a specific identified notification (e.g. replace a progress ticker with a final summary).
export async function dismissNotification(identifier) {
  if (!identifier) return;
  try {
    await Notifications.dismissNotificationAsync(identifier);
  } catch {}
}

// Cancel a specific notification by ID
export async function cancelNotification(notificationId) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}

// Cancel all scheduled notifications
export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

// Clear all displayed notifications from the tray
export async function clearAllDisplayed() {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {}
}

// Get all pending (scheduled) notifications
export async function getScheduledNotifications() {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return [];
  }
}

/** Check if background task registration is available and whether a task is registered. */
export async function getBackgroundTaskInfo(taskName) {
  if (!TaskManagerModule) return { available: false, registered: false };
  try {
    const isRegistered = await TaskManagerModule.isTaskRegisteredAsync(taskName);
    return { available: true, registered: isRegistered };
  } catch {
    return { available: false, registered: false };
  }
}
