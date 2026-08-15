import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';

// Backup format: one JSON file of persistent user state; bump BACKUP_VERSION when `data`'s shape changes.
export const BACKUP_FORMAT = 'honya-backup';
export const BACKUP_VERSION = 1;

export const LAST_BACKUP_KEY = '@honya/lastBackup';

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

/* ---------- create ---------- */

// Writes the given persistent-data snapshot to a backup file in the cache directory.
export async function writeBackupToFile(data) {
  const createdAt = Date.now();
  const payload = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, appVersion: appVersion(), data };
  const json = JSON.stringify(payload);
  const name = backupFileName(createdAt);
  const file = new File(Paths.cache, name);
  if (file.exists) await file.delete();
  file.create();
  await file.write(json);
  return { uri: file.uri, name, size: file.size ?? json.length, createdAt };
}

/** Hands the backup file to the native share sheet so the user picks where it goes. */
export async function shareBackupFile(uri, name) {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new BackupError('shareUnavailable', 'Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: name });
}

/* ---------- restore ---------- */

/** Opens the native file picker. Returns a local file uri, or null if cancelled. */
export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  return result.assets?.[0]?.uri ?? null;
}

export async function readBackupFile(uri) {
  let text;
  try {
    const file = new File(uri);
    text = await file.text();
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

// Validates and sanitizes a parsed backup, dropping malformed entries; throws BackupError without touching state.
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

/* ---------- last-backup record ---------- */

export async function getLastBackupMeta() {
  try {
    const raw = await AsyncStorage.getItem(LAST_BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function recordBackupMeta(meta) {
  try {
    await AsyncStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(meta));
  } catch {
    // Non-fatal: the backup file already succeeded.
  }
  return meta;
}
