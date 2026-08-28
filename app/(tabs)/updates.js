import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { EmptyState, IconButton, ListHeading, ProgressBar, ScreenHeader } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import Cover from '../../components/Cover';
import { groupByDay, relativeTime } from '../../lib/time';
import { encodeNavParam } from '../../lib/navIds';
import { setPendingReader } from '../../lib/readerContext';
import { RADIUS } from '../../theme/theme';


function UpdateBanner({ theme, t, progress, summary, onStart }) {
  if (progress.running) {
    const pct = progress.total ? progress.current / progress.total : 0;
    return (
      <View style={{ marginHorizontal: 16, marginBottom: 14, padding: 16, borderRadius: RADIUS.lg, backgroundColor: theme.surface1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, marginLeft: 10 }}>
            {t('updates.updating')}
          </Text>
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>
          {t('updates.checkingProgress', { current: progress.current, total: progress.total })}
        </Text>
        {progress.novelTitle ? (
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13.5, fontWeight: '600', marginBottom: 10 }}>
            {progress.novelTitle}
          </Text>
        ) : null}
        <ProgressBar value={pct} />
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14, padding: 16, borderRadius: RADIUS.lg, backgroundColor: theme.surface1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{t('updates.updateLibrary')}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 4 }}>
            {summary?.lastUpdateAt
              ? t('updates.lastChecked', { time: relativeTime(summary.lastUpdateAt) })
              : t('updates.neverChecked')}
          </Text>
        </View>
        <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
          <Ripple onPress={onStart}>
            <View
              style={{
                paddingHorizontal: 18,
                height: 40,
                borderRadius: RADIUS.pill,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Ionicons name="refresh" size={16} color={theme.onPrimary} />
              <Text style={{ color: theme.onPrimary, fontWeight: '800', fontSize: 13, marginLeft: 6 }}>
                {t('updates.updateLibrary')}
              </Text>
            </View>
          </Ripple>
        </View>
      </View>

      {summary && (summary.checked > 0 || summary.failed?.length) ? (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: theme.outline }}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
            {t('updates.summaryLine', { checked: summary.checked, updated: summary.updated, newChapters: summary.newChapters })}
          </Text>
          {summary.failed?.length ? (
            <Text style={{ color: theme.error, fontSize: 12, marginTop: 6 }}>
              {t('updates.summaryFailed', { count: summary.failed.length })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const INTERVAL_OPTIONS = ['never', '6h', '12h', 'daily'];

function AutoUpdateSection({ theme, t, interval, onChange, disabled }) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14, padding: 16, borderRadius: RADIUS.lg, backgroundColor: theme.surface1, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>
        {t('settingsNotifications.autoUpdate')}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 12.5, marginBottom: 12 }}>
        {t('settingsNotifications.autoUpdateSubtitle')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {INTERVAL_OPTIONS.map((opt) => {
          const selected = (interval ?? 'never') === opt;
          return (
            <View key={opt} style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
              <Ripple onPress={() => !disabled && onChange(opt)}>
                <View
                  style={{
                    paddingHorizontal: 14,
                    height: 34,
                    borderRadius: RADIUS.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? theme.primary : theme.surface2,
                  }}
                >
                  <Text style={{ color: selected ? theme.onPrimary : theme.text, fontSize: 12.5, fontWeight: '700' }}>
                    {t(`settingsNotifications.interval.${opt}`)}
                  </Text>
                </View>
              </Ripple>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function UpdatesScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const updates = useStore((s) => s.updates);
  const refreshUpdates = useStore((s) => s.refreshUpdates);
  const updateProgress = useStore((s) => s.updateProgress);
  const updateSummary = useStore((s) => s.updateSummary);
  const runLibraryUpdate = useStore((s) => s.runLibraryUpdate);
  const [refreshing, setRefreshing] = useState(false);
  const autoUpdateInterval = useStore((s) => s.prefs.autoUpdateInterval);
  const setPref = useStore((s) => s.setPref);
  const notificationsEnabled = useStore((s) => s.prefs.notificationsEnabled);

  useFocusEffect(
    useCallback(() => {
      refreshUpdates();
    }, [refreshUpdates]),
  );

  const rows = useMemo(() => groupByDay(updates, (u) => u.updatedAt), [updates]);
  const unread = useMemo(() => updates.filter((u) => !u.read).length, [updates]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshUpdates();
    setRefreshing(false);
  }, [refreshUpdates]);

  const onStartUpdate = useCallback(() => {
    runLibraryUpdate();
  }, [runLibraryUpdate]);

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === 'header') return <ListHeading label={item.label} />;
      const update = item.row;
      return (
        <Ripple
          onPress={() => {
            setPendingReader({
              id: update.id,
              name: update.name,
              novelId: update.novelId,
              novelTitle: update.novelTitle,
            });
            router.push(`/reader/${encodeNavParam(update.id)}`);
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
            <Cover uri={update.novelCover} title={update.novelTitle} width={50} height={72} radius={RADIUS.md} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: 14 }}>
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 14.5 }}>
                {update.novelTitle}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: update.read ? theme.textMuted : theme.text,
                  fontSize: 13,
                  marginTop: 3,
                  fontWeight: update.read ? '500' : '600',
                }}
              >
                {update.name}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11.5, marginTop: 4 }}>
                {update.releaseTime || relativeTime(update.updatedAt)}
              </Text>
            </View>
            {update.read ? null : (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary, marginLeft: 8 }} />
            )}
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 8 }} />
          </View>
        </Ripple>
      );
    },
    [router, theme],
  );

  const subtitle = updates.length
    ? t('updates.count', { count: updates.length, plural: updates.length === 1 ? '' : 's', unread, unreadPlural: unread === 1 ? '' : 's' })
    : t('updates.empty');

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title={t('nav.updates')}
        subtitle={subtitle}
        right={
          <IconButton
            icon="download-outline"
            color={theme.text}
            onPress={() => router.push('/downloads')}
            accessibilityLabel={t('downloads.title')}
          />
        }
      />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
        ListHeaderComponent={
          <>
            <UpdateBanner theme={theme} t={t} progress={updateProgress} summary={updateSummary} onStart={onStartUpdate} />
            <AutoUpdateSection
              theme={theme}
              t={t}
              interval={autoUpdateInterval}
              onChange={(v) => setPref('autoUpdateInterval', v)}
              disabled={!notificationsEnabled}
            />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title={t('updates.empty')}
            subtitle={t('updates.empty.subtitle')}
          />
        }
      />
    </View>
  );
}
