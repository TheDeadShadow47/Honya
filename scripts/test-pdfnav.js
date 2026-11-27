// Page-event guard and navigation helpers for the PDF reader (lib/pdfNav.js).
// Run with: node scripts/test-pdfnav.js
import assert from 'node:assert/strict';
import { clampPage, createPageGuard, nextScale } from '../lib/pdfNav.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

check('without a jump every page event is forwarded (ordinary scrolling is never filtered)', () => {
  const g = createPageGuard();
  for (let p = 1; p <= 50; p += 1) assert.equal(g.accept(p, p * 10), true);
});

check('a stale event arriving after a jump is dropped; the confirming event passes', () => {
  const g = createPageGuard(450);
  g.jumped(40, 1000);
  assert.equal(g.accept(3, 1010), false); // late echo of the old position
  assert.equal(g.accept(40, 1030), true); // confirmation
  assert.equal(g.accept(41, 1100), true); // scrolling continues normally
  assert.equal(g.accept(3, 1110), true);
});

check('the filter expires, so a missing confirmation cannot freeze progress', () => {
  const g = createPageGuard(450);
  g.jumped(10, 0);
  assert.equal(g.accept(2, 100), false);
  assert.equal(g.accept(11, 600), true);
  assert.equal(g.accept(12, 610), true);
});

check('a second jump replaces the first', () => {
  const g = createPageGuard();
  g.jumped(10, 0);
  g.jumped(20, 50);
  assert.equal(g.accept(10, 60), false);
  assert.equal(g.accept(20, 70), true);
});

check('clampPage keeps navigation inside the document and rejects non-numbers', () => {
  assert.equal(clampPage(0, 10), 1);
  assert.equal(clampPage(99, 10), 10);
  assert.equal(clampPage('7', 10), 7);
  assert.equal(clampPage(3.9, 10), 3);
  assert.equal(clampPage(5, 0), 5);
  assert.equal(clampPage(NaN, 10), null);
  assert.equal(clampPage(undefined, 10), null);
});

check('explicit zoom starts from the real (pinched) scale and stays within limits', () => {
  assert.equal(nextScale(1, 0.5, 1, 5), 1.5);
  assert.equal(nextScale(2.37, 0.5, 1, 5), 2.9); // pinched to 2.37, then zoom in
  assert.equal(nextScale(1, -0.5, 1, 5), 1);
  assert.equal(nextScale(4.9, 0.5, 1, 5), 5);
});

console.log(`\n${passed} passed`);
