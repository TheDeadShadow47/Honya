import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Linking, Platform } from 'react-native';

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

// Stable identifiers so an "ongoing" notification is updated in place
// (same Android notification id) instead of spamming a new one every tick.
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

// Map notification types to Android channels
const CHANNEL_MAP = {
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

// Fine-grained preference key per type. Checked in addition to the category
// master toggle (notificationsUpdates / notificationsDownloads). A type with
// no entry here is gated by the category toggle alone.
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

// Android notification channels
const CHANNELS = [
  { id: 'general', name: 'General', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'updates', name: 'Honya Updates', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'downloads', name: 'Honya Downloads', importance: Notifications.AndroidImportance.LOW },
];

// Foreground notification handler — show banner when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Resolve notification type to Android channel ID
function channelId(type) {
  return CHANNEL_MAP[type] || 'general';
}

// Initialize notification channels on Android
async function ensureChannels() {
  if (_channelsCreated) return;
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
  if (action && action !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
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
  const { status } = await Notifications.getPermissionsAsync();
  return status; // 'granted' | 'denied' | 'undetermined'
}

/**
 * Same check, but also reports whether the OS will still let us show the
 * native permission dialog. Once a user has denied it, Android (and iOS)
 * stop presenting requestPermissionsAsync() and it resolves 'denied' again
 * with no dialog shown at all — the only way back at that point is the
 * system app-settings screen. `canAskAgain` lets callers tell those two
 * cases apart instead of firing a dialog request that silently no-ops.
 */
export async function getPermissionInfo() {
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
  // expo-notifications 0.32 dropped the standalone
  // Notifications.removeNotificationSubscription(sub) helper — subscriptions
  // now remove themselves via sub.remove(). Calling the old (removed) API
  // here would throw instead of actually detaching the listeners, which is
  // exactly the kind of duplicate-listener/leak risk this pass is meant to
  // catch.
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
  const category = CHANNEL_MAP[type] === 'downloads' ? 'downloads' : CHANNEL_MAP[type] === 'updates' ? 'updates' : 'general';
  if (!isNotificationEnabled(category, prefs)) return false;
  const fineKey = FINE_PREF_MAP[type];
  if (fineKey && prefs[fineKey] === false) return false;
  return true;
}

// Send a notification — checks permissions and preferences before posting.
// Pass `identifier` to post/update an "ongoing" notification in place (same
// Android notification id gets replaced rather than stacking a new one).
export async function sendNotification({ type = NOTIF_TYPE.GENERAL, title, body, data, identifier, actions }) {
  if (!title) return null;

  const status = await getPermissionStatus();
  if (status !== 'granted') return null;

  const prefs = _getPrefs ? _getPrefs() : null;
  if (prefs && !isTypeEnabled(type, prefs)) return null;

  await ensureChannels();

  try {
    const notificationContent = {
      title,
      body: body || undefined,
      data: { type, ...data },
      ...(Platform.OS === 'android' ? { channelId: channelId(type) } : {}),
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
      trigger: null,
    });
    return id;
  } catch (e) {
    console.warn('[Notifications] send failed', e.message);
    return null;
  }
}

// Dismiss a specific ongoing/identified notification from the tray (used
// once a progress ticker is replaced by a final complete/failed summary,
// or when a queue/update is cancelled).
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
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(taskName);
    return { available: true, registered: isRegistered };
  } catch {
    return { available: false, registered: false };
  }
}
