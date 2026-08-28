import { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { subscribeToast } from '../lib/toast';
import { RADIUS } from '../theme/theme';

const DURATION = 2200;

export default function Toast() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  useEffect(() => {
    return subscribeToast((msg) => {
      clearTimeout(timerRef.current);
      setMessage(msg);
      opacity.stopAnimation();
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMessage(null));
      }, DURATION);
    });
  }, [opacity]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 24,
        right: 24,
        bottom: insets.bottom + 24,
        opacity,
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={{
          backgroundColor: theme.inverseSurface ?? theme.surface2,
          paddingHorizontal: 18,
          paddingVertical: 12,
          borderRadius: RADIUS.pill,
          maxWidth: '100%',
          elevation: 6,
        }}
      >
        <Text
          numberOfLines={2}
          style={{ color: theme.inverseOnSurface ?? theme.text, fontSize: 13.5, fontWeight: '600', textAlign: 'center' }}
        >
          {message}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
