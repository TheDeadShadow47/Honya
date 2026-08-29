/**
 * Shared date helpers so Updates, History, Downloads and Backup speak the
 * same language. Relative times and day headers follow the app's selected
 * language (via the i18n `time.*` keys) rather than hard-coded English.
 */

import { t, getLanguage } from './i18n';

const DAY = 86400000;

const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** App language code → JS locale tag used for absolute date formatting. */
const LOCALE_TAG = {
  en: 'en-GB',
  ar: 'ar',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
};

/** "just now" / "12m ago" / "3h ago" / "Yesterday" / "12 Mar 2025" */
export function relativeTime(ts) {
  const value = Number(ts);
  if (!value) return '';
  const diff = Date.now() - value;
  if (diff < 60000) return t('time.justNow');
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t('time.minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24 && startOfDay(value) === startOfDay(Date.now())) return t('time.hoursAgo', { n: hours });
  const days = Math.round((startOfDay(Date.now()) - startOfDay(value)) / DAY);
  if (days <= 0) return t('time.hoursAgo', { n: Math.max(hours, 1) });
  if (days === 1) return t('time.yesterday');
  if (days < 7) return t('time.daysAgo', { n: days });
  const tag = LOCALE_TAG[getLanguage()];
  return new Date(value).toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Bucket label used for sticky day headers. */
export function dayLabel(ts) {
  const value = Number(ts);
  if (!value) return t('time.earlier');
  const days = Math.round((startOfDay(Date.now()) - startOfDay(value)) / DAY);
  const tag = LOCALE_TAG[getLanguage()];
  if (days <= 0) return t('time.today');
  if (days === 1) return t('time.yesterday');
  if (days < 7) return t('time.thisWeek');
  if (days < 30) return t('time.thisMonth');
  return new Date(value).toLocaleDateString(tag, { month: 'long', year: 'numeric' });
}

/**
 * Turns a chronologically ordered list into a flat list of
 * `{ type: 'header' }` / `{ type: 'item' }` rows for a single FlatList — no
 * nested scrolling, no SectionList overhead.
 */
export function groupByDay(rows, getTime) {
  const out = [];
  let current = null;
  for (const row of rows) {
    const label = dayLabel(getTime(row));
    if (label !== current) {
      current = label;
      out.push({ type: 'header', id: `header-${label}-${out.length}`, label });
    }
    out.push({ type: 'item', id: row.id, row });
  }
  return out;
}
