// Module-resolution hook: redirects `expo-sqlite` to the node-backed shim for the database test.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo-sqlite') return { url: new URL('./expo-sqlite-shim.js', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
