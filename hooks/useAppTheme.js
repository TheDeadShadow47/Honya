import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { THEMES } from '../theme/theme';

export function useAppTheme() {
  const themeKey = useStore((s) => s.prefs.theme);
  return useMemo(() => THEMES[themeKey] ?? THEMES.dark, [themeKey]);
}
