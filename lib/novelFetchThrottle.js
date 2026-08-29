// Throttle per-novel auto-refetch; manual refresh bypasses it.
export const FETCH_THROTTLE_MS = 10 * 60 * 1000;
export const lastFetchedAt = new Map();

export function markFetched(novelId) {
  lastFetchedAt.set(novelId, Date.now());
}

export function shouldFetch(novelId) {
  return Date.now() - (lastFetchedAt.get(novelId) ?? 0) > FETCH_THROTTLE_MS;
}
