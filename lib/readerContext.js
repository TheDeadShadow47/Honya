let pending = null;

export function setPendingReader(ctx) {
  pending = ctx;
}

export function takePendingReader(chapterId) {
  if (pending && pending.id === chapterId) {
    const taken = pending;
    pending = null;
    return taken;
  }
  return null;
}
