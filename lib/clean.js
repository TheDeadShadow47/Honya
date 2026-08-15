import { decodeHTML } from 'entities';
import * as cheerio from 'cheerio/slim';

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

/* ---------------------------------------------------------------------------
 * Chapter-content sanitization.
 *
 * Extensions return whatever the source site exposes: usually an HTML fragment
 * of the chapter body, sometimes plain text, and on messy sites a mixture of
 * prose, navigation chrome, reporting widgets, subscription prompts and
 * malformed remnants. This pipeline turns that raw extension output into clean,
 * reader-ready text. It is deliberately generic - it keys off HTML structure
 * and cross-site text patterns, never off a site name, CSS class, id, url or a
 * single exact sentence - so it keeps working as individual sites change.
 *
 * The rule that protects real content: UNCERTAIN -> KEEP. Boilerplate is only
 * removed when several independent signals agree; a lone keyword ("report",
 * "support", "chapter") is never enough.
 * ------------------------------------------------------------------------- */

/** Normalize a string for cheap text comparisons (whitespace + case only). */
const fold = (s) =>
  String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Cheap guess: does this string carry real markup (not just entity refs)? */
const isHtmlLike = (s) =>
  /<\s*\/?\s*(p|div|br|h[1-6]|li|ul|ol|span|section|article|table|img|a|blockquote|strong|em|b|i|u)\b/i.test(s) ||
  /<[^>]{1,120}>/i.test(s);

/** Independent boilerplate signal groups. A block needs >= 2 to be removed. */
const BOILERPLATE_SIGNALS = [
  // Reporting / errors
  /\b(report|flag)\b.{0,60}\b(chapter|content|page|issue|novel|error|bug)\b|\b(issue|error|bug)s?\b.{0,40}\b(report|flag|fix)\b|\b(broken|dead)\s+(link|links)\b/i,
  // Ask the reader to notify us
  /\b(let|allow|have)\s+(us|them)\s+know\b|\b(contact|notify|inform|message|email)\s+us\b|\b(please\s+)?send\s+us\b|\b(help\s+us\s+fix|fix\s+it|fix\s+this|correct\s+this)\b/i,
  // Advertising / money
  /\b(ad|ads|advert|advertisement|advertising|pop-?up|sponsor|redirect)\b|\b(support|donate|patreon|paypal|ko-?fi|buy\s+me\s+a\s+coffee)\b/i,
  // Subscribe / social promotion
  /\b(subscribe|newsletter|follow\s+us|join\s+(our|the)\s+|share\s+this|tweet|retweet)\b|\b(discord|telegram|facebook|instagram|twitter|youtube|tiktok|whatsapp)\b/i,
  // Login / navigation chrome
  /\b(log\s+in|sign\s+(in|up)|register|login)\b|\b(previous|next)\s+chapter\b|\b(table\s+of\s+contents|contents|home\s+page|main\s+menu|back\s+to|read\s+(more|next))\b/i,
  // Comment widgets
  /\b(leave\s+(a\s+)?comment|add\s+(a\s+)?comment|no\s+comments|comments?\s+(closed|disabled|are\s+disabled))\b/i,
  // Compound promo phrases: multi-token, so one hit is a strong signal without risking a false positive on dialogue.
  /\bsubscribe\s+to\s+our\s+newsletter\b|\bsign\s+up\s+for\s+our\s+newsletter\b|\bjoin\s+our\s+newsletter\b|\b(join|follow)\s+us\s+on\s+(discord|telegram|facebook|instagram|twitter|youtube|tiktok|whatsapp)\b|\bsupport\s+us\s+on\s+(patreon|paypal|ko-?fi|buymeacoffee|buy\s+me\s+a\s+coffee)\b|\badvertisement\b|\b(disable|turn\s+off|allow|enable|remove)\s+(your\s+)?(adblock|ad\s+blocker)\b|\bsupport\s+(this|our|the)\s+(site|website|app|community|server|channel)\b/i,
];

/** Score one text block against the boilerplate signal groups. */
const boilerplateScore = (text) => {
  const folded = fold(text);
  if (!folded) return 0;
  let score = 0;
  for (const re of BOILERPLATE_SIGNALS) if (re.test(folded)) score += 1;
  return score;
};

/**
 * True when a block looks like website boilerplate rather than prose:
 * it must be short AND hit at least two independent signal groups.
 */
const isBoilerplateBlock = (text) => {
  const trimmed = String(text ?? '').trim();
  const length = trimmed.length;
  if (length === 0 || length >= 200) return false;
  return boilerplateScore(trimmed) >= 2;
};

/** Link density as a ratio of characters inside <a> to total text. */
const linkStats = ($, el) => {
  const total = $(el).text().length;
  let linkChars = 0;
  let linkCount = 0;
  $(el)
    .find('a')
    .each((_i, a) => {
      linkChars += $(a).text().length;
      linkCount += 1;
    });
  return { total, linkChars, linkCount };
};

/** Strip leftover tag-like tokens. Known container tags are removed anywhere
 * (they can only be escaped-markup residue once we're at the text stage);
 * unknown junk tags such as `<report chapter>` are removed when they sit as
 * their own whitespace-surrounded token so real prose isn't touched. */
const KNOWN_TAG_RE = /\s*<\/?\s*(p|div|br|li|ul|ol|span|strong|em|b|i|u|h[1-6]|blockquote|table|tr|td|th|a|section|article|figure|img|center|font)\b[^>]*>\s*/gi;
const stripLeftoverTags = (text) =>
  String(text ?? '')
    .replace(KNOWN_TAG_RE, ' ')
    .replace(
      /(^|[\s\n])(<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z][^<>\n]{0,40})?>)(?=[\s\n]|$)/g,
      '$1',
    );

/** Collapse blank-line runs to one, trim every line, drop edge blank lines.
 * Single newlines (e.g. from <br> line breaks within a stanza) are preserved;
 * only 2+ consecutive blank lines collapse into one paragraph separator. */
const normalizeWhitespace = (text) => {
  const lines = String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim());
  const out = [];
  let prevBlank = false;
  for (const line of lines) {
    if (line === '') {
      if (out.length && !prevBlank) out.push('');
      prevBlank = true;
    } else {
      out.push(line);
      prevBlank = false;
    }
  }
  return out.join('\n').trim();
};

/**
 * Remove a duplicate chapter heading. Only fires when the first non-empty line
 * of the body is effectively the same as the known chapter title (metadata),
 * so arbitrary headings near the start are never touched.
 */
const stripDuplicateTitle = (text, title) => {
  const body = String(text ?? '');
  const expected = fold(title);
  if (!expected) return body;
  const firstLine = body.split('\n').find((line) => line.trim());
  if (!firstLine) return body;
  if (fold(firstLine) !== expected) return body;
  const rest = body.replace(firstLine, '');
  return normalizeWhitespace(rest);
};

/**
 * Structural pass over HTML. Removes site chrome, then drops containers that
 * are mostly links (navigation / recommendation menus) and leaf blocks that
 * match the boilerplate gate, then removes a duplicate title heading.
 */
const sanitizeHtml = (html, title) => {
  const $ = cheerio.load(String(html ?? ''), { decodeEntities: true });
  $(
    'script, style, noscript, template, iframe, embed, object, form, input, button, select, textarea, nav, aside, footer, link, meta, svg, canvas',
  ).remove();
  $('[hidden], [aria-hidden="true"]').remove();
  $('*')
    .contents()
    .filter((_i, n) => n.type === 'comment')
    .remove();

  // Parent-first: removing a link-menu ancestor also drops its children.
  $('div, section, article, aside, ul, ol').each((_i, el) => {
    if (!$(el).length) return;
    const { total, linkChars, linkCount } = linkStats($, el);
    if (total === 0) {
      $(el).remove();
      return;
    }
    const ratio = linkChars / total;
    if (ratio > 0.8 || (linkCount > 5 && total < 120)) $(el).remove();
  });

  // Leaf text blocks: gate on the boilerplate score.
  $('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th').each((_i, el) => {
    if (!$(el).length) return;
    if ($(el).find('p, li, div, section, article').length) return; // not a leaf
    if (isBoilerplateBlock($(el).text())) $(el).remove();
  });

  // Duplicate title heading, if it is the first heading and matches metadata.
  const firstHeading = $('h1, h2, h3').first();
  if (firstHeading.length && fold(title) && fold(firstHeading.text()) === fold(title)) {
    firstHeading.remove();
  }

  // Preserve paragraph boundaries, then flatten to text (slim cheerio has no <html>/<body> wrapper).
  $('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, tr, br').each((_i, el) => {
    $(el).after(el.name === 'br' ? '\n' : '\n\n');
  });
  return $.root().text() || '';
};

/** Turn raw extension output into clean, reader-ready chapter text. */
export const sanitizeChapter = (raw, { title } = {}) => {
  // LNReader-style plugins return a string; be defensive about an object exposing `.content`.
  let content = raw;
  if (content && typeof content === 'object' && typeof content.content === 'string') {
    content = content.content;
  }
  content = String(content ?? '');

  let text;
  if (isHtmlLike(content)) {
    text = sanitizeHtml(content, title);
  } else {
    text = decodeEntities(content);
  }

  if (!text.trim()) return '';

  // Paragraph-level boilerplate gate: short standalone promos that survive the structural pass get caught here.
  text = text
    .split(/\n{2,}/)
    .filter((block) => !isBoilerplateBlock(block))
    .join('\n\n');

  text = stripLeftoverTags(text);
  text = stripDuplicateTitle(text, title);
  text = normalizeWhitespace(text);
  return text;
};
