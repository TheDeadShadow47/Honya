// The caller measures the chapter with its real typography (`onTextLayout` reports each rendered
// line); these helpers group whole measured lines into pages, never cutting at arbitrary characters.

// Platforms disagree on whether a measured line keeps its trailing newline or trims whitespace, so
// lines are matched against the source text sequentially instead of concatenated blindly.
export function lineOffsets(text, lines) {
  const out = [];
  let cursor = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? {};
    const lt = typeof line.text === 'string' ? line.text : '';
    let start = cursor;
    let end = cursor;
    if (lt && text.startsWith(lt, cursor)) {
      end = cursor + lt.length;
    } else if (lt.trim()) {
      const idx = text.indexOf(lt.trim(), cursor);
      if (idx >= 0) {
        start = cursor;
        end = idx + lt.trim().length;
      }
    }
    out.push({
      start,
      end,
      y: Number(line.y) || 0,
      height: Number(line.height) || 0,
      blank: !lt.trim(),
    });
    cursor = end;
  }
  return out;
}

/** Groups measured lines into pages no taller than `pageHeight`. */
export function paginate(text, lines, pageHeight) {
  const len = text.length;
  if (!len) return [{ start: 0, end: 0 }];
  if (!Array.isArray(lines) || !lines.length || !(pageHeight > 0)) return [{ start: 0, end: len }];

  const offs = lineOffsets(text, lines);
  const groups = [];
  let first = 0;
  let top = offs[0].y;
  for (let i = 1; i < offs.length; i += 1) {
    const bottom = offs[i].y + offs[i].height;
    if (bottom - top > pageHeight + 0.5) {
      groups.push([first, i - 1]);
      first = i;
      top = offs[i].y;
    }
  }
  groups.push([first, offs.length - 1]);

  const pages = [];
  for (let g = 0; g < groups.length; g += 1) {
    let [a, b] = groups[g];
    // A page never opens with blank lines left over from a paragraph gap.
    while (a < b && g > 0 && offs[a].blank) a += 1;
    const start = g === 0 ? 0 : offs[a].start;
    const end = g === groups.length - 1 ? len : offs[groups[g + 1][0]].start;
    // A group that is only whitespace (tiny viewport edge case) would render as an empty page.
    if (pages.length && !text.slice(start, Math.max(end, start)).trim()) continue;
    pages.push({ start, end: Math.max(end, start) });
  }
  // Re-stitch so the ranges stay contiguous even after dropped blank-only pages.
  for (let i = 0; i < pages.length - 1; i += 1) pages[i].end = pages[i + 1].start;
  pages[pages.length - 1].end = len;
  return pages.length ? pages : [{ start: 0, end: len }];
}

export function pageForOffset(pages, offset) {
  if (!pages.length) return 0;
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pages[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function pageForRatio(pages, textLength, ratio) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (r >= 0.9999) return Math.max(0, pages.length - 1);
  return pageForOffset(pages, Math.floor(r * textLength));
}

// The last page reports 1 so a finished chapter is recorded as finished, like the scrolling reader.
export function ratioForPage(pages, textLength, index) {
  if (!pages.length || !textLength) return 0;
  if (index >= pages.length - 1) return 1;
  return Math.max(0, Math.min(1, pages[index].start / textLength));
}
