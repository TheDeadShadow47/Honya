// Exercises the real db/database.js (schema, migration, queries) for local-document support.
// `expo-sqlite` is aliased to a node-backed shim (scripts/support). Requires Node >= 22.13.
//
// Run with: node scripts/test-documents-db.js

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

register('./support/alias-expo-sqlite.js', import.meta.url);

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

// A database created by the previous app version: no `kind` column and no document tables.
const legacy = new DatabaseSync(':memory:');
legacy.exec(`
  CREATE TABLE novels (id TEXT PRIMARY KEY NOT NULL, pluginId TEXT, path TEXT, title TEXT NOT NULL, author TEXT, cover TEXT,
    status TEXT, summary TEXT, genres TEXT, inLibrary INTEGER DEFAULT 0, addedAt INTEGER);
  CREATE TABLE chapters (id TEXT PRIMARY KEY NOT NULL, novelId TEXT NOT NULL, path TEXT, name TEXT, releaseTime TEXT, number INTEGER,
    read INTEGER DEFAULT 0, progress REAL DEFAULT 0, downloadedText TEXT, updatedAt INTEGER);
  INSERT INTO novels (id, pluginId, path, title, inLibrary, addedAt) VALUES ('online-1', 'src', '/n/1', 'Online Novel', 1, 1);
  INSERT INTO chapters (id, novelId, name, number, read, progress, updatedAt) VALUES ('online-1::c1', 'online-1', 'Ch 1', 1, 1, 1, 1);
`);
globalThis.__honyaTestDb = legacy;

const db = await import('../db/database.js');

await check('upgrading an existing database adds `kind` and keeps every online novel as kind "novel"', async () => {
  await db.initDatabase();
  const cols = legacy.prepare('PRAGMA table_info(novels)').all().map((c) => c.name);
  assert.ok(cols.includes('kind'));
  assert.equal(legacy.prepare("SELECT kind FROM novels WHERE id='online-1'").get().kind, 'novel');
  const tables = legacy.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  assert.ok(tables.includes('documents') && tables.includes('bookmarks'));
});

await check('initDatabase is idempotent (second launch does not fail or duplicate anything)', async () => {
  await db.initDatabase();
  assert.equal((await db.getLibrary()).length, 1);
});

const epubNovel = { id: 'local:abc', title: 'The Lantern Road', author: 'A. Writer', cover: 'documents/abc/cover.png', summary: 'hi' };
const epubDoc = { format: 'epub', filePath: 'documents/abc/book.epub', fileName: 'lantern.epub', fileSize: 1234, spine: ['a.xhtml', 'b.xhtml'], toc: [{ title: 'One', spineIndex: 0, fragment: null, depth: 0 }], rtl: false, pageCount: 2 };

await check('a document appears in the library next to online novels, with its kind', async () => {
  await db.insertDocument({ novel: epubNovel, doc: epubDoc });
  const lib = await db.getLibrary();
  assert.equal(lib.length, 2);
  const local = lib.find((n) => n.id === 'local:abc');
  assert.equal(local.kind, 'epub');
  assert.equal(local.inLibrary, true);
  assert.equal(local.pluginId, null);
  assert.equal(local.totalChapters, 0);
  assert.equal(local.unread, 0);
  assert.equal(local.docProgress, 0);
  const online = lib.find((n) => n.id === 'online-1');
  assert.equal(online.kind, 'novel');
  assert.equal(online.totalChapters, 1);
  assert.equal(online.docProgress, null);
});

await check('document metadata round-trips (spine, toc, position)', async () => {
  const d = await db.getDocument('local:abc');
  assert.deepEqual(d.spine, ['a.xhtml', 'b.xhtml']);
  assert.equal(d.toc[0].title, 'One');
  assert.equal(d.position, null);
  assert.equal(d.rtl, false);
  assert.equal(await db.getDocument('nope'), null);
});

await check('reading position and progress persist and show in the library', async () => {
  await db.saveDocumentPosition('local:abc', { chapter: 1, ratio: 0.5 }, 0.75);
  const d = await db.getDocument('local:abc');
  assert.deepEqual(d.position, { chapter: 1, ratio: 0.5 });
  assert.equal(d.progress, 0.75);
  assert.ok(d.lastReadAt > 0);
  assert.equal((await db.getLibrary()).find((n) => n.id === 'local:abc').docProgress, 0.75);
  await db.saveDocumentPosition('local:abc', { chapter: 0, ratio: 0 }, 5); // clamped
  assert.equal((await db.getDocument('local:abc')).progress, 1);
});

await check('re-importing the same document is harmless', async () => {
  await db.insertDocument({ novel: epubNovel, doc: epubDoc });
  assert.equal((await db.getLibrary()).filter((n) => n.id === 'local:abc').length, 1);
});

await check('PDF documents store last page and page count', async () => {
  await db.insertDocument({ novel: { id: 'local:pdf1', title: 'Manual' }, doc: { format: 'pdf', filePath: 'documents/pdf1/book.pdf', fileName: 'm.pdf', fileSize: 99 } });
  await db.updateDocumentMeta('local:pdf1', { pageCount: 120 });
  await db.saveDocumentPosition('local:pdf1', { page: 37 }, 37 / 120);
  const d = await db.getDocument('local:pdf1');
  assert.equal(d.pageCount, 120);
  assert.deepEqual(d.position, { page: 37 });
  assert.equal((await db.getLibrary()).find((n) => n.id === 'local:pdf1').kind, 'pdf');
});

await check('bookmarks: add, list in reading order, remove', async () => {
  await db.addBookmark('local:abc', { chapter: 1, ratio: 0.4, label: 'later' });
  const id = await db.addBookmark('local:abc', { chapter: 0, ratio: 0.9, label: 'earlier' });
  assert.ok(Number.isInteger(id) && id > 0);
  await db.addBookmark('local:pdf1', { page: 5 });
  const list = await db.getBookmarks('local:abc');
  assert.deepEqual(list.map((b) => b.label), ['earlier', 'later']);
  assert.equal((await db.getBookmarks('local:pdf1')).length, 1);
  await db.removeBookmark(id);
  assert.deepEqual((await db.getBookmarks('local:abc')).map((b) => b.label), ['later']);
});

await check('local documents never leak into backups, updates or history', async () => {
  const backup = await db.getBackupSnapshot();
  assert.deepEqual(backup.map((n) => n.id), ['online-1']);
  const updates = await db.getRecentUpdates();
  assert.ok(updates.every((u) => u.novelId === 'online-1'));
  assert.ok((await db.getHistory()).every((h) => h.novelId === 'online-1'));
});

await check('deleting a document removes its row, document data and bookmarks but not other books', async () => {
  await db.deleteNovel('local:abc');
  assert.equal(await db.getDocument('local:abc'), null);
  assert.equal((await db.getBookmarks('local:abc')).length, 0);
  assert.equal(await db.getNovel('local:abc'), null);
  const ids = (await db.getLibrary()).map((n) => n.id).sort();
  assert.deepEqual(ids, ['local:pdf1', 'online-1']);
  assert.equal((await db.getBookmarks('local:pdf1')).length, 1);
});

await check('existing online-novel behaviour is unchanged (chapters, read state)', async () => {
  const ch = await db.getChapter('online-1::c1');
  assert.equal(ch.read, true);
  const lib = await db.getLibrary();
  assert.equal(lib.find((n) => n.id === 'online-1').readChapters, 1);
});

console.log(`\n${passed} passed`);
