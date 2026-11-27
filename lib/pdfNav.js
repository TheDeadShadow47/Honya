// The native PDF view reports page changes asynchronously, so after `goTo` a stale event can drag
// the UI back to the previous page. `createPageGuard` swallows those for a short window while
// still accepting the event that confirms the jump.

export const JUMP_SETTLE_MS = 450;

export function createPageGuard(settleMs = JUMP_SETTLE_MS) {
  let target = null;
  let until = 0;
  return {
    jumped(page, now) {
      target = page;
      until = now + settleMs;
    },
    accept(page, now) {
      if (target == null) return true;
      if (now > until) {
        target = null;
        return true;
      }
      if (page === target) {
        target = null; // the jump was confirmed; later scrolling reports normally
        return true;
      }
      return false;
    },
  };
}

/** 1-based clamp; returns null for unusable numbers. */
export function clampPage(page, total) {
  const n = Math.trunc(Number(page));
  if (!Number.isFinite(n)) return null;
  const max = total && total > 0 ? total : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(n, 1), max);
}

/** Starts from the live (pinched) scale; pinch is not fed back into props. */
export function nextScale(current, delta, min, max) {
  return Math.min(max, Math.max(min, Math.round((current + delta) * 10) / 10));
}
