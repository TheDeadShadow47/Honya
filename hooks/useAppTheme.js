import { useStore } from '../store/useStore';
import { resolveActivePalette } from '../theme/palette';

export function useAppTheme() {
  const appearance = useStore((s) => s.prefs.appearance);
  const themeKey = useStore((s) => s.prefs.theme);
  return resolveActivePalette(appearance, themeKey);
}
