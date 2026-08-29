import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import HistoryRow from '../../components/HistoryRow';
import { encodeNavParam } from '../../lib/navIds';
import { setPendingReader } from '../../lib/readerContext';
import { Button, EmptyState, Field, IconButton, ListHeading, ScreenHeader } from '../../components/MD3';
import { groupByDay } from '../../lib/time';

export default function HistoryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
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
    (item) => {
      setPendingReader({
        id: item.id,
        name: item.name,
        novelId: item.novelId,
        novelTitle: item.novelTitle,
      });
      router.push(`/reader/${encodeNavParam(item.id)}`);
    },
    [router],
  );

  const confirmRemove = useCallback(
    (item) => {
      Alert.alert(t('history.removeConfirm'), '', [
        { text: t('more.resetCancel'), style: 'cancel' },
        {
          text: t('history.removeOpenNovel'),
          onPress: () => router.push(`/novel/${encodeNavParam(item.novelId)}`),
        },
        {
          text: t('history.remove'),
          style: 'destructive',
          onPress: () => removeHistoryEntry(item.id),
        },
      ]);
    },
    [removeHistoryEntry, router, t],
  );

  const confirmClear = useCallback(() => {
    Alert.alert(t('history.clearTitle'), t('history.clearSubtitle'), [
      { text: t('more.resetCancel'), style: 'cancel' },
      { text: t('history.clear'), style: 'destructive', onPress: () => clearHistory() },
    ]);
  }, [clearHistory, t]);

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

  const subtitle = history.length
    ? t('history.count', { count: history.length, plural: history.length === 1 ? '' : 's' })
    : t('history.hint');

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title={t('nav.history')}
        subtitle={subtitle}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon={searchOpen ? 'close' : 'search'}
              onPress={toggleSearch}
              accessibilityLabel={t('history.searchA11y')}
            />
            <IconButton
              icon="trash-outline"
              onPress={confirmClear}
              disabled={history.length === 0}
              accessibilityLabel={t('history.clearA11y')}
            />
          </View>
        }
      />

      {searchOpen ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Field value={query} onChangeText={setQuery} placeholder={t('history.searchPlaceholder')} autoFocus />
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
            title={history.length ? t('history.noMatches') : t('history.empty')}
            subtitle={
              history.length
                ? t('history.noMatches.subtitle')
                : t('history.empty.subtitle')
            }
            action={history.length ? null : <Button label={t('history.goToLibrary')} onPress={() => router.push('/(tabs)')} />}
          />
        }
      />
    </View>
  );
}
