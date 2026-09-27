/**
 * Pure chunking logic for text-to-speech playback (lib/tts.js). Kept dependency-free so
 * it can be unit-tested with plain Node — see scripts/test-tts-chunk.js.
 */

// Comfortably under Android's per-utterance limit across OS/engine versions, while still
// batching several short paragraphs into one utterance so pauses between them stay natural.
export const MAX_CHUNK_LEN = 3500;

/** Split one over-long paragraph on sentence boundaries, then (last resort) on whitespace, so a chunk is never dropped or mid-word. */
function splitLongParagraph(paragraph, maxLen) {
  const sentences = paragraph.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g) || [paragraph];
  const out = [];
  let cur = '';
  for (const sentence of sentences) {
    if (cur && (cur + sentence).length > maxLen) {
      out.push(cur.trim());
      cur = sentence;
    } else {
      cur += sentence;
    }
    while (cur.length > maxLen) {
      let cut = cur.lastIndexOf(' ', maxLen);
      if (cut <= 0) cut = maxLen;
      out.push(cur.slice(0, cut).trim());
      cur = cur.slice(cut).trim();
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Turn sanitized chapter text into speech-sized chunks, packing short paragraphs together and splitting long ones. */
export function chunkText(text, maxLen = MAX_CHUNK_LEN) {
  const clean = String(text ?? '').trim();
  if (!clean) return [];
  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks = [];
  let cur = '';
  for (const p of paragraphs) {
    const candidate = cur ? `${cur} ${p}` : p;
    if (candidate.length <= maxLen) {
      cur = candidate;
      continue;
    }
    if (cur) {
      chunks.push(cur);
      cur = '';
    }
    if (p.length <= maxLen) {
      cur = p;
    } else {
      chunks.push(...splitLongParagraph(p, maxLen));
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
