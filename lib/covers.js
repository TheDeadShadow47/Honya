// The file system and thumbnail renderer are injected so cover handling is unit-testable under node.
// Cover failures are always non-fatal: they never fail an import or a read.

export const COVER_FILE = 'cover.jpg';
export const COVER_MAX_WIDTH = 540; // library cards are far smaller; keeps the stored JPEG light
export const COVER_QUALITY = 82;

const usable = (info) => !!info && info.exists && (info.size == null || info.size > 0);

/**
 * Ensures `<dirUri>cover.jpg` holds a thumbnail of the PDF's first page and returns its URI, or null.
 * An existing non-empty file is reused (never regenerated). Any failure resolves to null.
 * @param {{ pdfUri: string, dirUri: string, fs: object, render: (uri: string) => Promise<{uri: string}> }} o
 */
export async function ensurePdfCover({ pdfUri, dirUri, fs, render }) {
  const dest = `${dirUri}${COVER_FILE}`;
  try {
    if (usable(await fs.getInfoAsync(dest))) return dest;
    const out = await render(pdfUri);
    if (!out?.uri) return null;
    await fs.copyAsync({ from: out.uri, to: dest });
    fs.deleteAsync(out.uri, { idempotent: true }).catch(() => {}); // the renderer writes to the cache dir
    return usable(await fs.getInfoAsync(dest)) ? dest : null;
  } catch {
    try {
      await fs.deleteAsync(dest, { idempotent: true }); // never leave a half-written cover behind
    } catch {}
    return null;
  }
}

export async function coverFileExists(uri, fs) {
  if (!uri) return false;
  try {
    return usable(await fs.getInfoAsync(uri));
  } catch {
    return false;
  }
}

/** First-page JPEG via the native renderer (PdfRenderer / PDFKit). Throws if the native module is not in this build. */
export async function renderFirstPage(pdfUri) {
  // Required lazily so a build without the native module (Expo Go, an old dev client) still imports fine.
  const PdfThumbnail = require('react-native-pdf-thumbnail').default;
  return PdfThumbnail.generate(pdfUri, 0, { quality: COVER_QUALITY, maxWidth: COVER_MAX_WIDTH });
}
