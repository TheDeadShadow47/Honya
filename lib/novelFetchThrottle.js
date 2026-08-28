// Throttle auto-refetch per novel so rapid open -> back -> open doesn't hit
// the network, and so a library-wide update and the novel-details screen
// don't both refetch the same novel back to back. Manual refresh bypasses it.
export const FETCH_THROTTLE_MS = 10 * 60 * 1000;
export const lastFetchedAt = new Map();

export function markFetched(novelId) {
  lastFetchedAt.set(novelId, Date.now());
}

export function shouldFetch(novelId) {
  return Date.now() - (lastFetchedAt.get(novelId) ?? 0) > FETCH_THROTTLE_MS;
}
