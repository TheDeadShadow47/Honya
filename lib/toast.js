// Subtle, non-blocking action feedback (e.g. "4 chapters added to downloads").
// Same pub-sub singleton style as lib/readerContext.js / lib/downloadQueue.js —
// no new UI library, just a small host component (components/Toast.js) mounted
// once at the root that listens here.
const listeners = new Set();

export function showToast(message) {
  if (!message) return;
  listeners.forEach((fn) => {
    try {
      fn(message);
    } catch {}
  });
}

export function subscribeToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
