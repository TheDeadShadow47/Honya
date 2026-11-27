import { useColorScheme } from 'react-native';
import { useStore } from '../store/useStore';
import { resolveActivePalette, resolveAppearance } from '../theme/palette';

/** The concrete appearance in effect: the stored choice, or the device's scheme when it is 'system'. */
export function useAppearance() {
  const pref = useStore((s) => s.prefs.appearance);
  const scheme = useColorScheme();
  return resolveAppearance(pref, scheme);
}

export function useAppTheme() {
  const appearance = useStore((s) => s.prefs.appearance);
  const themeKey = useStore((s) => s.prefs.theme);
  const scheme = useColorScheme();
  return resolveActivePalette(appearance, themeKey, scheme);
}
