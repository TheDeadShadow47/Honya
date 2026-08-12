export const normalizeChapterName = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Pure helper used by migration. For each target chapter index it tries to find
 * the source chapter whose normalized name matches, and maps preserved state
 * (read, progress, downloadedText, updatedAt, lastReadAt) across.
 */
export function matchChapterState(sourceChapters, targetChapters) {
  const byName = new Map();
  for (const sc of sourceChapters) {
    const key = normalizeChapterName(sc.name);
    if (key && !byName.has(key)) byName.set(key, sc);
  }
  const out = new Map();
  (targetChapters || []).forEach((tc, i) => {
    const sc = byName.get(normalizeChapterName(tc.name));
    if (sc) {
      out.set(i, {
        read: !!sc.read,
        progress: sc.progress ?? (sc.read ? 1 : 0),
        downloadedText: sc.downloadedText ?? null,
        updatedAt: sc.updatedAt ?? null,
        lastReadAt: sc.lastReadAt ?? null,
      });
    }
  });
  return out;
}
