import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';

const { StorageAccessFramework } = FileSystem;

/**
 * Honya backup format: a single JSON file { format, version, createdAt, appVersion, data } holding
 * persistent user state only (never chapter text/covers/plugin source). Bump BACKUP_VERSION and
 * extend migrateBackupPayload() when `data` changes so old backups keep restoring.
 */
export const BACKUP_FORMAT = 'honya-backup';
export const BACKUP_VERSION = 1;

const FOLDER_KEY = '@honya/backupFolderUri';

export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function appVersion() {
  return Constants.expoConfig?.version ?? '1.1.0';
}

function backupFileName(at) {
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  return `honya-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.honyabackup`;
}

/** Human readable file size for the settings screen. */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/* ---------- backup folder ---------- */

export async function getBackupFolderUri() {
  try {
    return await AsyncStorage.getItem(FOLDER_KEY);
  } catch {
    return null;
  }
}

/** Opens Android's folder picker and persists the chosen SAF directory. Returns null if cancelled. */
export async function pickBackupFolder() {
  const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!result.granted) return null;
  await AsyncStorage.setItem(FOLDER_KEY, result.directoryUri);
  return result.directoryUri;
}

export async function clearBackupFolder() {
  await AsyncStorage.removeItem(FOLDER_KEY);
}

/** Returns the configured folder, prompting the picker if none is set yet. */
async function ensureBackupFolder() {
  const existing = await getBackupFolderUri();
  if (existing) return existing;
  const picked = await pickBackupFolder();
  if (!picked) throw new BackupError('folderRequired', 'Choose a backup folder to continue.');
  return picked;
}

/* ---------- create ---------- */

/** Writes a backup file (format envelope + SAF write) into the configured folder; caller supplies `data`. */
export async function createBackupInFolder(data) {
  const folderUri = await ensureBackupFolder();
  const createdAt = Date.now();
  const payload = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, appVersion: appVersion(), data };
  const json = JSON.stringify(payload);
  const name = backupFileName(createdAt);

  let fileUri;
  try {
    fileUri = await StorageAccessFramework.createFileAsync(folderUri, name, 'application/octet-stream');
  } catch {
    throw new BackupError('writeFailed', 'Could not write to the backup folder. Choose the folder again.');
  }
  await StorageAccessFramework.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
  return { uri: fileUri, name, size: json.length, createdAt };
}

/** Hands an existing backup file to the native share sheet. Only called when the user taps Share Backup. */
export async function shareBackupFile(uri, name) {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new BackupError('shareUnavailable', 'Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: name });
}

/* ---------- discover / delete ---------- */

/** Lists valid Honya backups found in the configured folder, newest first. */
export async function listBackups() {
  const folderUri = await getBackupFolderUri();
  if (!folderUri) return [];

  let uris = [];
  try {
    uris = await StorageAccessFramework.readDirectoryAsync(folderUri);
  } catch {
    return [];
  }

  const backups = [];
  for (const uri of uris) {
    const decoded = decodeURIComponent(uri);
    if (!decoded.toLowerCase().endsWith('.honyabackup')) continue;
    try {
      const text = await StorageAccessFramework.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      const raw = JSON.parse(text);
      if (raw?.format !== BACKUP_FORMAT) continue;
      backups.push({
        uri,
        name: decoded.split('/').pop(),
        size: text.length,
        createdAt: Number(raw.createdAt) || null,
        novelCount: Array.isArray(raw?.data?.novels) ? raw.data.novels.length : null,
      });
    } catch {
      // corrupted or unreadable - skip, don't fail the whole list
    }
  }
  backups.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return backups;
}

export async function deleteBackupFile(uri) {
  try {
    await StorageAccessFramework.deleteAsync(uri);
  } catch {
    throw new BackupError('deleteFailed', 'Could not delete this backup file.');
  }
}

/* ---------- restore ---------- */

/** Opens the native file picker, for restoring a backup from outside the configured folder. */
export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  return result.assets?.[0]?.uri ?? null;
}

/** Reads a backup file directly from storage - works for both SAF folder uris and picked file uris. */
export async function readBackupFile(uri) {
  let text;
  try {
    text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    throw new BackupError('unreadable', 'This file could not be read.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BackupError('invalid', 'This is not a valid Honya backup file.');
  }
}

/** No-op placeholder for future format versions - see BACKUP_VERSION above. */
function migrateBackupPayload(raw) {
  return raw;
}

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** Validates and sanitizes a backup; throws BackupError on bad/corrupt/too-new files (malformed entries are dropped, not fatal). */
export function validateBackup(raw) {
  if (!isPlainObject(raw)) throw new BackupError('invalid', 'This is not a valid Honya backup file.');
  if (raw.format !== BACKUP_FORMAT) throw new BackupError('invalid', 'This is not a valid Honya backup file.');

  const version = Number(raw.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new BackupError('invalid', 'This backup file is corrupted.');
  }
  if (version > BACKUP_VERSION) {
    throw new BackupError('tooNew', 'This backup was created by a newer version of Honya. Update the app to restore it.');
  }

  const migrated = migrateBackupPayload(raw);
  const data = migrated.data;
  if (!isPlainObject(data)) throw new BackupError('invalid', 'This backup file is corrupted.');

  const novels = (Array.isArray(data.novels) ? data.novels : [])
    .filter((n) => isPlainObject(n) && typeof n.id === 'string' && n.id)
    .map((n) => ({
      id: n.id,
      pluginId: typeof n.pluginId === 'string' ? n.pluginId : null,
      path: typeof n.path === 'string' ? n.path : null,
      title: typeof n.title === 'string' && n.title ? n.title : 'Untitled',
      author: typeof n.author === 'string' ? n.author : null,
      cover: typeof n.cover === 'string' ? n.cover : null,
      status: typeof n.status === 'string' ? n.status : null,
      summary: typeof n.summary === 'string' ? n.summary : null,
      genres: Array.isArray(n.genres) ? n.genres : [],
      inLibrary: !!n.inLibrary,
      addedAt: Number(n.addedAt) || Date.now(),
      chapters: (Array.isArray(n.chapters) ? n.chapters : [])
        .filter((c) => isPlainObject(c) && typeof c.id === 'string' && c.id)
        .map((c) => ({
          id: c.id,
          path: typeof c.path === 'string' ? c.path : null,
          name: typeof c.name === 'string' ? c.name : null,
          releaseTime: typeof c.releaseTime === 'string' ? c.releaseTime : null,
          number: Number(c.number) || 0,
          read: !!c.read,
          progress: Number(c.progress) || 0,
          lastReadAt: Number(c.lastReadAt) || null,
          updatedAt: Number(c.updatedAt) || Date.now(),
        })),
    }));

  const repositories = (Array.isArray(data.repositories) ? data.repositories : []).filter(
    (r) => typeof r === 'string' && /^https?:\/\//i.test(r),
  );
  const extensions = (Array.isArray(data.extensions) ? data.extensions : []).filter(
    (e) => isPlainObject(e) && typeof e.id === 'string' && e.id,
  );
  const prefs = isPlainObject(data.prefs) ? data.prefs : {};
  const chapterPrefs = isPlainObject(data.chapterPrefs) ? data.chapterPrefs : {};

  const chapterCount = novels.reduce((sum, n) => sum + n.chapters.length, 0);

  return {
    novels,
    repositories,
    extensions,
    prefs,
    chapterPrefs,
    meta: {
      createdAt: Number(migrated.createdAt) || null,
      appVersion: typeof migrated.appVersion === 'string' ? migrated.appVersion : null,
      novelCount: novels.length,
      chapterCount,
      extensionCount: extensions.length,
    },
  };
}
