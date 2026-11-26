import * as SQLite from 'expo-sqlite';

let dbPromise;
let queue = Promise.resolve();

/** Expo-sqlite can run overlapping ops without a busy timeout, so serialize all DB calls to avoid SQLITE_BUSY. */
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
      CREATE TABLE IF NOT EXISTS downloads (
        chapterId TEXT PRIMARY KEY NOT NULL,
        novelId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        queuePos INTEGER,
        error TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
      -- Local EPUB/PDF documents. Each has a row in novels (kind = 'epub' | 'pdf') so it shows up in the
      -- library, plus a row here with the file location, reading position and (EPUB) spine/toc.
      CREATE TABLE IF NOT EXISTS documents (
        novelId TEXT PRIMARY KEY NOT NULL,
        format TEXT NOT NULL,
        filePath TEXT NOT NULL,
        fileName TEXT,
        fileSize INTEGER,
        pageCount INTEGER,
        toc TEXT,
        spine TEXT,
        rtl INTEGER DEFAULT 0,
        position TEXT,
        progress REAL DEFAULT 0,
        lastReadAt INTEGER,
        importedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        novelId TEXT NOT NULL,
        chapter INTEGER,
        page INTEGER,
        ratio REAL,
        label TEXT,
        createdAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_bookmarks_novel ON bookmarks(novelId);
    `);
    await migrate(db);
    return db;
  });
}

async function migrate(db) {
  const cols = await db.getAllAsync('PRAGMA table_info(chapters)');
  const has = (name) => cols.some((c) => c.name === name);
  if (!has('lastReadAt')) {
    await db.execAsync('ALTER TABLE chapters ADD COLUMN lastReadAt INTEGER');
    await db.execAsync('UPDATE chapters SET lastReadAt = updatedAt WHERE read = 1 AND lastReadAt IS NULL');
  }
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_chapters_last_read ON chapters(lastReadAt DESC);',
  );
  // 'novel' (online, plugin-backed — every pre-existing row) | 'epub' | 'pdf' (local documents).
  const novelCols = await db.getAllAsync('PRAGMA table_info(novels)');
  if (!novelCols.some((c) => c.name === 'kind')) {
    await db.execAsync("ALTER TABLE novels ADD COLUMN kind TEXT DEFAULT 'novel'");
  }
}


export function upsertNovel(novel) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO novels (id, pluginId, path, title, author, cover, status, summary, genres, inLibrary, addedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, author=excluded.author, cover=excluded.cover,
         status=excluded.status, summary=excluded.summary, genres=excluded.genres`,
         // NOTE: inLibrary is intentionally NOT overwritten on conflict, so browse/search upserts don't drop library members.
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
    await db.runAsync('DELETE FROM downloads WHERE novelId = ?', [novelId]);
    await db.runAsync('DELETE FROM documents WHERE novelId = ?', [novelId]);
    await db.runAsync('DELETE FROM bookmarks WHERE novelId = ?', [novelId]);
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
         (SELECT COUNT(*) FROM chapters c WHERE c.novelId = n.id AND c.read = 1) AS readChapters,
         d.progress AS docProgress
       FROM novels n LEFT JOIN documents d ON d.novelId = n.id
       WHERE n.inLibrary = 1 ORDER BY n.title COLLATE NOCASE`,
    );
    return rows.map((r) => {
      const n = mapNovel(r);
      const total = r.totalChapters || 0;
      const read = r.readChapters || 0;
      return { ...n, totalChapters: total, readChapters: read, unread: Math.max(total - read, 0) };
    });
  });
}

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

/** Lightweight list fetch: excludes the downloadedText body and exposes a `downloaded` flag; use getChaptersFull when text is needed. */
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

/** Full fetch including downloadedText, for the reader and migrations only. */
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

export function touchChapterRead(chapterId, at = Date.now()) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET lastReadAt = ? WHERE id = ?', [at, chapterId]);
  });
}

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

export function removeHistoryEntry(chapterId) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE chapters SET lastReadAt = NULL WHERE id = ?', [chapterId]);
  });
}

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

/** Inserts migrated chapters; `state` maps index -> { read, progress, downloadedText, updatedAt }. */
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

export function getPlugin(id) {
  return serialize(async () => {
    const db = await getDb();
    return db.getFirstAsync('SELECT * FROM plugins WHERE id = ?', [id]);
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
    // Otherwise the Downloads screen would keep listing these as Completed after the content was wiped.
    await db.runAsync('DELETE FROM downloads WHERE status = ?', ['completed']);
  });
}

export function getDownloadQueue() {
  return serialize(async () => {
    const db = await getDb();
    return db.getAllAsync(
      `SELECT d.chapterId, d.novelId, d.status, d.queuePos, d.error, d.createdAt, d.updatedAt,
              c.name AS chapterName, c.number AS chapterNumber,
              n.title AS novelTitle, n.cover AS novelCover
         FROM downloads d
         JOIN chapters c ON c.id = d.chapterId
         JOIN novels n ON n.id = d.novelId
        ORDER BY d.queuePos ASC, d.createdAt ASC`,
    );
  });
}

export function upsertDownloadQueueItems(items) {
  if (!items?.length) return Promise.resolve();
  return serialize(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const it of items) {
        await db.runAsync(
          `INSERT INTO downloads (chapterId, novelId, status, queuePos, error, createdAt, updatedAt)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(chapterId) DO UPDATE SET
             status=excluded.status, queuePos=excluded.queuePos, error=excluded.error, updatedAt=excluded.updatedAt`,
          [
            it.chapterId,
            it.novelId,
            it.status,
            it.queuePos ?? null,
            it.error ?? null,
            it.createdAt ?? Date.now(),
            it.updatedAt ?? Date.now(),
          ],
        );
      }
    });
  });
}

export function removeDownloadQueueItems(chapterIds) {
  const ids = (chapterIds ?? []).filter(Boolean);
  if (!ids.length) return Promise.resolve();
  return serialize(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const id of ids) {
        await db.runAsync('DELETE FROM downloads WHERE chapterId = ?', [id]);
      }
    });
  });
}

/** Backup snapshot: library novels plus any with read/history state. downloadedText is intentionally excluded. */
export function getBackupSnapshot() {
  return serialize(async () => {
    const db = await getDb();
    const novels = await db.getAllAsync(
      `SELECT DISTINCT n.* FROM novels n
         LEFT JOIN chapters c ON c.novelId = n.id
        WHERE COALESCE(n.kind, 'novel') = 'novel'
          AND (n.inLibrary = 1 OR c.read = 1 OR c.lastReadAt IS NOT NULL)`,
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

/** Restores a backup atomically; unlike upsertNovel, inLibrary is overwritten and downloadedText is never written. */
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


const parseJson = (raw, fallback) => {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

function mapDocument(row) {
  if (!row) return null;
  return {
    ...row,
    rtl: !!row.rtl,
    toc: parseJson(row.toc, []),
    spine: parseJson(row.spine, []),
    position: parseJson(row.position, null),
  };
}

/** Creates the library entry and the document row together; the file must already be in place. */
export function insertDocument({ novel, doc }) {
  return serialize(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO novels (id, pluginId, path, title, author, cover, status, summary, genres, inLibrary, addedAt, kind)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET inLibrary = 1`,
        [
          novel.id,
          null,
          null,
          novel.title ?? 'Untitled',
          novel.author ?? null,
          novel.cover ?? null,
          null,
          novel.summary ?? null,
          '[]',
          1,
          Date.now(),
          doc.format,
        ],
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO documents
           (novelId, format, filePath, fileName, fileSize, pageCount, toc, spine, rtl, position, progress, lastReadAt, importedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          novel.id,
          doc.format,
          doc.filePath,
          doc.fileName ?? null,
          doc.fileSize ?? null,
          doc.pageCount ?? null,
          doc.toc ? JSON.stringify(doc.toc) : null,
          doc.spine ? JSON.stringify(doc.spine) : null,
          doc.rtl ? 1 : 0,
          null,
          0,
          null,
          Date.now(),
        ],
      );
    });
  });
}

export function getDocument(novelId) {
  return serialize(async () => {
    const db = await getDb();
    return mapDocument(await db.getFirstAsync('SELECT * FROM documents WHERE novelId = ?', [novelId]));
  });
}

/** Stores where the reader is (`position` is format-specific JSON) and the 0..1 overall progress. */
export function saveDocumentPosition(novelId, position, progress) {
  const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE documents SET position = ?, progress = ?, lastReadAt = ? WHERE novelId = ?', [
      JSON.stringify(position ?? null),
      clamped,
      Date.now(),
      novelId,
    ]);
  });
}

/** Stores a (re)generated cover for a local document; only local documents are touched. */
export function setDocumentCover(novelId, cover) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync("UPDATE novels SET cover = ? WHERE id = ? AND COALESCE(kind, 'novel') != 'novel'", [cover ?? null, novelId]);
  });
}

export function updateDocumentMeta(novelId, { pageCount }) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('UPDATE documents SET pageCount = ? WHERE novelId = ?', [pageCount ?? null, novelId]);
  });
}

export function getBookmarks(novelId) {
  return serialize(async () => {
    const db = await getDb();
    return db.getAllAsync('SELECT * FROM bookmarks WHERE novelId = ? ORDER BY COALESCE(chapter, 0), COALESCE(page, 0), ratio', [
      novelId,
    ]);
  });
}

export function addBookmark(novelId, { chapter = null, page = null, ratio = null, label = null }) {
  return serialize(async () => {
    const db = await getDb();
    const res = await db.runAsync(
      'INSERT INTO bookmarks (novelId, chapter, page, ratio, label, createdAt) VALUES (?,?,?,?,?,?)',
      [novelId, chapter, page, ratio, label, Date.now()],
    );
    return res.lastInsertRowId;
  });
}

export function removeBookmark(id) {
  return serialize(async () => {
    const db = await getDb();
    await db.runAsync('DELETE FROM bookmarks WHERE id = ?', [id]);
  });
}
