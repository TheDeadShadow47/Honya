// Regression checks for the paged reader's pagination logic (lib/paginate.js).
// The real line measurements come from React Native's onTextLayout on a device; here they are
// simulated so the grouping, offset mapping and progress math can be verified under node.
//
// Run with: node scripts/test-paginate.js

import assert from 'node:assert/strict';
import { lineOffsets, paginate, pageForOffset, pageForRatio, ratioForPage } from '../lib/paginate.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const LINE_H = 30;

/** Simulates a text layout: wraps each paragraph at `cols` characters; hard breaks keep their "\n". */
function layout(text, cols, { keepNewline = true } = {}) {
  const lines = [];
  let y = 0;
  const paragraphs = text.split('\n');
  paragraphs.forEach((p, pi) => {
    const isLastPara = pi === paragraphs.length - 1;
    const nl = isLastPara ? '' : '\n';
    if (p.length === 0) {
      lines.push({ text: keepNewline ? nl : '', y, height: LINE_H });
      y += LINE_H;
      return;
    }
    for (let i = 0; i < p.length; i += cols) {
      const chunk = p.slice(i, i + cols);
      const last = i + cols >= p.length;
      lines.push({ text: chunk + (last && keepNewline ? nl : ''), y, height: LINE_H });
      y += LINE_H;
    }
  });
  return lines;
}

const sample = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ` + 'word '.repeat(12)).join('\n\n');

check('empty text yields a single empty page', () => {
  assert.deepEqual(paginate('', [], 300), [{ start: 0, end: 0 }]);
});

check('pages are contiguous and cover the entire text', () => {
  const pages = paginate(sample, layout(sample, 30), 300);
  assert.ok(pages.length > 3);
  assert.equal(pages[0].start, 0);
  assert.equal(pages[pages.length - 1].end, sample.length);
  for (let i = 0; i < pages.length - 1; i += 1) assert.equal(pages[i].end, pages[i + 1].start);
});

check('no page holds more lines than fit the viewport', () => {
  const lines = layout(sample, 30);
  const pages = paginate(sample, lines, 300); // 10 lines per page
  const offs = lineOffsets(sample, lines);
  for (const p of pages) {
    const inPage = offs.filter((o) => o.start >= p.start && o.start < p.end && !o.blank);
    assert.ok(inPage.length <= 10, `page has ${inPage.length} lines`);
  }
});

check('a taller viewport produces fewer pages (adapts to the reading area)', () => {
  const lines = layout(sample, 30);
  const small = paginate(sample, lines, 240).length;
  const large = paginate(sample, lines, 600).length;
  assert.ok(large < small, `${large} should be < ${small}`);
});

check('narrower columns (larger text) produce more pages', () => {
  const wide = paginate(sample, layout(sample, 40), 300).length;
  const narrow = paginate(sample, layout(sample, 20), 300).length;
  assert.ok(narrow > wide);
});

check('pages never start with a leftover blank line', () => {
  const pages = paginate(sample, layout(sample, 30), 300);
  for (const p of pages.slice(1)) {
    assert.ok(sample[p.start] !== '\n', `page starting at ${p.start} opens with a newline`);
  }
});

check('platforms that trim trailing newlines from line text still map correctly', () => {
  const lines = layout(sample, 30, { keepNewline: false });
  const pages = paginate(sample, lines, 300);
  assert.equal(pages[pages.length - 1].end, sample.length);
  assert.ok(pages.length > 3);
  for (let i = 0; i < pages.length - 1; i += 1) assert.equal(pages[i].end, pages[i + 1].start);
});

check('no characters are lost between pages', () => {
  const pages = paginate(sample, layout(sample, 30), 300);
  const rebuilt = pages.map((p) => sample.slice(p.start, p.end)).join('');
  assert.equal(rebuilt, sample);
});

check('missing measurements fall back to a single page', () => {
  assert.deepEqual(paginate('hello', [], 300), [{ start: 0, end: 5 }]);
  assert.deepEqual(paginate('hello', layout('hello', 30), 0), [{ start: 0, end: 5 }]);
});

check('pageForOffset finds the containing page', () => {
  const pages = paginate(sample, layout(sample, 30), 300);
  assert.equal(pageForOffset(pages, 0), 0);
  assert.equal(pageForOffset(pages, sample.length - 1), pages.length - 1);
  const mid = pages[2];
  assert.equal(pageForOffset(pages, mid.start), 2);
  assert.equal(pageForOffset(pages, mid.end - 1), 2);
});

check('progress survives re-pagination at a different font size', () => {
  const before = paginate(sample, layout(sample, 30), 300);
  const readingPage = 5;
  const anchor = before[readingPage].start;
  const after = paginate(sample, layout(sample, 20), 300);
  const restored = pageForOffset(after, anchor);
  assert.ok(after[restored].start <= anchor && anchor < after[restored].end);
});

check('ratio <-> page mapping is consistent and the last page reports 1', () => {
  const pages = paginate(sample, layout(sample, 30), 300);
  assert.equal(ratioForPage(pages, sample.length, 0), 0);
  assert.equal(ratioForPage(pages, sample.length, pages.length - 1), 1);
  const i = 4;
  const r = ratioForPage(pages, sample.length, i);
  assert.equal(pageForRatio(pages, sample.length, r), i);
  assert.equal(pageForRatio(pages, sample.length, 1), pages.length - 1);
  assert.equal(pageForRatio(pages, sample.length, 0), 0);
});

check('RTL text paginates the same way (direction only affects display order)', () => {
  const ar = Array.from({ length: 30 }, () => 'هذا نص تجريبي طويل للتحقق من التقسيم').join('\n');
  const pages = paginate(ar, layout(ar, 20), 240);
  assert.ok(pages.length > 1);
  assert.equal(pages.map((p) => ar.slice(p.start, p.end)).join(''), ar);
});

console.log(`\n${passed} passed`);
