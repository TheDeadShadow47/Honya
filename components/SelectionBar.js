import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { RADIUS, TOUCH, alpha } from '../theme/theme';
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

function Chip({ theme, icon, label, onPress, disabled }) {
  return (
    <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
      <Ripple onPress={onPress} disabled={disabled} accessibilityLabel={label}>
        <View
          style={[
            styles.chip,
            { backgroundColor: disabled ? 'transparent' : alpha(theme.primary, 0.14) },
          ]}
        >
          <Ionicons name={icon} size={15} color={disabled ? theme.textMuted : theme.primary} />
          <Text
            style={{
              color: disabled ? theme.textMuted : theme.primary,
              fontSize: 12.5,
              fontWeight: '700',
              marginLeft: 6,
            }}
          >
            {label}
          </Text>
        </View>
      </Ripple>
    </View>
  );
}

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
  canDownload,
  canRemoveDownload,
  canMarkRead,
  canMarkUnread,
  canSelectBetween,
  onSelectAllExcept,
  onSelectBetween,
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
          {t('selection.selected', { count })}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{t('selection.ofN', { count, total })}</Text>
      </View>

      <View style={[styles.tools, { borderTopColor: theme.outline }]}>
        <Chip theme={theme} icon="checkmark-done-outline" label={t('selection.selectAll')} onPress={onToggleAll} />
        <Chip theme={theme} icon="remove-circle-outline" label={t('selection.selectAllExcept')} onPress={onSelectAllExcept} />
        {canSelectBetween ? (
          <Chip theme={theme} icon="git-commit-outline" label={t('selection.selectBetween')} onPress={onSelectBetween} />
        ) : null}
      </View>

      <View style={[styles.actions, { borderTopColor: theme.outline }]}>
        <Act icon="arrow-down-circle-outline" label={t('selection.download')} onPress={onDownload} disabled={none || !canDownload} />
        <Act icon="trash-outline" label={t('selection.removeDownload')} onPress={onRemoveDownload} disabled={none || !canRemoveDownload} />
        <Act icon="eye-outline" label={t('selection.markRead')} onPress={onMarkRead} disabled={none || !canMarkRead} />
        <Act icon="eye-off-outline" label={t('selection.markUnread')} onPress={onMarkUnread} disabled={none || !canMarkUnread} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, borderBottomWidth: 1, elevation: 4, zIndex: 10 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 2 },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 32, borderRadius: RADIUS.pill },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderTopWidth: 1 },
  act: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
});

export default memo(SelectionBar);
