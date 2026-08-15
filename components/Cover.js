import { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { RADIUS } from '../theme/theme';

/**
 * Memoised novel cover.
 *
 * Re-renders only when the uri/size actually change, which keeps large grids
 * and lists from re-decoding the same bitmap while scrolling. `fadeDuration={0}`
 * avoids the default Android cross-fade, the single biggest source of jank when
 * cells recycle. Offline behaviour is unchanged: the same remote uri is handed
 * to RN's image cache as before.
 */
const Cover = memo(function Cover({ uri, width, height, radius = RADIUS.md, title, style }) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.surface2, overflow: 'hidden' },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          fadeDuration={0}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.fallback}>
          <Text numberOfLines={3} style={{ color: theme.textMuted, fontSize: 11, textAlign: 'center' }}>
            {title ?? ''}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 6 },
});

export default Cover;
