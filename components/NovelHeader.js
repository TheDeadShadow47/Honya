import { memo } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { alpha, isThemeDark, RADIUS, TOUCH } from '../theme/theme';
import Ripple from './Ripple';

function Action({ icon, label, active, refreshing, onPress }) {
  const theme = useAppTheme();
  const color = active ? theme.primary : theme.textMuted;
  return (
    <View style={styles.actionWrap}>
      <Ripple onPress={refreshing ? undefined : onPress} accessibilityLabel={label}>
        <View style={styles.action}>
          {refreshing ? (
            <ActivityIndicator size={18} color={color} />
          ) : (
            <Ionicons name={icon} size={20} color={color} />
          )}
          <Text numberOfLines={1} style={{ color, fontSize: 11.5, marginTop: 5, fontWeight: '600' }}>
            {label}
          </Text>
        </View>
      </Ripple>
    </View>
  );
}

function NovelHeader({
  novel,
  sourceName,
  topInset,
  expanded,
  onToggleExpanded,
  onBack,
  onToggleLibrary,
  onMigrate,
  onRefresh,
  refreshing,
  resumeChapter,
  resumeIsContinue,
  onResume,
  totalChapters,
  shownChapters,
  filtered,
  manageActive,
  onOpenManage,
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const genres = Array.isArray(novel.genres) ? novel.genres.filter(Boolean) : [];

  const statusMap = {
    publishing: t('novel.status.publishing'),
    ongoing: t('novel.status.ongoing'),
    completed: t('novel.status.completed'),
    hiatus: t('novel.status.hiatus'),
    cancelled: t('novel.status.cancelled'),
  };
  const status = novel.status ? statusMap[novel.status] : t('novel.status.unknown');

  return (
    <View>
      <View style={styles.hero}>
        {novel.cover ? (
          <Image source={{ uri: novel.cover }} style={StyleSheet.absoluteFill} blurRadius={14} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface2 }]} />
        )}
        <BlurView intensity={55} tint={isThemeDark(theme) ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(theme.background, 0.72) }]} />

        <View style={{ flex: 1, paddingTop: topInset + 4, paddingHorizontal: 16 }}>
          <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden', alignSelf: 'flex-start' }}>
            <Ripple onPress={onBack} borderless accessibilityLabel={t('novel.back')}>
              <View style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="arrow-back" size={23} color={theme.text} />
              </View>
            </Ripple>
          </View>

          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <View style={[styles.cover, { backgroundColor: theme.surface2 }]}>
              {novel.cover ? <Image source={{ uri: novel.cover }} style={{ width: '100%', height: '100%' }} /> : null}
            </View>
            <View style={{ flex: 1, marginLeft: 16, justifyContent: 'flex-end', paddingBottom: 4 }}>
              <Text numberOfLines={3} style={{ color: theme.text, fontSize: 21, fontWeight: '800', lineHeight: 27 }}>
                {novel.title}
              </Text>
              {novel.author ? (
                <View style={styles.metaLine}>
                  <Ionicons name="person-outline" size={13} color={theme.textMuted} />
                  <Text numberOfLines={1} style={[styles.metaText, { color: theme.textMuted }]}>
                    {novel.author}
                  </Text>
                </View>
              ) : null}
              <View style={styles.metaLine}>
                <Ionicons name="time-outline" size={13} color={theme.textMuted} />
                <Text numberOfLines={1} style={[styles.metaText, { color: theme.textMuted }]}>
                  {[status, sourceName].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Action
          icon={novel.inLibrary ? 'heart' : 'heart-outline'}
          label={novel.inLibrary ? t('novel.inLibrary') : t('novel.addToLibrary')}
          active={novel.inLibrary}
          onPress={onToggleLibrary}
        />
        <Action icon="git-compare-outline" label={t('novel.migrate')} onPress={onMigrate} />
        <Action icon="refresh-outline" label={t('novel.refresh')} onPress={onRefresh} refreshing={refreshing} />
      </View>

      {novel.summary ? (
        <Ripple onPress={onToggleExpanded} accessibilityLabel={t('novel.toggleDescription')}>
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 }}>
            <Text
              numberOfLines={expanded ? undefined : 3}
              style={{ color: theme.textMuted, fontSize: 14, lineHeight: 21 }}
            >
              {novel.summary}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <Text style={{ color: theme.primary, fontSize: 12.5, fontWeight: '700', marginRight: 3 }}>
                {expanded ? t('novel.showLess') : t('novel.showMore')}
              </Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={theme.primary} />
            </View>
          </View>
        </Ripple>
      ) : null}

      {genres.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          removeClippedSubviews={false}
        >
          {genres.map((g, i) => (
            <View
              key={`${g}-${i}`}
              style={[styles.chip, { backgroundColor: theme.secondaryContainer, borderColor: theme.outline }]}
            >
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12.5, fontWeight: '600' }}>
                {String(g).trim()}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {resumeChapter ? (
        <View style={styles.resumeWrap}>
          <Ripple
            onPress={onResume}
            rippleColor={alpha(theme.onPrimary, 0.2)}
            accessibilityLabel={resumeIsContinue ? t('reader.resumeChapter') : t('reader.startReading')}
          >
            <View style={[styles.resume, { backgroundColor: theme.primary }]}>
              <Ionicons name="play" size={17} color={theme.onPrimary} />
              <Text numberOfLines={1} style={{ color: theme.onPrimary, fontWeight: '800', fontSize: 14.5, marginLeft: 9, flexShrink: 1 }}>
                {resumeIsContinue
                  ? `${t('reader.resumeChapter')} ${resumeChapter.name}`
                  : `${t('reader.startReading')} ${resumeChapter.name}`}
              </Text>
            </View>
          </Ripple>
        </View>
      ) : null}

      <View style={styles.toolbar}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, flex: 1 }}>
          {filtered
            ? t('novel.filteredChapters', {
                count: totalChapters,
                plural: totalChapters === 1 ? '' : 's',
                shown: shownChapters,
                shownPlural: shownChapters === 1 ? '' : 's',
              })
            : t('novel.chapters', { count: totalChapters, plural: totalChapters === 1 ? '' : 's' })}
        </Text>
        <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
          <Ripple onPress={onOpenManage} accessibilityLabel={t('novel.manageA11y')}>
            <View
              style={[
                styles.manageButton,
                {
                  backgroundColor: manageActive ? theme.primaryContainer : theme.surface1,
                  borderColor: manageActive ? 'transparent' : theme.outline,
                },
              ]}
            >
              <Ionicons
                name="options-outline"
                size={17}
                color={manageActive ? theme.onPrimaryContainer : theme.text}
              />
              <Text
                style={{
                  color: manageActive ? theme.onPrimaryContainer : theme.text,
                  fontWeight: '700',
                  fontSize: 13,
                  marginLeft: 6,
                }}
              >
                {manageActive ? t('novel.filtered') : t('novel.filter')}
              </Text>
            </View>
          </Ripple>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 292 },
  cover: { width: 116, aspectRatio: 2 / 3, borderRadius: RADIUS.lg, overflow: 'hidden' },
  metaLine: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  metaText: { fontSize: 13, marginLeft: 6, flexShrink: 1 },
  actionRow: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2 },
  actionWrap: { flex: 1, borderRadius: RADIUS.md, overflow: 'hidden' },
  action: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, minHeight: TOUCH },
  chipRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    maxWidth: 200,
  },
  resumeWrap: { marginHorizontal: 16, borderRadius: RADIUS.pill, overflow: 'hidden' },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 20,
    borderRadius: RADIUS.pill,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
});

export default memo(NovelHeader);
