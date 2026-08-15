import { memo, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { alpha, RADIUS } from '../theme/theme';
import Ripple from './Ripple';

/** Fixed row height so the list can use getItemLayout on huge novels. */
export const CHAPTER_ROW_HEIGHT = 68;

/**
 * Single chapter row.
 *
 * Memoised and driven by *stable* callbacks that receive the chapter, so
 * selecting one chapter re-renders exactly one row instead of the whole list.
 */
const ChapterRow = memo(function ChapterRow({
  chapter,
  onPress,
  onLongPress,
  subtitle,
  downloadState,
  onDownload,
  onRemoveDownload,
  selecting,
  selected,
  showNumber = false,
  showSource = false,
  sourceName,
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const read = !!chapter.read;
  const downloading = downloadState === 'downloading';
  const failed = downloadState === 'failed';
  const downloaded = !!chapter.downloaded;
  const progress = chapter.progress ?? 0;
  const partial = !read && progress > 0.02;

  const meta = [];
  if (showNumber && chapter.number != null) meta.push(`#${chapter.number}`);
  if (subtitle) meta.push(subtitle);
  else if (chapter.releaseTime) meta.push(String(chapter.releaseTime));
  else if (!showNumber && chapter.number != null) meta.push(t('chapter.chapterNumber', { number: chapter.number }));
  if (showSource && sourceName) meta.push(sourceName);
  if (downloaded) meta.push(t('chapter.offline'));
  if (partial) meta.push(`${Math.round(progress * 100)}%`);

  const handlePress = useCallback(() => onPress?.(chapter), [onPress, chapter]);
  const handleLongPress = useCallback(() => onLongPress?.(chapter), [onLongPress, chapter]);
  const handleDownload = useCallback(() => {
    if (downloading) return;
    if (downloaded) onRemoveDownload?.(chapter);
    else onDownload?.(chapter);
  }, [downloading, downloaded, onRemoveDownload, onDownload, chapter]);

  return (
    <Ripple onPress={handlePress} onLongPress={handleLongPress} delayLongPress={220}>
      <View style={[styles.row, selected ? { backgroundColor: alpha(theme.primary, 0.14) } : null]}>
        {/* No checkboxes: selection state is conveyed by the row's tinted
            background (applied below). The read/unread dot stays identical in
            and out of selection mode so the list keeps its clean look. */}
        <View style={styles.lead}>
          <View
            style={[
              styles.dot,
              read
                ? { borderWidth: 1.5, borderColor: theme.textMuted, opacity: 0.4 }
                : { backgroundColor: theme.primary },
            ]}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: read ? theme.textMuted : theme.text,
              fontSize: 14.5,
              lineHeight: 19,
              fontWeight: read ? '500' : '700',
            }}
          >
            {chapter.name}
          </Text>
          <View style={styles.metaRow}>
            <Text numberOfLines={1} style={{ color: partial || downloaded ? theme.primary : theme.textMuted, fontSize: 11.5 }}>
              {meta.join(' · ')}
            </Text>
          </View>
          {partial ? (
            <View style={[styles.track, { backgroundColor: alpha(theme.primary, 0.18) }]}>
              <View
                style={{
                  width: `${Math.min(100, Math.round(progress * 100))}%`,
                  height: '100%',
                  borderRadius: 2,
                  backgroundColor: theme.primary,
                }}
              />
            </View>
          ) : null}
        </View>

        {selecting ? null : (
          <View style={styles.actionWrap}>
            <Ripple borderless disabled={downloading} hitSlop={6} onPress={handleDownload} accessibilityLabel={t('chapter.download')}>
              <View style={styles.downloadButton}>
                {downloading ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Ionicons
                    name={downloaded ? 'checkmark-circle' : failed ? 'cloud-offline-outline' : 'arrow-down-circle-outline'}
                    size={21}
                    color={downloaded ? theme.primary : failed ? theme.error : theme.textMuted}
                  />
                )}
              </View>
            </Ripple>
          </View>
        )}
      </View>
    </Ripple>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: CHAPTER_ROW_HEIGHT,
  },
  lead: { width: 26, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  track: { height: 3, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  actionWrap: { borderRadius: RADIUS.pill, overflow: 'hidden', marginLeft: 6 },
  downloadButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

export default ChapterRow;
