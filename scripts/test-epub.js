// Regression checks for EPUB parsing (lib/epub.js) and the base64 helpers (lib/base64.js).
// Builds small but structurally real EPUB archives in memory (EPUB 2 + EPUB 3 layouts, nested
// OPF directories, percent-encoded paths, DRM, corrupt inputs) and parses them under node.
//
// Run with: node scripts/test-epub.js

import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { parseEpub, readEpubChapter, htmlToText, resolveZipPath, EpubError } from '../lib/epub.js';
import { base64ToBytes, bytesToBase64 } from '../lib/base64.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};
const throwsCode = (fn, code) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof EpubError, `expected EpubError, got ${e?.constructor?.name}: ${e?.message}`);
    assert.equal(e.code, code);
    return;
  }
  assert.fail(`expected EpubError(${code})`);
};

const xhtml = (body) =>
  `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>ignored title</title><style>p{color:red}</style></head><body>${body}</body></html>`;
const container = (opf) =>
  `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${opf}" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function build(files) {
  const entries = {};
  for (const [name, content] of Object.entries(files)) entries[name] = typeof content === 'string' ? strToU8(content) : content;
  return zipSync(entries);
}

/** EPUB 3: nav document, cover-image property, OPF inside OEBPS/. */
function epub3(extra = {}) {
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>The Lantern Road</dc:title><dc:creator>A. Writer</dc:creator><dc:creator>B. Editor</dc:creator>
      <dc:language>en</dc:language><dc:description>A road, a lantern.</dc:description>
    </metadata>
    <manifest>
      <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
      <item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/>
      <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
      <item id="c3" href="text/ch3.xhtml" media-type="application/xhtml+xml"/>
      <item id="img" href="images/cover.png" media-type="image/png" properties="cover-image"/>
    </manifest>
    <spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3" linear="no"/></spine>
  </package>`;
  const nav = `<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
    <nav epub:type="landmarks"><ol><li><a href="text/ch2.xhtml">Landmark</a></li></ol></nav>
    <nav epub:type="toc"><ol>
      <li><a href="text/ch%201.xhtml">Chapter One</a></li>
      <li><a href="text/ch2.xhtml">Chapter Two</a><ol><li><a href="text/ch2.xhtml#part-b">Part B &amp; more</a></li></ol></li>
      <li><a href="text/missing.xhtml">Not in the book</a></li>
    </ol></nav></body></html>`;
  return build({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': container('OEBPS/content.opf'),
    'OEBPS/content.opf': opf,
    'OEBPS/nav.xhtml': nav,
    'OEBPS/text/ch 1.xhtml': xhtml('<h1>Chapter One</h1><p>It began on a <em>quiet</em> road.</p><p>The lantern&nbsp;swayed &amp; creaked.</p>'),
    'OEBPS/text/ch2.xhtml': xhtml('<p id="top">Second chapter opens.</p><p>Middle paragraph.</p><h2 id="part-b">Part B</h2><p>After the anchor.</p>'),
    'OEBPS/text/ch3.xhtml': xhtml('<p>Non-linear extra</p>'),
    'OEBPS/images/cover.png': PNG,
    ...extra,
  });
}

/** EPUB 2: NCX table of contents, <meta name="cover">, OPF at the archive root. */
function epub2() {
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
      <dc:title>كتاب الاختبار</dc:title><dc:creator opf:role="aut">مؤلف</dc:creator><dc:language>ar</dc:language>
      <meta name="cover" content="cov"/>
    </metadata>
    <manifest>
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="a" href="a.html" media-type="application/xhtml+xml"/>
      <item id="b" href="sub/b.html" media-type="application/xhtml+xml"/>
      <item id="cov" href="cover.jpg" media-type="image/jpeg"/>
    </manifest>
    <spine toc="ncx" page-progression-direction="rtl"><itemref idref="a"/><itemref idref="b"/></spine>
  </package>`;
  const ncx = `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
    <navPoint id="n1"><navLabel><text>الفصل الأول</text></navLabel><content src="a.html"/>
      <navPoint id="n2"><navLabel><text>مقطع</text></navLabel><content src="a.html#s2"/></navPoint></navPoint>
    <navPoint id="n3"><navLabel><text>الفصل الثاني</text></navLabel><content src="sub/b.html"/></navPoint>
  </navMap></ncx>`;
  return build({
    'META-INF/container.xml': container('content.opf'),
    'content.opf': opf,
    'toc.ncx': ncx,
    'a.html': xhtml('<p>مرحبا بالعالم</p><p id="s2">فقرة ثانية</p>'),
    'sub/b.html': xhtml('<p>نص الفصل الثاني</p>'),
    'cover.jpg': new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]),
  });
}

/* ------------------------------ metadata & structure ------------------------------ */

check('EPUB 3: metadata, spine (non-linear skipped) and cover are parsed', () => {
  const book = parseEpub(epub3());
  assert.equal(book.title, 'The Lantern Road');
  assert.equal(book.author, 'A. Writer, B. Editor');
  assert.equal(book.language, 'en');
  assert.equal(book.description, 'A road, a lantern.');
  assert.equal(book.rtl, false);
  assert.deepEqual(book.spine, ['OEBPS/text/ch%201.xhtml', 'OEBPS/text/ch2.xhtml']);
  assert.equal(book.cover.ext, 'png');
  assert.deepEqual([...book.cover.bytes], [...PNG]);
});

check('EPUB 3: table of contents uses the toc nav, nests, resolves fragments and drops dead links', () => {
  const { toc } = parseEpub(epub3());
  assert.deepEqual(toc, [
    { title: 'Chapter One', spineIndex: 0, fragment: null, depth: 0 },
    { title: 'Chapter Two', spineIndex: 1, fragment: null, depth: 0 },
    { title: 'Part B & more', spineIndex: 1, fragment: 'part-b', depth: 1 },
  ]);
});

check('EPUB 2: NCX table of contents, <meta name="cover"> and RTL detection', () => {
  const book = parseEpub(epub2());
  assert.equal(book.title, 'كتاب الاختبار');
  assert.equal(book.author, 'مؤلف');
  assert.equal(book.rtl, true);
  assert.equal(book.cover.ext, 'jpg');
  assert.deepEqual(book.spine, ['a.html', 'sub/b.html']);
  assert.deepEqual(
    book.toc.map((t) => [t.title, t.spineIndex, t.fragment, t.depth]),
    [
      ['الفصل الأول', 0, null, 0],
      ['مقطع', 0, 's2', 1],
      ['الفصل الثاني', 1, null, 0],
    ],
  );
});

check('a book without any table of contents still opens (empty toc)', () => {
  const bytes = build({
    'META-INF/container.xml': container('c.opf'),
    'c.opf': `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Bare</dc:title></metadata>
      <manifest><item id="x" href="x.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="x"/></spine></package>`,
    'x.xhtml': xhtml('<p>hello</p>'),
  });
  const book = parseEpub(bytes);
  assert.deepEqual(book.toc, []);
  assert.equal(book.cover, null);
  assert.equal(book.author, null);
});

/* ------------------------------ cover fallbacks ------------------------------ */

const bigImage = (magic) => {
  const d = new Uint8Array(6000);
  d.set(magic);
  return d;
};
const JPG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
/** An EPUB with no cover metadata; `sections` are the spine XHTML bodies, `files` extra archive entries. */
function noCoverBook(sections, files = {}, manifestExtra = '') {
  const items = sections.map((_, i) => `<item id="s${i}" href="s${i}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const refs = sections.map((_, i) => `<itemref idref="s${i}"/>`).join('');
  const entries = {
    'META-INF/container.xml': container('OEBPS/c.opf'),
    'OEBPS/c.opf': `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title></metadata><manifest>${items}${manifestExtra}</manifest><spine>${refs}</spine></package>`,
    ...files,
  };
  sections.forEach((b, i) => {
    entries[`OEBPS/s${i}.xhtml`] = xhtml(b);
  });
  return build(entries);
}

check('cover: embedded metadata takes priority over any artwork in the text', () => {
  const book = parseEpub(epub3({ 'OEBPS/text/ch 1.xhtml': xhtml('<img src="../art.jpg"/><p>x</p>'), 'OEBPS/art.jpg': bigImage(JPG_MAGIC) }));
  assert.equal(book.coverSource, 'metadata');
  assert.equal(book.cover.ext, 'png');
});

check('cover: with no metadata, the first sizeable image in the opening pages is used', () => {
  const book = parseEpub(noCoverBook(['<p>Title</p>', '<img src="img/front.jpg" alt="front"/>'], { 'OEBPS/img/front.jpg': bigImage(JPG_MAGIC) }));
  assert.equal(book.coverSource, 'fallback');
  assert.equal(book.cover.ext, 'jpg');
  assert.equal(book.cover.bytes.length, 6000);
});

check('cover: SVG-wrapped title pages (<image xlink:href>) are found', () => {
  const book = parseEpub(
    noCoverBook(['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="p.png" width="1" height="1"/></svg>'], { 'OEBPS/p.png': bigImage([0x89, 0x50, 0x4e, 0x47]) }),
  );
  assert.equal(book.coverSource, 'fallback');
  assert.equal(book.cover.ext, 'png');
});

check('cover: tiny ornaments, remote or data images and non-image files are never used', () => {
  const book = parseEpub(
    noCoverBook(['<img src="rule.png"/><img src="https://x.test/a.jpg"/><img src="data:image/png;base64,AAAA"/><img src="notimg.jpg"/>'], {
      'OEBPS/rule.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]),
      'OEBPS/notimg.jpg': new Uint8Array(6000).fill(7),
    }),
  );
  assert.equal(book.cover, null);
  assert.equal(book.coverSource, null);
});

check('cover: images beyond the opening sections are not scanned', () => {
  const book = parseEpub(noCoverBook(['<p>a</p>', '<p>b</p>', '<p>c</p>', '<img src="late.jpg"/>'], { 'OEBPS/late.jpg': bigImage(JPG_MAGIC) }));
  assert.equal(book.cover, null);
});

check('cover: broken metadata (missing file, or bytes that are not an image) falls back instead of failing', () => {
  const missing = parseEpub(
    noCoverBook(['<img src="a.jpg"/>'], { 'OEBPS/a.jpg': bigImage(JPG_MAGIC) }, '<item id="cv" href="gone.jpg" media-type="image/jpeg" properties="cover-image"/>'),
  );
  assert.equal(missing.coverSource, 'fallback');
  const garbage = parseEpub(
    noCoverBook(['<p>x</p>'], { 'OEBPS/cv.jpg': new Uint8Array(100).fill(1) }, '<item id="cv" href="cv.jpg" media-type="image/jpeg" properties="cover-image"/>'),
  );
  assert.equal(garbage.cover, null);
});

check('cover: the extension follows the real image type, not the manifest media-type', () => {
  const book = parseEpub(noCoverBook(['<p>x</p>'], { 'OEBPS/cv.jpg': bigImage([0x89, 0x50, 0x4e, 0x47]) }, '<item id="cv" href="cv.jpg" media-type="image/jpeg" properties="cover-image"/>'));
  assert.equal(book.cover.ext, 'png');
});

/* ------------------------------ chapter text ------------------------------ */

check('chapter text: paragraphs, entities, inline tags and ignored head/style', () => {
  const bytes = epub3();
  const { text } = readEpubChapter(bytes, parseEpub(bytes).spine[0]);
  assert.equal(text, 'Chapter One\n\nIt began on a quiet road.\n\nThe lantern swayed & creaked.');
  assert.ok(!text.includes('ignored title'));
  assert.ok(!text.includes('color:red'));
});

check('percent-encoded spine paths resolve to the real archive entry', () => {
  const bytes = epub3();
  assert.ok(readEpubChapter(bytes, 'OEBPS/text/ch%201.xhtml').text.startsWith('Chapter One'));
});

check('anchors record the text offset of ids so TOC fragments can be honoured', () => {
  const bytes = epub3();
  const { text, anchors } = readEpubChapter(bytes, parseEpub(bytes).spine[1]);
  assert.equal(anchors.top, 0);
  assert.equal(text.slice(anchors['part-b']), 'Part B\n\nAfter the anchor.');
});

check('htmlToText: scripts, line breaks, lists and preformatted text', () => {
  const { text } = htmlToText(
    '<body><script>alert(1)</script><p>a<br/>b</p><ul><li>one</li><li>two</li></ul><ol><li>x</li><li>y</li></ol><pre>l1\n  l2</pre><svg><text>no</text></svg></body>',
  );
  assert.equal(text, 'a\nb\n\n• one\n• two\n\n1. x\n2. y\n\nl1\n  l2');
});

check('htmlToText: image-only sections produce empty text without throwing', () => {
  assert.equal(htmlToText('<body><img src="p1.jpg"/></body>').text, '');
});

check('htmlToText: RTL text and unusual whitespace are preserved sensibly', () => {
  assert.equal(htmlToText('<p>  مرحبا   بالعالم  </p><p>\n\n  ثاني </p>').text, 'مرحبا بالعالم\n\nثاني');
});

/* ------------------------------ failure handling ------------------------------ */

check('non-zip data is rejected', () => {
  throwsCode(() => parseEpub(strToU8('this is plainly not an epub')), 'not_zip');
  throwsCode(() => parseEpub(new Uint8Array(0)), 'not_zip');
});

check('a truncated zip is rejected cleanly instead of crashing', () => {
  const good = epub3();
  throwsCode(() => parseEpub(good.subarray(0, Math.floor(good.length / 2))), 'not_zip');
});

check('a zip that is not an EPUB (no container.xml) is rejected', () => {
  throwsCode(() => parseEpub(build({ 'readme.txt': 'hi' })), 'no_container');
});

check('missing package document is reported', () => {
  throwsCode(() => parseEpub(build({ 'META-INF/container.xml': container('gone.opf') })), 'no_opf');
});

check('an empty spine is reported', () => {
  const bytes = build({
    'META-INF/container.xml': container('c.opf'),
    'c.opf': '<package xmlns="http://www.idpf.org/2007/opf"><manifest/><spine/></package>',
  });
  throwsCode(() => parseEpub(bytes), 'empty_spine');
});

check('DRM-encrypted books are rejected, font obfuscation alone is not', () => {
  const drm = epub3({
    'META-INF/encryption.xml':
      '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>',
  });
  throwsCode(() => parseEpub(drm), 'drm');
  const fonts = epub3({
    'META-INF/encryption.xml':
      '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>',
  });
  assert.equal(parseEpub(fonts).title, 'The Lantern Road');
});

check('a spine entry missing from the archive fails only that section', () => {
  const bytes = epub3();
  assert.throws(() => readEpubChapter(bytes, 'OEBPS/text/nope.xhtml'), (e) => e instanceof EpubError && e.code === 'unreadable');
});

check('resolveZipPath collapses dot segments and strips fragments', () => {
  assert.equal(resolveZipPath('OEBPS/text', '../images/a.png#x'), 'OEBPS/images/a.png');
  assert.equal(resolveZipPath('', './a/./b.xhtml'), 'a/b.xhtml');
  assert.equal(resolveZipPath('OEBPS', '/abs/c.xhtml'), 'abs/c.xhtml');
});

/* ------------------------------ base64 ------------------------------ */

check('base64 round-trips arbitrary bytes and tolerates line breaks', () => {
  for (const len of [0, 1, 2, 3, 4, 5, 100, 1021]) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 255);
    const b64 = bytesToBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString('base64'));
    assert.deepEqual([...base64ToBytes(b64)], [...bytes]);
    assert.deepEqual([...base64ToBytes(b64.replace(/(.{20})/g, '$1\n'))], [...bytes]);
  }
});

console.log(`\n${passed} passed`);
