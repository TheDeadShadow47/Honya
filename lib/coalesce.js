// Pure helpers for state that changes far more often than it needs to be stored or re-rendered.

/**
 * Coalesces rapid saves into one write of the latest value (slider drags change a preference dozens of
 * times a second). `flush` writes immediately; `cancel` discards a pending value (a newer writer owns it).
 */
export function createCoalescedWriter(write, delayMs) {
  let timer = null;
  let pending;
  let has = false;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    clear();
    if (!has) return Promise.resolve();
    const value = pending;
    has = false;
    pending = undefined;
    return Promise.resolve()
      .then(() => write(value))
      .catch(() => {});
  };
  return {
    save(value) {
      pending = value;
      has = true;
      clear();
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      clear();
      has = false;
      pending = undefined;
    },
  };
}

const sameValue = (a, b) =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]));

function sameRow(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => sameValue(a[k], b[k]));
}

/**
 * Returns `next` with every unchanged row replaced by its previous object (matched by `id`), or `prev`
 * itself when nothing changed, so memoised list items and selectors skip work after a refresh.
 */
export function reuseRows(prev, next) {
  if (!prev.length) return next;
  const old = new Map(prev.map((row) => [row.id, row]));
  let identical = prev.length === next.length;
  const rows = next.map((row, i) => {
    const before = old.get(row.id);
    const kept = before && sameRow(before, row) ? before : row;
    if (kept !== prev[i]) identical = false;
    return kept;
  });
  return identical ? prev : rows;
}
