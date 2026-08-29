import { Platform, Pressable } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { alpha } from '../theme/theme';

/** Native `android_ripple` runs on the UI thread, keeping touch feedback smooth while a list scrolls. */
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
