import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import HistoryRow from '../../components/HistoryRow';
import { Button, EmptyState, Field, IconButton, ListHeading, ScreenHeader } from '../../components/MD3';
import { groupByDay } from '../../lib/time';

/**
 * Reading history.
 *
 * Everything here is derived from the existing chapters table, so resuming a
 * chapter simply pushes the normal reader route — the reader restores scroll
 * position from the chapter's stored progress exactly as it does elsewhere.
 */
export default function HistoryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const history = useStore((s) => s.history);
  const refreshHistory = useStore((s) => s.refreshHistory);
  const removeHistoryEntry = useStore((s) => s.removeHistoryEntry);
  const clearHistory = useStore((s) => s.clearHistory);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshHistory();
    }, [refreshHistory]),
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? history.filter(
          (h) =>
            (h.novelTitle ?? '').toLowerCase().includes(q) || (h.name ?? '').toLowerCase().includes(q),
        )
      : history;
    return groupByDay(filtered, (item) => item.lastReadAt);
  }, [history, query]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshHistory();
    setRefreshing(false);
  }, [refreshHistory]);

  const openChapter = useCallback(
    (item) => router.push(`/reader/${encodeURIComponent(item.id)}`),
    [router],
  );

  const confirmRemove = useCallback(
    (item) => {
      Alert.alert(item.name ?? 'Chapter', 'Remove this from your history?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open novel',
          onPress: () => router.push(`/novel/${encodeURIComponent(item.novelId)}`),
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeHistoryEntry(item.id),
        },
      ]);
    },
    [removeHistoryEntry, router],
  );

  const confirmClear = useCallback(() => {
    Alert.alert('Clear history?', 'Your reading progress and downloads are kept — only this list is cleared.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearHistory() },
    ]);
  }, [clearHistory]);

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open) setQuery('');
      return !open;
    });
  }, []);

  const renderItem = useCallback(
    ({ item }) =>
      item.type === 'header' ? (
        <ListHeading label={item.label} />
      ) : (
        <HistoryRow
          item={item.row}
          onPress={() => openChapter(item.row)}
          onLongPress={() => confirmRemove(item.row)}
        />
      ),
    [openChapter, confirmRemove],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title="History"
        subtitle={history.length ? `${history.length} recently read chapter${history.length === 1 ? '' : 's'}` : 'Pick up where you left off'}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon={searchOpen ? 'close' : 'search'}
              onPress={toggleSearch}
              accessibilityLabel="Search history"
            />
            <IconButton
              icon="trash-outline"
              onPress={confirmClear}
              disabled={history.length === 0}
              accessibilityLabel="Clear history"
            />
          </View>
        }
      />

      {searchOpen ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Field value={query} onChangeText={setQuery} placeholder="Search history" autoFocus />
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={history.length ? 'search-outline' : 'time-outline'}
            title={history.length ? 'No matches' : 'Nothing read yet'}
            subtitle={
              history.length
                ? 'No chapter in your history matches that search.'
                : 'Chapters you open show up here so you can jump straight back into them.'
            }
            action={history.length ? null : <Button label="Go to library" onPress={() => router.push('/(tabs)')} />}
          />
        }
      />
    </View>
  );
}
