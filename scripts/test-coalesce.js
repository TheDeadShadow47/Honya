// Preference write coalescing and list-identity reuse (lib/coalesce.js).
// Run with: node scripts/test-coalesce.js
import assert from 'node:assert/strict';
import { createCoalescedWriter, reuseRows } from '../lib/coalesce.js';

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await check('a burst of saves performs one write with the latest value', async () => {
  const writes = [];
  const w = createCoalescedWriter(async (v) => void writes.push(v), 30);
  for (let i = 1; i <= 50; i += 1) w.save({ fontSize: i });
  assert.equal(writes.length, 0, 'nothing written while the value is still changing');
  await wait(80);
  assert.deepEqual(writes, [{ fontSize: 50 }]);
});

await check('flush writes at once (app going to background) and does not write twice', async () => {
  const writes = [];
  const w = createCoalescedWriter(async (v) => void writes.push(v), 1000);
  w.save('a');
  w.save('b');
  await w.flush();
  assert.deepEqual(writes, ['b']);
  await w.flush();
  await wait(20);
  assert.deepEqual(writes, ['b']);
});

await check('cancel drops the pending value so a newer writer is never overwritten', async () => {
  const writes = [];
  const w = createCoalescedWriter(async (v) => void writes.push(v), 20);
  w.save('stale');
  w.cancel();
  await wait(60);
  await w.flush();
  assert.deepEqual(writes, []);
});

await check('a failing write is swallowed and later saves still work', async () => {
  let calls = 0;
  const w = createCoalescedWriter(async () => {
    calls += 1;
    if (calls === 1) throw new Error('disk full');
  }, 10);
  w.save(1);
  await wait(40);
  w.save(2);
  await w.flush();
  assert.equal(calls, 2);
  const sync = createCoalescedWriter(() => {
    throw new Error('sync throw');
  }, 10);
  sync.save(1);
  await sync.flush().then(() => {}, () => assert.fail('flush must not reject'));
});

await check('reuseRows keeps unchanged objects and returns the same array when nothing changed', () => {
  const prev = [
    { id: 'a', title: 'A', genres: ['x', 'y'], unread: 1 },
    { id: 'b', title: 'B', genres: [], unread: 0 },
  ];
  const same = reuseRows(prev, prev.map((r) => ({ ...r, genres: [...r.genres] })));
  assert.equal(same, prev);
  const next = [{ ...prev[0], genres: ['x', 'y'] }, { ...prev[1], unread: 3, genres: [] }];
  const out = reuseRows(prev, next);
  assert.notEqual(out, prev);
  assert.equal(out[0], prev[0], 'unchanged row keeps its identity');
  assert.notEqual(out[1], prev[1]);
  assert.equal(out[1].unread, 3);
});

await check('reuseRows handles added, removed and reordered rows', () => {
  const a = { id: 'a', n: 1 };
  const b = { id: 'b', n: 2 };
  const prev = [a, b];
  const reordered = reuseRows(prev, [{ id: 'b', n: 2 }, { id: 'a', n: 1 }]);
  assert.deepEqual(reordered.map((r) => r.id), ['b', 'a']);
  assert.equal(reordered[0], b);
  assert.equal(reordered[1], a);
  assert.deepEqual(reuseRows(prev, [{ id: 'a', n: 1 }]).map((r) => r.id), ['a']);
  const grown = reuseRows(prev, [{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }]);
  assert.equal(grown.length, 3);
  assert.equal(grown[0], a);
  assert.deepEqual(reuseRows([], [{ id: 'z' }]), [{ id: 'z' }]);
  assert.deepEqual(reuseRows(prev, []), []);
});

console.log(`\n${passed} passed`);
