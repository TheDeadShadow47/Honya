import { Platform, Pressable } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { alpha } from '../theme/theme';

/**
 * Press surface with a native Android ripple.
 *
 * Uses Pressable's built-in `android_ripple` (rendered by the platform on the
 * UI thread) instead of a JS-driven opacity animation, so touch feedback stays
 * at 60fps even while a list is scrolling. `hitSlop` gives small icons a
 * comfortable Android touch target without changing layout.
 */
export default function Ripple({
  children,
  onPress,
  onLongPress,
  delayLongPress,
  style,
  borderless = false,
  disabled,
  hitSlop,
  rippleColor,
  accessibilityLabel,
}) {
  const theme = useAppTheme();
  const color = rippleColor ?? alpha(theme.primary, 0.16);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color, borderless, foreground: !borderless }}
      style={({ pressed }) => [style, pressed && Platform.OS !== 'android' ? { opacity: 0.65 } : null]}
    >
      {children}
    </Pressable>
  );
}
