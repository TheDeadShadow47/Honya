import { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { RADIUS } from '../theme/theme';

/** `fadeDuration={0}` avoids the default Android cross-fade, a big source of jank when cells recycle. */
const Cover = memo(function Cover({ uri, width, height, radius = RADIUS.md, title, style }) {
  const theme = useAppTheme();
  const [failedUri, setFailedUri] = useState(null); // keyed by URI so a regenerated or replaced cover gets a fresh try
  const showImage = !!uri && failedUri !== uri;

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
          onError={() => setFailedUri(uri)}
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
