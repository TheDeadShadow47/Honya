import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { EmptyState, ListHeading, ScreenHeader } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import Cover from '../../components/Cover';
import { groupByDay, relativeTime } from '../../lib/time';
import { RADIUS } from '../../theme/theme';

export default function UpdatesScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const updates = useStore((s) => s.updates);
  const refreshUpdates = useStore((s) => s.refreshUpdates);
  const [refreshing, setRefreshing] = useState(false);

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

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === 'header') return <ListHeading label={item.label} />;
      const update = item.row;
      return (
        <Ripple onPress={() => router.push(`/reader/${encodeURIComponent(update.id)}`)}>
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title="Updates"
        subtitle={updates.length ? `${updates.length} recent chapters · ${unread} unread` : 'New chapters land here'}
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
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="No updates yet"
            subtitle="Chapters from novels in your library will show up here after you refresh a novel."
          />
        }
      />
    </View>
  );
}
