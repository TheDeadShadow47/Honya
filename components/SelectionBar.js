import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { RADIUS, TOUCH } from '../theme/theme';
import Ripple from './Ripple';

function Act({ icon, label, onPress, disabled }) {
  const theme = useAppTheme();
  const color = disabled ? theme.textMuted : theme.text;
  return (
    <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
      <Ripple onPress={onPress} disabled={disabled} borderless accessibilityLabel={label}>
        <View style={styles.act}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
      </Ripple>
    </View>
  );
}

// Contextual app bar for chapter multi-select, overlaying the list without remounting it.
function SelectionBar({
  count,
  total,
  topInset,
  onClose,
  onToggleAll,
  onDownload,
  onRemoveDownload,
  onMarkRead,
  onMarkUnread,
  hasAnchor,
  canSelectBetween,
  onSelectAllExcept,
  onSelectBetween,
  downloading = false,
  downloadingCount = 0,
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const none = count === 0;

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: topInset + 4, backgroundColor: theme.surface2, borderBottomColor: theme.outline },
      ]}
    >
      <View style={styles.top}>
        <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
          <Ripple onPress={onClose} borderless accessibilityLabel={t('selection.exit')}>
            <View style={styles.act}>
              <Ionicons name="close" size={22} color={theme.text} />
            </View>
          </Ripple>
        </View>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, flex: 1, marginLeft: 6 }}>
          {downloading
            ? t('selection.downloading', { count: downloadingCount })
            : t('selection.selected', { count })}
        </Text>
        <Act icon="checkmark-done-outline" label={t('selection.selectAll')} onPress={onToggleAll} />
      </View>

      <View style={[styles.actions, { borderTopColor: theme.outline }]}>
        <Act icon="arrow-down-circle-outline" label={t('selection.download')} onPress={onDownload} disabled={none || downloading} />
        <Act icon="trash-outline" label={t('selection.removeDownload')} onPress={onRemoveDownload} disabled={none} />
        <Act icon="eye-outline" label={t('selection.markRead')} onPress={onMarkRead} disabled={none} />
        <Act icon="eye-off-outline" label={t('selection.markUnread')} onPress={onMarkUnread} disabled={none} />
        <View style={{ flex: 1 }} />
        <Text style={{ color: theme.textMuted, fontSize: 12, marginRight: 8 }}>{t('selection.ofN', { count: total, plural: total === 1 ? '' : 's' })}</Text>
      </View>

      {/* Long-press always sets an anchor, so "except this" is always available; "in between" needs two. */}
      {hasAnchor ? (
        <View style={[styles.twoPoint, { borderTopColor: theme.outline }]}>
          <Act icon="remove-circle-outline" label={t('selection.selectAllExcept')} onPress={onSelectAllExcept} />
          {canSelectBetween ? (
            <Act icon="git-commit-outline" label={t('selection.selectBetween')} onPress={onSelectBetween} />
          ) : null}
          <View style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, borderBottomWidth: 1, elevation: 4, zIndex: 10 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderTopWidth: 1 },
  twoPoint: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderTopWidth: 1 },
  act: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
});

export default memo(SelectionBar);
