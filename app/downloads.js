import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { EmptyState, IconButton, ListHeading } from '../components/MD3';
import Ripple from '../components/Ripple';
import Cover from '../components/Cover';
import { RADIUS, alpha } from '../theme/theme';

const Row = memo(function Row({ theme, t, item, status, batchTotal, batchDone, onCancel }) {
  const subtitle =
    status === 'downloading'
      ? batchTotal > 1
        ? t('downloads.progressOf', { current: batchDone + 1, total: batchTotal })
        : t('downloads.downloading')
      : status === 'queued'
        ? t('downloads.queued')
        : status === 'failed'
          ? item.error || t('downloads.failed')
          : t('downloads.completed');

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
      <Cover uri={item.novelCover} title={item.novelTitle} width={44} height={62} radius={RADIUS.sm} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 14 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>
          {item.novelTitle}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }}>
          {item.chapterName}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: status === 'failed' ? theme.error : status === 'completed' ? theme.primary : theme.textMuted,
            fontSize: 11.5,
            marginTop: 3,
            fontWeight: '600',
          }}
        >
          {subtitle}
        </Text>
      </View>
      {status === 'downloading' ? (
        <ActivityIndicator size="small" color={theme.primary} />
      ) : status === 'queued' || status === 'failed' ? (
        <IconButton icon="close" onPress={() => onCancel?.(item)} accessibilityLabel={t('downloads.cancel')} />
      ) : (
        <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
      )}
    </View>
  );
});

function ControlChip({ theme, icon, label, onPress, tone }) {
  return (
    <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
      <Ripple onPress={onPress}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            height: 36,
            borderRadius: RADIUS.pill,
            backgroundColor: tone === 'error' ? alpha(theme.error, 0.12) : theme.surface1,
          }}
        >
          <Ionicons name={icon} size={15} color={tone === 'error' ? theme.error : theme.text} />
          <Text
            style={{
              color: tone === 'error' ? theme.error : theme.text,
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

export default function DownloadsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const state = useStore((s) => s.downloadQueueState);
  const cancelDownload = useStore((s) => s.cancelDownload);
  const cancelAllQueuedDownloads = useStore((s) => s.cancelAllQueuedDownloads);
  const pauseDownloadQueue = useStore((s) => s.pauseDownloadQueue);
  const resumeDownloadQueue = useStore((s) => s.resumeDownloadQueue);
  const retryFailedDownloads = useStore((s) => s.retryFailedDownloads);
  const clearCompletedDownloads = useStore((s) => s.clearCompletedDownloads);
  const clearFailedDownloads = useStore((s) => s.clearFailedDownloads);

  const { downloading, queued, failed, completed, paused, batchTotal, batchDone } = state;
  const hasActive = downloading.length > 0 || queued.length > 0;

  const rows = useMemo(() => {
    const out = [];
    const section = (label, list, status) => {
      if (!list.length) return;
      out.push({ type: 'header', id: `h-${status}`, label: `${label} · ${list.length}`, status });
      list.forEach((item) => out.push({ type: 'item', id: item.chapterId, item, status }));
    };
    section(t('downloads.sectionDownloading'), downloading, 'downloading');
    section(t('downloads.sectionQueued'), queued, 'queued');
    section(t('downloads.sectionFailed'), failed, 'failed');
    section(t('downloads.sectionCompleted'), completed, 'completed');
    return out;
  }, [downloading, queued, failed, completed, t]);

  const onCancel = useCallback((item) => cancelDownload(item.chapterId), [cancelDownload]);

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === 'header') return <ListHeading label={item.label} />;
      return (
        <Row
          theme={theme}
          t={t}
          item={item.item}
          status={item.status}
          batchTotal={batchTotal}
          batchDone={batchDone}
          onCancel={onCancel}
        />
      );
    },
    [theme, t, batchTotal, batchDone, onCancel],
  );

  const controls = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
      {hasActive ? (
        <ControlChip
          theme={theme}
          icon={paused ? 'play' : 'pause'}
          label={paused ? t('downloads.resume') : t('downloads.pause')}
          onPress={paused ? resumeDownloadQueue : pauseDownloadQueue}
        />
      ) : null}
      {queued.length ? (
        <ControlChip theme={theme} icon="close-circle-outline" label={t('downloads.cancelAll')} onPress={cancelAllQueuedDownloads} tone="error" />
      ) : null}
      {failed.length ? (
        <ControlChip theme={theme} icon="refresh" label={t('downloads.retryAll')} onPress={retryFailedDownloads} />
      ) : null}
      {failed.length ? (
        <ControlChip theme={theme} icon="trash-outline" label={t('downloads.clearFailed')} onPress={clearFailedDownloads} tone="error" />
      ) : null}
      {completed.length ? (
        <ControlChip theme={theme} icon="checkmark-done-outline" label={t('downloads.clearCompleted')} onPress={clearCompletedDownloads} />
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={{ color: theme.textMuted, fontSize: 12.5 }}>
          {hasActive ? t('downloads.activeSubtitle', { count: downloading.length + queued.length, plural: (downloading.length + queued.length) === 1 ? '' : 's' }) : t('downloads.idleSubtitle')}
        </Text>
      </View>

      {rows.length ? controls : null}

      {paused && hasActive ? (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            padding: 12,
            borderRadius: RADIUS.md,
            backgroundColor: alpha(theme.primary, 0.12),
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="pause-circle-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 12.5, marginLeft: 8, flex: 1 }}>{t('downloads.pausedHint')}</Text>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, flexGrow: 1 }}
        removeClippedSubviews
        initialNumToRender={16}
        maxToRenderPerBatch={12}
        windowSize={9}
        ListEmptyComponent={<EmptyState icon="download-outline" title={t('downloads.empty')} subtitle={t('downloads.empty.subtitle')} />}
      />
    </View>
  );
}
