import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { alpha, RADIUS, TOUCH } from '../theme/theme';
import Ripple from './Ripple';
import BottomSheet from './BottomSheet';

const TABS = [
  { key: 'filter', label: 'chapterManage.filter' },
  { key: 'sort', label: 'chapterManage.sort' },
  { key: 'display', label: 'chapterManage.display' },
];

const FILTERS = [
  { key: 'downloaded', label: 'chapterManage.downloaded', icon: 'cloud-done-outline' },
  { key: 'unread', label: 'chapterManage.unread', icon: 'ellipse-outline' },
];

const SORTS = [
  { key: 'numberAsc', label: 'chapterManage.chapterNumber', hint: 'chapterManage.ascending' },
  { key: 'numberDesc', label: 'chapterManage.chapterNumber', hint: 'chapterManage.descending' },
  { key: 'newest', label: 'chapterManage.releaseDate', hint: 'chapterManage.newestFirst' },
  { key: 'oldest', label: 'chapterManage.releaseDate', hint: 'chapterManage.oldestFirst' },
];

const DISPLAYS = [
  { key: 'sourceTitle', label: 'chapterManage.sourceName', icon: 'server-outline' },
  { key: 'chapterNumber', label: 'chapterManage.chapterNumber', icon: 'list-outline' },
];

const OptionRow = memo(function OptionRow({ label, hint, icon, selected, radio, onPress }) {
  const theme = useAppTheme();
  const mark = radio
    ? selected
      ? 'radio-button-on'
      : 'radio-button-off'
    : selected
      ? 'checkbox'
      : 'square-outline';

  return (
    <View style={styles.rowWrap}>
      <Ripple onPress={onPress} accessibilityLabel={label}>
        <View style={[styles.row, { backgroundColor: selected ? alpha(theme.primary, 0.1) : 'transparent' }]}>
          <Ionicons name={mark} size={21} color={selected ? theme.primary : theme.textMuted} />
          <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontWeight: selected ? '700' : '500' }}>
              {label}
            </Text>
            {hint ? (
              <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                {hint}
              </Text>
            ) : null}
          </View>
          {icon ? <Ionicons name={icon} size={17} color={theme.textMuted} /> : null}
        </View>
      </Ripple>
    </View>
  );
});

// Purely presentational: Filter, Sort and Display options, all state lives in the novel screen.
function ChapterManageSheet({
  visible,
  onDismiss,
  filters,
  onFilterChange,
  sortKey,
  onSortChange,
  display,
  onDisplayChange,
  onReset,
  canReset,
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [tab, setTab] = useState('filter');
  const selectTab = useCallback((key) => setTab(key), []);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <View style={styles.headerRow}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{t('chapterManage.chapters')}</Text>
        {canReset ? (
          <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
            <Ripple onPress={onReset} borderless>
              <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{t('chapterManage.reset')}</Text>
              </View>
            </Ripple>
          </View>
        ) : null}
      </View>

      {/* Segmented tabs — switching only swaps a tiny option list. */}
      <View style={[styles.segment, { backgroundColor: theme.surface1, borderColor: theme.outline }]}>
        {TABS.map((tabItem) => {
          const active = tab === tabItem.key;
          return (
            <View key={tabItem.key} style={styles.segmentItem}>
              <Ripple onPress={() => selectTab(tabItem.key)} accessibilityLabel={tabItem.label}>
                <View style={[styles.segmentInner, active ? { backgroundColor: theme.primaryContainer } : null]}>
                  <Text
                    style={{
                      color: active ? theme.onPrimaryContainer : theme.textMuted,
                      fontWeight: '700',
                      fontSize: 13.5,
                    }}
                  >
                    {t(tabItem.label) || tabItem.label}
                  </Text>
                </View>
              </Ripple>
            </View>
          );
        })}
      </View>

      <View style={{ paddingTop: 10, paddingBottom: 4 }}>
        {tab === 'filter'
          ? FILTERS.map((f) => (
              <OptionRow
                key={f.key}
                label={t(f.label) || f.label}
                icon={f.icon}
                selected={!!filters[f.key]}
                onPress={() => onFilterChange(f.key, !filters[f.key])}
              />
            ))
          : tab === 'sort'
            ? SORTS.map((s) => (
                <OptionRow
                  key={s.key}
                  label={t(s.label) || s.label}
                  hint={t(s.hint) || s.hint}
                  radio
                  selected={sortKey === s.key}
                  onPress={() => onSortChange(s.key)}
                />
              ))
            : DISPLAYS.map((d) => (
                <OptionRow
                  key={d.key}
                  label={t(d.label) || d.label}
                  icon={d.icon}
                  selected={!!display[d.key]}
                  onPress={() => onDisplayChange(d.key, !display[d.key])}
                />
              ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, paddingLeft: 4 },
  segment: { flexDirection: 'row', borderRadius: RADIUS.pill, padding: 4, borderWidth: 1, gap: 4 },
  segmentItem: { flex: 1, borderRadius: RADIUS.pill, overflow: 'hidden' },
  segmentInner: { alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: RADIUS.pill },
  rowWrap: { borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: TOUCH,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
});

export default memo(ChapterManageSheet);
