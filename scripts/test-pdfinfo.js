// Regression checks for PDF import helpers (lib/pdfInfo.js).
// Run with: node scripts/test-pdfinfo.js

import assert from 'node:assert/strict';
import { hasPdfHeader, extractPdfInfo } from '../lib/pdfInfo.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const pdf = (info, extra = '') =>
  `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n${extra}5 0 obj\n${info}\nendobj\ntrailer\n<< /Root 1 0 R /Info 5 0 R /Size 6 >>\n%%EOF`;

check('header detection accepts real PDFs and tolerates leading junk', () => {
  assert.equal(hasPdfHeader('%PDF-1.7\n...'), true);
  assert.equal(hasPdfHeader('\n\n  %PDF-1.4'), true);
  assert.equal(hasPdfHeader('PK\u0003\u0004 an epub or zip'), false);
  assert.equal(hasPdfHeader(''), false);
  assert.equal(hasPdfHeader(null), false);
});

check('reads Title and Author from the Info dictionary', () => {
  const info = extractPdfInfo(pdf('<< /Title (The Lantern Road) /Author (A. Writer) /Producer (x) >>'));
  assert.deepEqual(info, { title: 'The Lantern Road', author: 'A. Writer' });
});

check('ignores outline /Title entries that are not the Info dictionary', () => {
  const outline = '9 0 obj\n<< /Title (Chapter 1 bookmark) /Parent 8 0 R >>\nendobj\n';
  const info = extractPdfInfo(pdf('<< /Title (Real Title) >>', outline));
  assert.equal(info.title, 'Real Title');
});

check('decodes escapes, nested parentheses and octal sequences in literal strings', () => {
  const info = extractPdfInfo(pdf('<< /Title (A \\(nested\\) \\\\ title \\101) /Author (Caf\\351) >>'));
  assert.equal(info.title, 'A (nested) \\ title A');
  assert.equal(info.author, 'Café');
});

check('decodes UTF-16BE hex strings (BOM) used for non-Latin titles', () => {
  // "عنوان" as UTF-16BE with BOM
  const hex = 'FEFF' + [...'عنوان'].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  const info = extractPdfInfo(pdf(`<< /Title <${hex}> >>`));
  assert.equal(info.title, 'عنوان');
});

check('uses the last trailer when the file was incrementally updated', () => {
  const first = pdf('<< /Title (Old) >>');
  const updated = `${first}\n7 0 obj\n<< /Title (New) >>\nendobj\ntrailer\n<< /Info 7 0 R >>\n%%EOF`;
  assert.equal(extractPdfInfo(updated).title, 'New');
});

check('files without a readable Info dictionary return an empty result', () => {
  assert.deepEqual(extractPdfInfo('%PDF-1.5\nno trailer here'), {});
  assert.deepEqual(extractPdfInfo(pdf('<< /Producer (only) >>')), { title: undefined, author: undefined });
  assert.deepEqual(extractPdfInfo(''), {});
  assert.deepEqual(extractPdfInfo(undefined), {});
});

console.log(`\n${passed} passed`);
