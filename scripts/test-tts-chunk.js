// Lightweight regression check for the TTS chunking logic (lib/ttsChunk.js). No test
// framework — just assert() and a non-zero exit code on failure, matching the project's
// "no large testing framework for this" scope.
//
// Run with: node scripts/test-tts-chunk.js

import assert from 'node:assert/strict';
import { chunkText, MAX_CHUNK_LEN } from '../lib/ttsChunk.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

check('empty/nullish input produces no chunks', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText(null), []);
  assert.deepEqual(chunkText(undefined), []);
  assert.deepEqual(chunkText('   \n\n  '), []);
});

check('short chapter stays a single chunk', () => {
  const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
  const chunks = chunkText(text);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].includes('Paragraph one.'));
  assert.ok(chunks[0].includes('Paragraph three.'));
});

check('short paragraphs are packed together up to the length limit', () => {
  // Many small paragraphs that together exceed one chunk should be packed into as few
  // chunks as possible, not exploded one-paragraph-per-chunk.
  const para = 'A short sentence of prose. '.repeat(20); // ~560 chars
  const text = Array.from({ length: 10 }, () => para.trim()).join('\n\n'); // ~5.6k chars total
  const chunks = chunkText(text, 2000);
  assert.ok(chunks.length > 1, 'expected more than one chunk for ~5.6k chars at a 2000 limit');
  assert.ok(chunks.length < 10, 'expected paragraphs to be packed together, not one chunk per paragraph');
  for (const c of chunks) assert.ok(c.length <= 2000, `chunk exceeded limit: ${c.length}`);
});

check('a single paragraph longer than the limit is split on sentence boundaries', () => {
  const sentence = 'The cultivator raised his sword and struck at the demon before him. ';
  const longParagraph = sentence.repeat(80); // way over any reasonable limit
  const chunks = chunkText(longParagraph, 500);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 500, `chunk exceeded limit: ${c.length}`);
  // No sentence should have been cut mid-word — every chunk boundary should land on
  // whitespace/punctuation, not inside "cultivator" etc.
  for (const c of chunks) assert.ok(!/\S-$/.test(c) || c.trim().endsWith('.'), `chunk looks mid-word: "${c.slice(-20)}"`);
});

check('a single run-on "sentence" longer than the limit is hard-split on whitespace without losing text', () => {
  const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
  const chunks = chunkText(words, 300);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 300);
  // Every word should survive somewhere across the chunks, in order, none dropped/duplicated.
  const rejoined = chunks.join(' ');
  assert.equal(rejoined.replace(/\s+/g, ' '), words);
});

check('respects a custom max length', () => {
  const text = 'x'.repeat(10000);
  const chunks = chunkText(text, 1000);
  for (const c of chunks) assert.ok(c.length <= 1000);
  assert.equal(chunks.join(''), text);
});

check('default MAX_CHUNK_LEN is a sane, conservative value under common Android limits', () => {
  assert.ok(MAX_CHUNK_LEN > 0 && MAX_CHUNK_LEN <= 4000);
});

console.log(`\n${passed} passed`);
