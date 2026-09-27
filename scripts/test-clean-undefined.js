import assert from 'node:assert/strict';
import { stripStrayUndefined, sanitizeChapter } from '../lib/clean.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

// The two real-world examples reported from "Renegade Immortal" (source: AllNovel).
check('strips undefined glued to the following word', () => {
  const input = 'In less than a day, this person went from rank 5 to rank 8... This... undefinedDevil Master Nine Heavens gasped and was startled.';
  const expected = 'In less than a day, this person went from rank 5 to rank 8... This... Devil Master Nine Heavens gasped and was startled.';
  assert.equal(stripStrayUndefined(input), expected);
});

check('strips undefined glued between punctuation and the following word', () => {
  const input = '"Who is this person?!" undefinedThere was killing intent and dread in his eyes.';
  const expected = '"Who is this person?!" There was killing intent and dread in his eyes.';
  assert.equal(stripStrayUndefined(input), expected);
});

// A legitimately-written, normally-spaced "undefined" must survive untouched — this is
// the exact hazard a blind `text.replace(/undefined/g, '')` would not protect against.
check('preserves a standalone, deliberately-written "undefined"', () => {
  const input = 'The behavior of the spell was undefined, and the sect elders argued about it for hours.';
  assert.equal(stripStrayUndefined(input), input);
});

check('preserves "undefined" as its own sentence/word with normal punctuation', () => {
  const input = 'Result: undefined. No one knew what would happen next.';
  assert.equal(stripStrayUndefined(input), input);
});

// Glued on the *preceding* side instead of (or in addition to) the following side.
check('strips undefined glued to the preceding word', () => {
  const input = 'He clenched his fistundefined and said nothing.';
  const expected = 'He clenched his fist and said nothing.';
  assert.equal(stripStrayUndefined(input), expected);
});

// A doubled artifact (two concatenation bugs in a row) should be fully removed, not just
// the first occurrence.
check('strips back-to-back doubled undefined artifacts', () => {
  const input = 'Silenceundefinedundefinedfilled the room.';
  const expected = 'Silencefilled the room.';
  assert.equal(stripStrayUndefined(input), expected);
});

// Empty/nullish input should never throw.
check('handles empty and nullish input safely', () => {
  assert.equal(stripStrayUndefined(''), '');
  assert.equal(stripStrayUndefined(undefined), '');
  assert.equal(stripStrayUndefined(null), '');
});

// End-to-end through the real pipeline (HTML path), so this also guards against a future
// refactor of sanitizeChapter silently dropping the stray-undefined pass.
check('sanitizeChapter removes the artifact from real plugin-shaped HTML input', () => {
  const html = '<p>In less than a day, this person went from rank 5 to rank 8... This... undefinedDevil Master Nine Heavens gasped and was startled.</p>';
  const out = sanitizeChapter(html, { title: 'Chapter 1' });
  assert.ok(!/undefined/.test(out), `expected no "undefined" left in: ${out}`);
  assert.ok(out.includes('Devil Master Nine Heavens'), `expected surrounding prose to survive: ${out}`);
});

console.log(`\n${passed} passed`);
