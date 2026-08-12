import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { RADIUS } from '../theme/theme';
import { relativeTime } from '../lib/time';
import { ProgressBar } from './MD3';
import Ripple from './Ripple';
import Cover from './Cover';

/**
 * One reading-history entry. Tapping resumes the chapter in the existing
 * reader; the chevron affordance and the whole row share the same action.
 */
const HistoryRow = memo(function HistoryRow({ item, onPress, onLongPress }) {
  const theme = useAppTheme();
  const progress = item.read ? 1 : Math.min(Math.max(item.progress ?? 0, 0), 1);

  return (
    <Ripple onPress={onPress} onLongPress={onLongPress}>
      <View style={styles.row}>
        <Cover uri={item.novelCover} title={item.novelTitle} width={50} height={72} radius={RADIUS.md} />

        <View style={styles.body}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14.5, fontWeight: '700' }}>
            {item.novelTitle}
          </Text>
          <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>
            {item.name ?? `Chapter ${item.number ?? ''}`}
          </Text>

          <View style={styles.metaRow}>
            <Text style={{ color: theme.textMuted, fontSize: 11.5, fontWeight: '600' }}>
              {relativeTime(item.lastReadAt)}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 11.5 }}> · </Text>
            <Text style={{ color: item.read ? theme.textMuted : theme.primary, fontSize: 11.5, fontWeight: '700' }}>
              {item.read ? 'Finished' : progress > 0.02 ? `${Math.round(progress * 100)}% read` : 'Started'}
            </Text>
            {item.downloaded ? (
              <>
                <Text style={{ color: theme.textMuted, fontSize: 11.5 }}> · </Text>
                <Ionicons name="cloud-done-outline" size={12} color={theme.primary} />
              </>
            ) : null}
          </View>

          {progress > 0 && progress < 1 ? (
            <ProgressBar value={progress} height={3} style={{ marginTop: 8, marginRight: 4 }} />
          ) : null}
        </View>

        <Ionicons name="play-circle" size={26} color={theme.primary} style={{ marginLeft: 6 }} />
      </View>
    </Ripple>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, minHeight: 88 },
  body: { flex: 1, minWidth: 0, marginLeft: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
});

export default HistoryRow;
