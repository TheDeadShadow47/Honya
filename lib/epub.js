// Pure JS so this can be unit-tested under node. The archive stays on disk untouched: import reads
// only metadata/spine/TOC/cover, and chapter text is extracted one spine item at a time on open so
// nothing proportional to the whole book is stored in SQLite.

import { unzipSync, strFromU8 } from 'fflate';
import { Parser, parseDocument } from 'htmlparser2';

export class EpubError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'EpubError';
    /** 'not_zip' | 'no_container' | 'no_opf' | 'empty_spine' | 'drm' | 'unreadable' */
    this.code = code;
  }
}

const MAX_TEXT_ENTRY_BYTES = 40 * 1024 * 1024; // a single XHTML/XML entry larger than this is treated as hostile
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const XHTML_TYPES = new Set(['application/xhtml+xml', 'text/html', 'application/x-dtbook+xml', 'text/x-oeb1-document']);
const FONT_OBFUSCATION = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);
const RTL_LANGS = /^(ar|he|fa|ur|ps|sd|ug|yi|dv)(-|$)/i;

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

export function resolveZipPath(baseDir, href) {
  const clean = String(href ?? '').split('#')[0].split('?')[0];
  const raw = clean.startsWith('/') ? clean.slice(1) : baseDir ? `${baseDir}/${clean}` : clean;
  const out = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

const fragmentOf = (href) => {
  const i = String(href ?? '').indexOf('#');
  return i >= 0 ? safeDecode(href.slice(i + 1)) : null;
};

/** Reads one entry (matching exactly, percent-decoded, or case-insensitively) without inflating anything else. */
function readEntry(bytes, path, maxBytes = MAX_TEXT_ENTRY_BYTES) {
  const wanted = new Set([path, safeDecode(path)]);
  const lowered = new Set([...wanted].map((p) => p.toLowerCase()));
  let match = null;
  let files;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (match) return false;
        const hit = wanted.has(f.name) || lowered.has(f.name.toLowerCase());
        if (hit && f.originalSize <= maxBytes) {
          match = f.name;
          return true;
        }
        return false;
      },
    });
  } catch (e) {
    throw new EpubError('not_zip', e?.message);
  }
  return match ? files[match] : null;
}

const local = (n) => String(n?.name ?? '').toLowerCase().replace(/^.*:/, '');
const isTag = (n) => n && (n.type === 'tag' || n.type === 'script' || n.type === 'style');

function findAll(root, pred, out = []) {
  for (const c of root?.children ?? []) {
    if (!isTag(c)) continue;
    if (pred(c)) out.push(c);
    findAll(c, pred, out);
  }
  return out;
}

const childTags = (node, name) => (node?.children ?? []).filter((c) => isTag(c) && (!name || local(c) === name));

function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.data ?? '';
  let s = '';
  for (const c of node.children ?? []) s += textOf(c);
  return s;
}

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const attr = (node, name) => {
  const a = node?.attribs ?? {};
  if (name in a) return a[name];
  const key = Object.keys(a).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? a[key] : undefined;
};

const BLOCK_PARA = new Set([
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'blockquote', 'ul', 'ol', 'dl',
  'table', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'hr', 'address', 'body', 'caption',
]);
const BLOCK_LINE = new Set(['li', 'dt', 'dd', 'tr']);
const SKIP = new Set(['script', 'style', 'head', 'svg', 'math', 'noscript', 'template', 'audio', 'video', 'iframe', 'object', 'canvas']);

// Paragraphs are separated by a blank line, matching the online reader. Anchors carry text offsets
// so TOC entries pointing into the middle of a section can be honoured.
export function htmlToText(html) {
  let out = '';
  let pendingBreak = 0;
  let pendingSpace = false;
  let skip = 0;
  let pre = 0;
  const lists = [];
  const pendingIds = [];
  const anchors = {};

  const flushIds = () => {
    for (const id of pendingIds) if (!(id in anchors)) anchors[id] = out.length;
    pendingIds.length = 0;
  };
  const emit = (s) => {
    if (out.length > 0) {
      if (pendingBreak) out += '\n'.repeat(Math.min(pendingBreak, 2));
      else if (pendingSpace) out += ' ';
    }
    pendingBreak = 0;
    pendingSpace = false;
    flushIds();
    out += s;
  };
  const breakBefore = (n) => {
    pendingBreak = Math.max(pendingBreak, n);
    pendingSpace = false;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (SKIP.has(name)) {
          skip += 1;
          return;
        }
        if (skip) return;
        if (attribs.id) pendingIds.push(attribs.id);
        if (attribs.name && name === 'a') pendingIds.push(attribs.name);
        if (name === 'br') {
          breakBefore(Math.min(pendingBreak + 1, 2));
        } else if (BLOCK_PARA.has(name)) {
          breakBefore(2);
          if (name === 'ul' || name === 'ol') lists.push({ ordered: name === 'ol', n: 0 });
          if (name === 'pre') pre += 1;
        } else if (BLOCK_LINE.has(name)) {
          breakBefore(1);
          if (name === 'li' && lists.length) {
            const top = lists[lists.length - 1];
            top.n += 1;
            emit(top.ordered ? `${top.n}. ` : '• ');
          }
        }
      },
      ontext(data) {
        if (skip) return;
        if (pre) {
          if (data) emit(data);
          return;
        }
        const norm = data.replace(/\s+/g, ' ');
        if (!norm.trim()) {
          if (norm && out.length) pendingSpace = true;
          return;
        }
        let s = norm;
        if (s.startsWith(' ')) {
          pendingSpace = true;
          s = s.slice(1);
        }
        const trailing = s.endsWith(' ');
        if (trailing) s = s.slice(0, -1);
        emit(s);
        if (trailing) pendingSpace = true;
      },
      onclosetag(name) {
        if (SKIP.has(name)) {
          skip = Math.max(0, skip - 1);
          return;
        }
        if (skip) return;
        if (name === 'pre') pre = Math.max(0, pre - 1);
        if (name === 'ul' || name === 'ol') lists.pop();
        if (BLOCK_PARA.has(name)) breakBefore(2);
        else if (BLOCK_LINE.has(name)) breakBefore(1);
      },
    },
    { decodeEntities: true, recognizeSelfClosing: true, lowerCaseTags: true },
  );
  parser.write(String(html ?? ''));
  parser.end();
  flushIds();
  return { text: out.trim(), anchors };
}

function parseContainer(xml) {
  const doc = parseDocument(xml, { xmlMode: true });
  const roots = findAll(doc, (n) => local(n) === 'rootfile');
  const pick = roots.find((r) => /oebps-package/i.test(attr(r, 'media-type') ?? '')) ?? roots[0];
  const path = attr(pick, 'full-path');
  return path ? safeDecode(path) : null;
}

function parseOpf(xml) {
  const doc = parseDocument(xml, { xmlMode: true });
  const meta = findAll(doc, (n) => local(n) === 'metadata')[0];
  const metaTags = meta ? findAll(meta, () => true) : [];
  const first = (name) => squash(textOf(metaTags.find((n) => local(n) === name)));
  const creators = metaTags
    .filter((n) => local(n) === 'creator')
    .map((n) => squash(textOf(n)))
    .filter(Boolean);

  const manifest = new Map();
  for (const item of findAll(doc, (n) => local(n) === 'item')) {
    const id = attr(item, 'id');
    if (id) {
      manifest.set(id, {
        id,
        href: attr(item, 'href') ?? '',
        type: (attr(item, 'media-type') ?? '').toLowerCase(),
        props: (attr(item, 'properties') ?? '').split(/\s+/).filter(Boolean),
      });
    }
  }
  const spineEl = findAll(doc, (n) => local(n) === 'spine')[0];
  const spine = childTags(spineEl, 'itemref').map((r) => ({
    idref: attr(r, 'idref'),
    linear: (attr(r, 'linear') ?? 'yes').toLowerCase() !== 'no',
  }));
  const coverMeta = metaTags.find((n) => local(n) === 'meta' && (attr(n, 'name') ?? '').toLowerCase() === 'cover');

  return {
    title: first('title'),
    author: creators.join(', '),
    language: first('language'),
    description: first('description'),
    manifest,
    spine,
    spineToc: attr(spineEl, 'toc'),
    progression: (attr(spineEl, 'page-progression-direction') ?? '').toLowerCase(),
    coverId: coverMeta ? attr(coverMeta, 'content') : undefined,
  };
}

function parseNavDocument(html, navDir) {
  const doc = parseDocument(html, { recognizeSelfClosing: true });
  const navs = findAll(doc, (n) => local(n) === 'nav');
  const nav =
    navs.find((n) => /\btoc\b/i.test(attr(n, 'epub:type') ?? '') || /doc-toc/i.test(attr(n, 'role') ?? '')) ?? navs[0];
  const entries = [];
  const walkList = (ol, depth) => {
    for (const li of childTags(ol, 'li')) {
      const label = childTags(li).find((c) => ['a', 'span'].includes(local(c)));
      const title = squash(textOf(label));
      const href = label && local(label) === 'a' ? attr(label, 'href') : undefined;
      if (title) entries.push({ title, href, depth, baseDir: navDir });
      for (const sub of childTags(li, 'ol')) walkList(sub, depth + 1);
    }
  };
  if (nav) for (const ol of childTags(nav, 'ol')) walkList(ol, 0);
  return entries;
}

function parseNcx(xml, ncxDir) {
  const doc = parseDocument(xml, { xmlMode: true });
  const map = findAll(doc, (n) => local(n) === 'navmap')[0];
  const entries = [];
  const walkPoints = (parent, depth) => {
    for (const p of childTags(parent, 'navpoint')) {
      const label = childTags(p, 'navlabel')[0];
      const title = squash(textOf(label));
      const content = childTags(p, 'content')[0];
      const href = attr(content, 'src');
      if (title) entries.push({ title, href, depth, baseDir: ncxDir });
      walkPoints(p, depth + 1);
    }
  };
  if (map) walkPoints(map, 0);
  return entries;
}

const FALLBACK_COVER_SECTIONS = 3; // how many leading spine sections are searched for artwork
const MIN_FALLBACK_COVER_BYTES = 4096; // smaller images are icons, rules or ornaments, not artwork

/** Image kind from magic bytes (the manifest's media-type is often wrong or missing). */
export function sniffImage(d) {
  if (!d || d.length < 4) return null;
  if (d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return 'jpg';
  if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) return 'png';
  if (d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46 && d[3] === 0x38) return 'gif';
  if (d.length >= 12 && d[0] === 0x52 && d[1] === 0x49 && d[2] === 0x46 && d[3] === 0x46 && d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50) return 'webp';
  return null;
}

function readImage(bytes, path, minBytes = 1) {
  try {
    const data = readEntry(bytes, path, MAX_COVER_BYTES);
    const ext = data && data.length >= minBytes ? sniffImage(data) : null;
    return ext ? { bytes: data, ext } : null;
  } catch {
    return null;
  }
}

/** Fallback artwork: the first sizeable image used by the opening sections (a title page or frontispiece). */
function findFallbackCover(bytes, spinePaths) {
  for (const sectionPath of spinePaths.slice(0, FALLBACK_COVER_SECTIONS)) {
    try {
      const raw = readEntry(bytes, sectionPath);
      if (!raw) continue;
      const doc = parseDocument(strFromU8(raw), { xmlMode: false });
      const imgs = findAll(doc, (n) => local(n) === 'img' || local(n) === 'image');
      for (const n of imgs) {
        const src = attr(n, 'src') ?? attr(n, 'xlink:href') ?? attr(n, 'href');
        if (!src || /^(data|https?):/i.test(src)) continue;
        const found = readImage(bytes, resolveZipPath(dirname(sectionPath), src), MIN_FALLBACK_COVER_BYTES);
        if (found) return found;
      }
    } catch {
      // a malformed opening section just means no fallback from it
    }
  }
  return null;
}

export function parseEpub(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new EpubError('not_zip');

  const containerBytes = readEntry(bytes, 'META-INF/container.xml');
  if (!containerBytes) throw new EpubError('no_container');
  const opfPath = parseContainer(strFromU8(containerBytes));
  if (!opfPath) throw new EpubError('no_container');

  const opfBytes = readEntry(bytes, opfPath);
  if (!opfBytes) throw new EpubError('no_opf');
  const opf = parseOpf(strFromU8(opfBytes));
  const opfDir = dirname(opfPath);

  // Reject DRM-protected books up front; font obfuscation alone is harmless.
  const enc = readEntry(bytes, 'META-INF/encryption.xml', 1024 * 1024);
  if (enc) {
    const algos = [...strFromU8(enc).matchAll(/Algorithm\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
    if (algos.some((a) => !FONT_OBFUSCATION.has(a))) throw new EpubError('drm');
  }

  const spinePaths = [];
  for (const ref of opf.spine) {
    const item = opf.manifest.get(ref.idref);
    if (!item || !ref.linear) continue;
    if (item.type && !XHTML_TYPES.has(item.type)) continue;
    spinePaths.push(resolveZipPath(opfDir, item.href));
  }
  if (!spinePaths.length) throw new EpubError('empty_spine');
  if (!readEntry(bytes, spinePaths[0])) throw new EpubError('unreadable', 'first section is missing');

  // Table of contents: EPUB3 nav document first, EPUB2 NCX as the fallback.
  let rawToc = [];
  try {
    const navItem = [...opf.manifest.values()].find((m) => m.props.includes('nav'));
    if (navItem) {
      const navPath = resolveZipPath(opfDir, navItem.href);
      const navBytes = readEntry(bytes, navPath);
      if (navBytes) rawToc = parseNavDocument(strFromU8(navBytes), dirname(navPath));
    }
    if (!rawToc.length) {
      const ncxItem =
        (opf.spineToc && opf.manifest.get(opf.spineToc)) ||
        [...opf.manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
      if (ncxItem) {
        const ncxPath = resolveZipPath(opfDir, ncxItem.href);
        const ncxBytes = readEntry(bytes, ncxPath);
        if (ncxBytes) rawToc = parseNcx(strFromU8(ncxBytes), dirname(ncxPath));
      }
    }
  } catch {
    rawToc = []; // a broken TOC must never block reading
  }

  const indexOfPath = new Map();
  spinePaths.forEach((p, i) => {
    for (const key of [p, safeDecode(p), p.toLowerCase(), safeDecode(p).toLowerCase()]) {
      if (!indexOfPath.has(key)) indexOfPath.set(key, i);
    }
  });
  const toc = [];
  for (const e of rawToc) {
    if (!e.href) continue;
    const target = resolveZipPath(e.baseDir, e.href);
    const spineIndex = indexOfPath.get(target) ?? indexOfPath.get(safeDecode(target)) ?? indexOfPath.get(target.toLowerCase());
    if (spineIndex === undefined) continue;
    toc.push({ title: e.title, spineIndex, fragment: fragmentOf(e.href), depth: e.depth });
  }

  // Cover: EPUB3 `cover-image` property, EPUB2 <meta name="cover">, then a best-effort name match.
  const images = [...opf.manifest.values()].filter((m) => m.type.startsWith('image/'));
  const coverItem =
    images.find((m) => m.props.includes('cover-image')) ??
    (opf.coverId ? opf.manifest.get(opf.coverId) : undefined) ??
    images.find((m) => /cover/i.test(m.id) || /cover/i.test(m.href));
  // Embedded cover metadata wins; if it is missing or unusable, fall back to artwork from the opening pages.
  let cover = coverItem && coverItem.type.startsWith('image/') ? readImage(bytes, resolveZipPath(opfDir, coverItem.href)) : null;
  let coverSource = cover ? 'metadata' : null;
  if (!cover) {
    cover = findFallbackCover(bytes, spinePaths);
    if (cover) coverSource = 'fallback';
  }

  return {
    title: opf.title || null,
    author: opf.author || null,
    language: opf.language || null,
    description: opf.description || null,
    rtl: opf.progression === 'rtl' || RTL_LANGS.test(opf.language || ''),
    spine: spinePaths,
    toc,
    cover,
    coverSource,
  };
}

export function readEpubChapter(bytes, path) {
  const data = readEntry(bytes, path);
  if (!data) throw new EpubError('unreadable', `missing section ${path}`);
  return htmlToText(strFromU8(data));
}
