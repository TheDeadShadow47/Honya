// Files are copied into <documentDirectory>/documents/<id>/ so they keep working offline and after
// the original is moved. Only relative paths are stored; they are resolved against the current
// documentDirectory at read time.

import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as db from '../db/database';
import { base64ToBytes, bytesToBase64, bytesToLatin1 } from './base64';
import { parseEpub, readEpubChapter, EpubError } from './epub';
import { hasPdfHeader, extractPdfInfo } from './pdfInfo';
import { coverFileExists, ensurePdfCover, renderFirstPage } from './covers';

export const MAX_EPUB_BYTES = 120 * 1024 * 1024; // the whole archive is held in memory while an EPUB is open
const PDF_SCAN_BYTES = 64 * 1024; // head + tail window scanned for the Info dictionary

export class ImportError extends Error {
  /** 'unsupported' | 'empty' | 'too_large' | 'invalid_pdf' | 'invalid_epub' | 'drm' | 'storage' */
  constructor(code, message) {
    super(message || code);
    this.name = 'ImportError';
    this.code = code;
  }
}

const root = () => `${FileSystem.documentDirectory}documents/`;
export const resolveDocUri = (relative) => `${FileSystem.documentDirectory}${relative}`;

const extOf = (name) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(name ?? '');
  return m ? m[1].toLowerCase() : '';
};
const stripExt = (name) => String(name ?? '').replace(/\.[A-Za-z0-9]+$/, '').replace(/[_]+/g, ' ').trim();
const newId = () => `local:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const safeDirName = (id) => id.replace(/[^A-Za-z0-9]/g, '_');

/** Formats the picker may report for an EPUB/PDF; the extension and file contents are checked after. */
export const PICKER_TYPES = ['application/epub+zip', 'application/pdf', 'application/octet-stream'];

async function readBase64(uri, position, length) {
  const opts = { encoding: FileSystem.EncodingType.Base64 };
  if (position != null) opts.position = position;
  if (length != null) opts.length = length;
  return FileSystem.readAsStringAsync(uri, opts);
}

function detectFormat(name, headBytes) {
  const ext = extOf(name);
  const head = bytesToLatin1(headBytes.subarray(0, 1024));
  if (head.includes('%PDF-')) return 'pdf';
  if (headBytes[0] === 0x50 && headBytes[1] === 0x4b) return 'epub'; // zip magic; validated by the parser
  if (ext === 'pdf') return 'invalid_pdf';
  if (ext === 'epub') return 'invalid_epub';
  return null;
}

async function prepareEpub(uri, size) {
  if (size > MAX_EPUB_BYTES) throw new ImportError('too_large');
  const bytes = base64ToBytes(await readBase64(uri));
  try {
    return { bytes, book: parseEpub(bytes) };
  } catch (e) {
    if (e instanceof EpubError) throw new ImportError(e.code === 'drm' ? 'drm' : 'invalid_epub', e.message);
    throw new ImportError('invalid_epub', e?.message);
  }
}

async function preparePdf(uri, size) {
  const headLen = Math.min(PDF_SCAN_BYTES, size);
  const head = bytesToLatin1(base64ToBytes(await readBase64(uri, 0, headLen)));
  if (!hasPdfHeader(head)) throw new ImportError('invalid_pdf');
  let tail = '';
  if (size > PDF_SCAN_BYTES) {
    const from = Math.max(size - PDF_SCAN_BYTES, headLen);
    tail = bytesToLatin1(base64ToBytes(await readBase64(uri, from, size - from)));
  }
  return extractPdfInfo(`${head}\n${tail}`);
}

/**
 * Imports one picked file. Resolves to the new library entry id, or throws `ImportError`.
 * Nothing is written to the database or left on disk when validation fails.
 */
export async function importDocument(asset) {
  const name = asset?.name ?? 'document';
  const src = asset?.uri;
  if (!src) throw new ImportError('unsupported');
  let info;
  try {
    info = await FileSystem.getInfoAsync(src, { size: true });
  } catch {
    throw new ImportError('storage');
  }
  const size = Number(info?.size ?? asset?.size ?? 0);
  if (!info?.exists || size <= 0) throw new ImportError('empty');

  const head = base64ToBytes(await readBase64(src, 0, Math.min(1024, size)));
  const format = detectFormat(name, head);
  if (!format) throw new ImportError('unsupported');
  if (format === 'invalid_pdf' || format === 'invalid_epub') throw new ImportError(format);

  let epub = null;
  let pdfMeta = {};
  if (format === 'epub') epub = await prepareEpub(src, size);
  else pdfMeta = await preparePdf(src, size);

  const id = newId();
  const dirRel = `documents/${safeDirName(id)}/`;
  const dir = resolveDocUri(dirRel);
  const fileRel = `${dirRel}book.${format}`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.copyAsync({ from: src, to: resolveDocUri(fileRel) });

    let coverUri = null;
    if (epub?.book.cover) {
      try {
        coverUri = `${dir}cover.${epub.book.cover.ext}`;
        await FileSystem.writeAsStringAsync(coverUri, bytesToBase64(epub.book.cover.bytes), {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        coverUri = null; // a cover that can't be saved must not fail the import
      }
    }

    if (!coverUri && format === 'pdf') {
      // Never fails the import: a PDF that cannot be rendered (or a build without the native module) just has no cover.
      coverUri = await ensurePdfCover({ pdfUri: resolveDocUri(fileRel), dirUri: dir, fs: FileSystem, render: renderFirstPage });
    }

    const title = (epub?.book.title || pdfMeta.title || stripExt(name) || 'Untitled').slice(0, 300);
    await db.insertDocument({
      novel: {
        id,
        title,
        author: epub?.book.author || pdfMeta.author || null,
        cover: coverUri,
        summary: epub?.book.description || null,
      },
      doc: {
        format,
        filePath: fileRel,
        fileName: name,
        fileSize: size,
        pageCount: epub ? epub.book.spine.length : null,
        toc: epub ? epub.book.toc : null,
        spine: epub ? epub.book.spine : null,
        rtl: epub ? epub.book.rtl : false,
      },
    });
    if (epub) setEpubCache(fileRel, epub.bytes);
    return id;
  } catch (e) {
    await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
    if (e instanceof ImportError) throw e;
    throw new ImportError('storage', e?.message);
  }
}

/**
 * Backfills / repairs the cover of an already-imported PDF (imported before covers existed, or whose
 * cover file is gone). Cheap no-op when a cover file is present. Returns the cover URI if one is set.
 */
export async function ensureDocumentCover(novel, doc) {
  if (!novel || doc?.format !== 'pdf') return novel?.cover ?? null;
  if (await coverFileExists(novel.cover, FileSystem)) return novel.cover;
  const dir = `${root()}${safeDirName(novel.id)}/`;
  const uri = await ensurePdfCover({ pdfUri: resolveDocUri(doc.filePath), dirUri: dir, fs: FileSystem, render: renderFirstPage });
  if (uri) await db.setDocumentCover(novel.id, uri).catch(() => {});
  return uri;
}

/** Opens the system file picker and imports every selected file; reports per-file results. */
export async function pickAndImport() {
  const res = await DocumentPicker.getDocumentAsync({
    type: PICKER_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return { imported: [], failed: [], canceled: true };
  const imported = [];
  const failed = [];
  for (const asset of res.assets) {
    try {
      imported.push({ id: await importDocument(asset), name: asset.name });
    } catch (e) {
      failed.push({ name: asset.name, code: e instanceof ImportError ? e.code : 'storage' });
    }
    FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {}); // picker cache copy
  }
  return { imported, failed, canceled: false };
}

/** Deletes a document's files. The database rows are removed by `db.deleteNovel`. */
export async function deleteDocumentFiles(doc) {
  if (!doc?.filePath) return;
  const dir = resolveDocUri(doc.filePath.replace(/[^/]+$/, ''));
  clearEpubCache();
  await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
}

let cache = null; // { path, bytes }
export function setEpubCache(path, bytes) {
  cache = { path, bytes };
}
export function clearEpubCache() {
  cache = null;
}

export async function loadEpubBytes(doc) {
  if (cache?.path === doc.filePath) return cache.bytes;
  const uri = resolveDocUri(doc.filePath);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new ImportError('storage', 'The file is missing from app storage.');
  const bytes = base64ToBytes(await readBase64(uri));
  setEpubCache(doc.filePath, bytes);
  return bytes;
}

export async function loadEpubSection(doc, spineIndex) {
  const bytes = await loadEpubBytes(doc);
  const path = doc.spine[spineIndex];
  if (path == null) throw new EpubError('unreadable', 'No such section');
  return readEpubChapter(bytes, path);
}
