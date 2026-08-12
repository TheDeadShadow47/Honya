import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../hooks/useAppTheme';
import { alpha, RADIUS } from '../theme/theme';
import Ripple from './Ripple';
import Cover from './Cover';

const NovelCard = memo(function NovelCard({ novel, width }) {
  const theme = useAppTheme();
  const router = useRouter();
  const total = novel.totalChapters || 0;
  const progress = total ? Math.min(novel.readChapters / total, 1) : 0;
  const finished = total > 0 && novel.unread === 0;

  return (
    <View style={{ width, borderRadius: RADIUS.lg, overflow: 'hidden' }}>
      <Ripple onPress={() => router.push(`/novel/${encodeURIComponent(novel.id)}`)}>
        <View>
          <View style={styles.coverWrap}>
            <Cover uri={novel.cover} title={novel.title} radius={RADIUS.lg} style={styles.cover} />

            {novel.unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                <Text style={{ color: theme.onPrimary, fontSize: 11, fontWeight: '800' }}>
                  {novel.unread > 99 ? '99+' : novel.unread}
                </Text>
              </View>
            ) : finished ? (
              <View style={[styles.badge, styles.badgeIcon, { backgroundColor: alpha(theme.primary, 0.9) }]}>
                <Text style={{ color: theme.onPrimary, fontSize: 10, fontWeight: '800' }}>✓</Text>
              </View>
            ) : null}

            {progress > 0 ? (
              <View style={styles.progressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: '#00000073' }]}>
                  <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: theme.primary }} />
                </View>
              </View>
            ) : null}
          </View>

          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>
            {novel.title}
          </Text>
          {total > 0 ? (
            <Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>
              {novel.readChapters}/{total} read
            </Text>
          ) : null}
        </View>
      </Ripple>
    </View>
  );
});

const styles = StyleSheet.create({
  coverWrap: { aspectRatio: 2 / 3, borderRadius: RADIUS.lg, overflow: 'hidden' },
  cover: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    minWidth: 22,
    paddingHorizontal: 7,
    height: 22,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: { minWidth: 22, paddingHorizontal: 0 },
  progressWrap: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  progressTrack: { height: 4, borderRadius: 4, overflow: 'hidden' },
  title: { fontSize: 12.5, fontWeight: '700', marginTop: 8, lineHeight: 16.5 },
  meta: { fontSize: 11, fontWeight: '600', marginTop: 2, marginBottom: 4 },
});

export default NovelCard;
