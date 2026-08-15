import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { RADIUS } from '../theme/theme';

const OPEN = { duration: 210, easing: Easing.out(Easing.cubic), useNativeDriver: true };
const CLOSE = { duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true };

/**
 * Reusable modal bottom sheet.
 *
 * Performance notes:
 * - The native `Modal` slide animation is disabled and replaced with an
 *   `Animated` transform driven by the native driver, so opening the sheet does
 *   no work on the JS thread while the animation runs.
 * - Children are only mounted while the sheet is on screen, so an open/close
 *   cycle never keeps an off-screen tree alive under a long list.
 */
export default function BottomSheet({ visible, onDismiss, children, maxHeight = '80%' }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, ...OPEN }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, ...CLOSE }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(() => onDismiss?.(), [onDismiss]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <View style={styles.wrap}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight,
              backgroundColor: theme.surface2,
              borderColor: theme.outline,
              paddingBottom: Math.max(insets.bottom, 10) + 8,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.textMuted + '55' }]} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: '#000000', opacity: 0.5 },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 10 },
});
