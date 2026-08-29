// Pub-sub: components/Toast.js (mounted once at root) subscribes here.
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
