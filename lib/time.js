/** Shared date helpers so Updates and History speak the same language. */

const DAY = 86400000;

const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "just now" / "12m ago" / "3h ago" / "Yesterday" / "12 Mar 2025" */
export function relativeTime(ts) {
  const value = Number(ts);
  if (!value) return '';
  const diff = Date.now() - value;
  if (diff < 60000) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && startOfDay(value) === startOfDay(Date.now())) return `${hours}h ago`;
  const days = Math.round((startOfDay(Date.now()) - startOfDay(value)) / DAY);
  if (days <= 0) return `${Math.max(hours, 1)}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Bucket label used for sticky day headers. */
export function dayLabel(ts) {
  const value = Number(ts);
  if (!value) return 'Earlier';
  const days = Math.round((startOfDay(Date.now()) - startOfDay(value)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'This month';
  return new Date(value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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
