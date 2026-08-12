import { decodeHTML } from 'entities';

/**
 * Decode HTML entities (named, decimal and hexadecimal) into their characters.
 *
 * A bounded number of passes handles double-encoded input such as `&amp;#x2014;`,
 * which converges to `—` after two passes, without ever looping indefinitely on
 * unchanged text. `&nbsp;` decodes to the NBSP character and is normalized to a
 * plain space to match the reader's existing layout behavior.
 *
 * This is the single entity-decoding mechanism shared by raw HTML (via
 * `stripHtml`) and by already-stored chapter text at read time.
 */
export const decodeEntities = (text) => {
  let out = String(text ?? '');
  for (let i = 0; i < 3; i += 1) {
    const next = decodeHTML(out);
    if (next === out) break;
    out = next;
  }
  return out.replace(/ /g, ' ');
};

/**
 * Turn raw chapter HTML into reader-ready text.
 *
 * Decoding happens *after* tag removal so entity-encoded markup (`&lt;p&gt;`)
 * is not mistaken for real structure, while paragraph and line breaks from
 * `p`, `div`, headings, list items and `br` are preserved as newlines. Entities
 * are decoded by `decodeEntities` (shared with stored-text reads).
 */
export const stripHtml = (html) =>
  decodeEntities(
    String(html ?? '')
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|h[1-6]|li)\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
