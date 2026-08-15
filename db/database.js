import * as SQLite from 'expo-sqlite';

let dbPromise;
let queue = Promise.resolve();

/**
 * expo-sqlite dispatches async operations onto a multi-threaded IO executor
 * (Dispatchers.IO on Android) and never sets a busy timeout. When two calls
 * overlap, the losing write aborts with `database is locked` (SQLITE_BUSY) —
 * which surfaces as a rejected `NativeStatement.finalizeAsync` because
 * sqlite3_finalize() returns the last failed step() result code.
 *
 * Every database function in this module runs through this queue so no two
 * operations on the single connection ever overlap, including entire
 * `withTransactionAsync` bodies (which the library otherwise treats as
 * non-exclusive).
 */
function serialize(task) {
  const result = queue.then(task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function getDb() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('shosetsu.db');
  return dbPromise;
}

export function initDatabase() {
  return serialize(async () => {
    const db = await getDb();
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY NOT NULL,
        pluginId TEXT,
        path TEXT,
        title TEXT NOT NULL,
        author TEXT,
        cover TEXT,
        status TEXT,
        summary TEXT,
        genres TEXT,
        inLibrary INTEGER DEFAULT 0,
        addedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY NOT NULL,
        novelId TEXT NOT NULL,
        path TEXT,
        name TEXT,
        releaseTime TEXT,
        number INTEGER,
        read INTEGER DEFAULT 0,
        progress REAL DEFAULT 0,
        downloadedText TEXT,
        updatedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        version TEXT,
        lang TEXT,
        iconUrl TEXT,
        site TEXT,
        repoUrl TEXT,
        code TEXT NOT NULL,
        installedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_chapters_novel ON chapters(novelId);
    `);
    await migrate(db);
    return db;
  });
}

/**
 * Additive migrations. Each step is guarded so it is safe to run on every boot
 * and on databases created by any previous version of the app. Existing rows,
 * schema and data are never rewritten.
 */
async function migrate(db) {
  const cols = await db.getAllAsync('PRAGMA table_info(chapters)');
  const has = (name) => cols.some((c) => c.name === name);
  // Reading history: `lastReadAt` on chapters powers the History screen's recency order.
  if (!has('lastReadAt')) {
    await db.execAsync('ALTER TABLE chapters ADD COLUMN lastReadAt INTEGER');
    // Backfill so existing read chapters still show up in History.
    await db.execAsync('UPDATE chapters SET lastReadAt = updatedAt WHERE read = 1 AND lastReadAt IS NULL');
  }
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_chapters_last_read ON chapters(lastReadAt DESC);',
  );
}


/* ---------- novels ---------- */
export function upsertNovel(novel) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO novels (id, pluginId, path, title, author, cover, status, summary, genres, inLibrary, addedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, author=excluded.author, cover=excluded.cover,
         status=excluded.status, summary=excluded.summary, genres=excluded.genres`,
         // NOTE: inLibrary is intentionally NOT updated on conflict, or browse/search upserts
         // would silently drop novels the user already added; a fresh INSERT still honours the caller's value.
      [
        novel.id,
        novel.pluginId ?? null,
        novel.path ?? null,
        novel.title ?? 'Untitled',
        novel.author ?? null,
        novel.cover ?? null,
        novel.status ?? null,
        novel.summary ?? null,
        JSON.stringify(novel.genres ?? []),
        novel.inLibrary ? 1 : 0,
        novel.addedAt ?? Date.now(),
      ],
    );
  });
}

export function setInLibrary(novelId, inLibrary) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE novels SET inLibrary = ? WHERE id = ?', [inLibrary ? 1 : 0, novelId]);
  });
}

export function deleteNovel(novelId) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('DELETE FROM chapters WHERE novelId = ?', [novelId]);
    await db.runAsync('DELETE FROM novels WHERE id = ?', [novelId]);
  });
}

function mapNovel(row) {
  if (!row) return null;
  let genres = [];
  try {
    genres = JSON.parse(row.genres || '[]');
  } catch {}
  return { ...row, genres, inLibrary: !!row.inLibrary };
}

export function getNovel(novelId) {
  return serialize(async () => {
    const db = await getDb();
    return mapNovel(await db.getFirstAsync('SELECT * FROM novels WHERE id = ?', [novelId]));
  });
}

export function getLibrary() {
  return serialize(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync(
      `SELECT n.*,
         (SELECT COUNT(*) FROM chapters c WHERE c.novelId = n.id) AS totalChapters,
         (SELECT COUNT(*) FROM chapters c WHERE c.novelId = n.id AND c.read = 1) AS readChapters
       FROM novels n WHERE n.inLibrary = 1 ORDER BY n.title COLLATE NOCASE`,
    );
    return rows.map((r) => {
      const n = mapNovel(r);
      const total = r.totalChapters || 0;
      const read = r.readChapters || 0;
      return { ...n, totalChapters: total, readChapters: read, unread: Math.max(total - read, 0) };
    });
  });
}

/* ---------- chapters ---------- */
export function replaceChapters(novelId, chapters) {
  return serialize(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < chapters.length; i += 1) {
        const c = chapters[i];
        const id = c.id ?? `${novelId}::${c.path ?? i}`;
        await db.runAsync(
          `INSERT INTO chapters (id, novelId, path, name, releaseTime, number, updatedAt)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, releaseTime=excluded.releaseTime, number=excluded.number`,
          [id, novelId, c.path ?? null, c.name ?? `Chapter ${i + 1}`, c.releaseTime ?? null, i + 1, Date.now()],
        );
      }
    });
  });
}

/**
 * Lightweight chapter fetch for UI lists.  Excludes the downloadedText column
 * (which can hold hundreds of KB per downloaded chapter) and replaces it with
 * a cheap boolean `downloaded` flag.  This is the primary source of truth for
 * the novel-details chapter list and selection — it must NOT be used where the
 * actual text body is needed (e.g. the reader).
 */
export function getChapters(novelId) {
  return serialize(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync(
      `SELECT id, novelId, path, name, releaseTime, number, read, progress,
              lastReadAt, updatedAt,
              downloadedText IS NOT NULL AS downloaded
         FROM chapters WHERE novelId = ? ORDER BY number ASC`,
      [novelId],
    );
    return rows.map((r) => ({ ...r, read: !!r.read, downloaded: !!r.downloaded }));
  });
}

/**
 * Full chapter fetch including the downloadedText body.  Used by migration
 * (which must transfer download state between sources) and the reader.  Avoid
 * in UI lists — prefer getChapters for performance.
 */
export function getChaptersFull(novelId) {
  return serialize(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM chapters WHERE novelId = ? ORDER BY number ASC', [novelId]);
    return rows.map((r) => ({ ...r, read: !!r.read }));
  });
}

export function getChapter(chapterId) {
  return serialize(async () => {
    const db = await getDb();
    const row = await db.getFirstAsync('SELECT * FROM chapters WHERE id = ?', [chapterId]);
    return row ? { ...row, read: !!row.read } : null;
  });
}

export function getAdjacentChapters(novelId, number) {
  return serialize(async () => {
    const db = await getDb();
    const prev = await db.getFirstAsync(
      'SELECT * FROM chapters WHERE novelId = ? AND number < ? ORDER BY number DESC LIMIT 1',
      [novelId, number],
    );
    const next = await db.getFirstAsync(
      'SELECT * FROM chapters WHERE novelId = ? AND number > ? ORDER BY number ASC LIMIT 1',
      [novelId, number],
    );
    return { prev: prev ?? null, next: next ?? null };
  });
}

export function markChapterRead(chapterId, read = true) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync(
      'UPDATE chapters SET read = ?, progress = ?, lastReadAt = CASE WHEN ? THEN ? ELSE lastReadAt END WHERE id = ?',
      [read ? 1 : 0, read ? 1 : 0, read ? 1 : 0, Date.now(), chapterId],
    );
  });
}

/**
 * Batch variant of markChapterRead used by chapter multi-select. Same columns,
 * same semantics - one transaction instead of N round trips.
 */
export function markChaptersRead(chapterIds, read = true) {
  const ids = Array.from(new Set((chapterIds ?? []).filter(Boolean)));
  if (!ids.length) return Promise.resolve();
  return serialize(async () => {
    const db = await getDb();
    const now = Date.now();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < ids.length; i += 1) {
        await db.runAsync(
          'UPDATE chapters SET read = ?, progress = ?, lastReadAt = CASE WHEN ? THEN ? ELSE lastReadAt END WHERE id = ?',
          [read ? 1 : 0, read ? 1 : 0, read ? 1 : 0, now, ids[i]],
        );
      }
    });
  });
}

/**
 * Records that a chapter was opened in the reader. This is the only write the
 * History screen relies on - reading state itself still lives on the chapters
 * row, so there is no separate history store.
 */
export function touchChapterRead(chapterId, at = Date.now()) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET lastReadAt = ? WHERE id = ?', [at, chapterId]);
  });
}

/** Persists scroll progress (0..1) for the currently open chapter. */
export function saveChapterProgress(chapterId, progress) {
  const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET progress = MAX(progress, ?), lastReadAt = ? WHERE id = ?', [
      clamped,
      Date.now(),
      chapterId,
    ]);
  });
}

/** Recently opened chapters, newest first. Reads the existing chapters table. */
export function getHistory(limit = 200) {
  return serialize(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync(
      `SELECT c.id, c.novelId, c.name, c.number, c.read, c.progress, c.lastReadAt,
              c.downloadedText IS NOT NULL AS downloaded,
              n.title AS novelTitle, n.cover AS novelCover
         FROM chapters c JOIN novels n ON n.id = c.novelId
        WHERE c.lastReadAt IS NOT NULL
        ORDER BY c.lastReadAt DESC
        LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({ ...r, read: !!r.read, downloaded: !!r.downloaded }));
  });
}

/** Removes a single entry from History without touching read state or downloads. */
export function removeHistoryEntry(chapterId) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET lastReadAt = NULL WHERE id = ?', [chapterId]);
  });
}

/** Clears History only. Read/unread, downloads and progress are preserved. */
export function clearHistory() {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET lastReadAt = NULL');
  });
}


export function saveChapterText(chapterId, text) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET downloadedText = ? WHERE id = ?', [text, chapterId]);
  });
}

export function deleteChapterText(chapterId) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET downloadedText = NULL WHERE id = ?', [chapterId]);
  });
}

/**
 * Inserts chapters created by a migration. `state` is a Map of
 * target index -> { read, progress, downloadedText, updatedAt } produced by
 * matchChapterState, so user progress and downloads survive the move.
 */
export function insertChaptersWithState(novelId, chapters, state = new Map()) {
  return serialize(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < chapters.length; i += 1) {
        const c = chapters[i];
        const st = state.get(i) ?? {};
        await db.runAsync(
          `INSERT INTO chapters (id, novelId, path, name, releaseTime, number, read, progress, downloadedText, updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             name=excluded.name, releaseTime=excluded.releaseTime, number=excluded.number,
             read=excluded.read, progress=excluded.progress,
             downloadedText=excluded.downloadedText, updatedAt=excluded.updatedAt`,
          [
            c.id,
            novelId,
            c.path ?? null,
            c.name ?? `Chapter ${i + 1}`,
            c.releaseTime ?? null,
            i + 1,
            st.read ? 1 : 0,
            st.progress ?? 0,
            st.downloadedText ?? null,
            st.updatedAt ?? Date.now(),
            st.lastReadAt ?? null,
          ],
        );
      }
    });
  });
}

export function getRecentUpdates(limit = 100) {
  return serialize(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync(
      `SELECT c.id, c.novelId, c.path, c.name, c.releaseTime, c.number, c.read,
              c.progress, c.lastReadAt, c.updatedAt,
              c.downloadedText IS NOT NULL AS downloaded,
              n.title AS novelTitle, n.cover AS novelCover
         FROM chapters c JOIN novels n ON n.id = c.novelId
        WHERE n.inLibrary = 1
        ORDER BY c.updatedAt DESC, c.number DESC
        LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({ ...r, read: !!r.read, downloaded: !!r.downloaded }));
  });
}

/* ---------- plugins ---------- */
export function savePlugin(plugin) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO plugins (id, name, version, lang, iconUrl, site, repoUrl, code, installedAt)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, version=excluded.version,
         lang=excluded.lang, iconUrl=excluded.iconUrl, site=excluded.site,
         repoUrl=excluded.repoUrl, code=excluded.code, installedAt=excluded.installedAt`,
      [
        plugin.id,
        plugin.name ?? plugin.id,
        plugin.version ?? '0.0.0',
        plugin.lang ?? 'unknown',
        plugin.iconUrl ?? null,
        plugin.site ?? null,
        plugin.repoUrl ?? null,
        plugin.code,
        Date.now(),
      ],
    );
  });
}

export function getPlugins() {
  return serialize(async () => {
    const db = await getDb();
    return db.getAllAsync('SELECT * FROM plugins ORDER BY name COLLATE NOCASE');
  });
}

export function deletePlugin(id) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('DELETE FROM plugins WHERE id = ?', [id]);
  });
}

export function getStorageStats() {
  return serialize(async () => {
    const db = await getDb();
    const novels = await db.getFirstAsync('SELECT COUNT(*) AS c FROM novels');
    const chapters = await db.getFirstAsync('SELECT COUNT(*) AS c FROM chapters');
    const downloaded = await db.getFirstAsync(
      'SELECT COUNT(*) AS c FROM chapters WHERE downloadedText IS NOT NULL',
    );
    const plugins = await db.getFirstAsync('SELECT COUNT(*) AS c FROM plugins');
    return {
      novels: novels?.c ?? 0,
      chapters: chapters?.c ?? 0,
      downloaded: downloaded?.c ?? 0,
      plugins: plugins?.c ?? 0,
    };
  });
}

export function clearDownloads() {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET downloadedText = NULL');
  });
}

/* ---------- backup / restore ---------- */

/**
 * Snapshot used to build a backup. Includes every novel that is either in the
 * library or has any read/history state (so history survives even for a
 * novel the user later removed from the library), each with lightweight
 * per-chapter state. downloadedText is never selected here - downloads are
 * regenerable and intentionally excluded from backups.
 */
export function getBackupSnapshot() {
  return serialize(async () => {
    const db = await getDb();
    const novels = await db.getAllAsync(
      `SELECT DISTINCT n.* FROM novels n
         LEFT JOIN chapters c ON c.novelId = n.id
        WHERE n.inLibrary = 1 OR c.read = 1 OR c.lastReadAt IS NOT NULL`,
    );
    const out = [];
    for (const row of novels) {
      const novel = mapNovel(row);
      const chapters = await db.getAllAsync(
        `SELECT id, path, name, releaseTime, number, read, progress, lastReadAt, updatedAt
           FROM chapters WHERE novelId = ? ORDER BY number ASC`,
        [novel.id],
      );
      out.push({ ...novel, chapters: chapters.map((c) => ({ ...c, read: !!c.read })) });
    }
    return out;
  });
}

/** Installed-extension metadata only, no `code`. Kept in backups for reference only. */
export function getExtensionsMeta() {
  return serialize(async () => {
    const db = await getDb();
    return db.getAllAsync(
      'SELECT id, name, version, lang, iconUrl, site, repoUrl, installedAt FROM plugins ORDER BY name COLLATE NOCASE',
    );
  });
}

/**
 * Restores a full backup snapshot in one transaction, so a restore either
 * fully applies or fully rolls back - no partial state. Novels and chapters
 * are upserted by their stable id, so restoring twice (or restoring into a
 * library that already has some of the data) never creates duplicates.
 *
 * Unlike upsertNovel, inLibrary IS overwritten here - restoring is explicitly
 * meant to reinstate library membership. downloadedText is never written, so
 * every restored chapter comes back as not-downloaded.
 */
export function restoreLibrarySnapshot(novels) {
  return serialize(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const novel of novels) {
        await db.runAsync(
          `INSERT INTO novels (id, pluginId, path, title, author, cover, status, summary, genres, inLibrary, addedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             pluginId=excluded.pluginId, path=excluded.path, title=excluded.title, author=excluded.author,
             cover=excluded.cover, status=excluded.status, summary=excluded.summary, genres=excluded.genres,
             inLibrary=excluded.inLibrary`,
          [
            novel.id,
            novel.pluginId ?? null,
            novel.path ?? null,
            novel.title ?? 'Untitled',
            novel.author ?? null,
            novel.cover ?? null,
            novel.status ?? null,
            novel.summary ?? null,
            JSON.stringify(novel.genres ?? []),
            novel.inLibrary ? 1 : 0,
            novel.addedAt ?? Date.now(),
          ],
        );
        const chapters = Array.isArray(novel.chapters) ? novel.chapters : [];
        for (let i = 0; i < chapters.length; i += 1) {
          const c = chapters[i];
          if (!c?.id) continue;
          await db.runAsync(
            `INSERT INTO chapters (id, novelId, path, name, releaseTime, number, read, progress, lastReadAt, updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET
               path=excluded.path, name=excluded.name, releaseTime=excluded.releaseTime, number=excluded.number,
               read=excluded.read, progress=excluded.progress, lastReadAt=excluded.lastReadAt, updatedAt=excluded.updatedAt`,
            [
              c.id,
              novel.id,
              c.path ?? null,
              c.name ?? `Chapter ${i + 1}`,
              c.releaseTime ?? null,
              c.number ?? i + 1,
              c.read ? 1 : 0,
              Number(c.progress) || 0,
              c.lastReadAt ?? null,
              c.updatedAt ?? Date.now(),
            ],
          );
        }
      }
    });
  });
}
