// Cover generation flow (lib/covers.js) with an in-memory file system and a fake renderer.
// Run with: node scripts/test-covers.js
import assert from 'node:assert/strict';
import { ensurePdfCover, coverFileExists, COVER_FILE } from '../lib/covers.js';

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

function memFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    getInfoAsync: async (u) => ({ exists: files.has(u), size: files.get(u) ?? 0 }),
    copyAsync: async ({ from, to }) => {
      if (!files.has(from)) throw new Error('missing source');
      files.set(to, files.get(from));
    },
    deleteAsync: async (u) => void files.delete(u),
  };
}
const DIR = 'file:///data/documents/local_1/';
const DEST = `${DIR}${COVER_FILE}`;

await check('generates the first-page cover into persistent storage and removes the cache copy', async () => {
  const fs = memFs({ 'file:///cache/thumb.jpg': 5000 });
  let calls = 0;
  const uri = await ensurePdfCover({ pdfUri: 'file:///data/documents/local_1/book.pdf', dirUri: DIR, fs, render: async () => (calls++, { uri: 'file:///cache/thumb.jpg' }) });
  assert.equal(uri, DEST);
  assert.equal(fs.files.get(DEST), 5000);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fs.files.has('file:///cache/thumb.jpg'), false);
  assert.equal(calls, 1);
});

await check('an existing cover is reused: the renderer is not called again', async () => {
  const fs = memFs({ [DEST]: 1234 });
  let calls = 0;
  const uri = await ensurePdfCover({ pdfUri: 'x', dirUri: DIR, fs, render: async () => (calls++, { uri: 'y' }) });
  assert.equal(uri, DEST);
  assert.equal(calls, 0);
});

await check('an empty leftover cover file is regenerated', async () => {
  const fs = memFs({ [DEST]: 0, 'file:///cache/t.jpg': 900 });
  const uri = await ensurePdfCover({ pdfUri: 'x', dirUri: DIR, fs, render: async () => ({ uri: 'file:///cache/t.jpg' }) });
  assert.equal(uri, DEST);
  assert.equal(fs.files.get(DEST), 900);
});

await check('renderer failure (corrupt PDF, password, missing native module) resolves to null, never throws', async () => {
  const fs = memFs();
  assert.equal(await ensurePdfCover({ pdfUri: 'x', dirUri: DIR, fs, render: async () => { throw new Error('INVALID_FILE'); } }), null);
  assert.equal(await ensurePdfCover({ pdfUri: 'x', dirUri: DIR, fs, render: () => { throw new Error('not linked'); } }), null);
  assert.equal(await ensurePdfCover({ pdfUri: 'x', dirUri: DIR, fs, render: async () => ({}) }), null);
  assert.equal(fs.files.size, 0);
});

await check('a failed copy leaves no half-written cover behind', async () => {
  const fs = memFs();
  assert.equal(await ensurePdfCover({ pdfUri: 'x', dirUri: DIR, fs, render: async () => ({ uri: 'file:///cache/gone.jpg' }) }), null);
  assert.equal(fs.files.has(DEST), false);
});

await check('a zero-byte result is rejected', async () => {
  const fs = memFs({ 'file:///cache/z.jpg': 0 });
  assert.equal(await ensurePdfCover({ pdfUri: 'x', dirUri: DIR, fs, render: async () => ({ uri: 'file:///cache/z.jpg' }) }), null);
});

await check('coverFileExists reports missing, empty and present files', async () => {
  const fs = memFs({ a: 10, b: 0 });
  assert.equal(await coverFileExists('a', fs), true);
  assert.equal(await coverFileExists('b', fs), false);
  assert.equal(await coverFileExists('c', fs), false);
  assert.equal(await coverFileExists(null, fs), false);
});

console.log(`\n${passed} passed`);
