import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { ProgressBar } from './MD3';
import Ripple from './Ripple';
import Cover from './Cover';
import { encodeNavParam } from '../lib/navIds';
import { setPendingReader } from '../lib/readerContext';
import { RADIUS } from '../theme/theme';

/**
 * Surfaces the single most recently opened chapter so the user can resume
 * reading without going through library -> novel -> chapter list. Reuses the
 * existing history/progress data — no separate progress tracking.
 */
export default function ContinueReading({ entry }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useI18n();
  if (!entry) return null;

  const pct = Math.min(Math.max(entry.progress ?? 0, 0), 1);

  const onPress = () => {
    setPendingReader({
      id: entry.id,
      name: entry.name,
      novelId: entry.novelId,
      novelTitle: entry.novelTitle,
    });
    router.push(`/reader/${encodeNavParam(entry.id)}`);
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 }}>
        {t('library.continueReading').toUpperCase()}
      </Text>
      <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: theme.surface1 }}>
        <Ripple onPress={onPress}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
            <Cover uri={entry.novelCover} title={entry.novelTitle} width={54} height={76} radius={RADIUS.md} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: 14 }}>
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>
                {entry.novelTitle}
              </Text>
              <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>
                {entry.name}
              </Text>
              <View style={{ marginTop: 10, marginRight: 4 }}>
                <ProgressBar value={pct} />
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>{Math.round(pct * 100)}%</Text>
            </View>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 8,
              }}
            >
              <Ionicons name="play" size={17} color={theme.onPrimary} />
            </View>
          </View>
        </Ripple>
      </View>
    </View>
  );
}
