import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import NovelCard from '../../components/NovelCard';
import { Button, EmptyState, Field, IconButton, ScreenHeader } from '../../components/MD3';

const GAP = 12;
const PADDING = 16;

export default function LibraryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const library = useStore((s) => s.library);
  const columns = useStore((s) => s.prefs.gridColumns);
  const setPref = useStore((s) => s.setPref);
  const refreshLibrary = useStore((s) => s.refreshLibrary);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshLibrary();
    }, [refreshLibrary]),
  );

  const cardWidth = (width - PADDING * 2 - GAP * (columns - 1)) / columns;
  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((n) => n.title.toLowerCase().includes(q));
  }, [library, query]);

  const unread = useMemo(() => library.reduce((sum, n) => sum + (n.unread || 0), 0), [library]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshLibrary();
    setRefreshing(false);
  }, [refreshLibrary]);

  const renderItem = useCallback(
    ({ item }) => <NovelCard novel={item} width={cardWidth} />,
    [cardWidth],
  );

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open) setQuery('');
      return !open;
    });
  }, []);

  const subtitle = library.length
    ? t('library.withUnread', { count: library.length, plural: library.length === 1 ? '' : 's', unread })
    : t('library.empty');

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title={t('nav.library')}
        subtitle={subtitle}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon={searchOpen ? 'close' : 'search'}
              color={theme.text}
              onPress={toggleSearch}
              accessibilityLabel={t('library.searchA11y')}
            />
            <IconButton
              icon="grid-outline"
              color={theme.text}
              onPress={() => setPref('gridColumns', columns >= 4 ? 2 : columns + 1)}
              accessibilityLabel={t('library.gridA11y')}
            />
          </View>
        }
      />

      {searchOpen ? (
        <View style={{ paddingHorizontal: PADDING, paddingBottom: 12 }}>
          <Field value={query} onChangeText={setQuery} placeholder={t('library.searchPlaceholder')} autoFocus />
        </View>
      ) : null}

      <FlatList
        data={data}
        key={`cols-${columns}`}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
        contentContainerStyle={{ paddingHorizontal: PADDING, paddingBottom: 32, gap: GAP, flexGrow: 1 }}
        renderItem={renderItem}
        removeClippedSubviews
        initialNumToRender={columns * 4}
        maxToRenderPerBatch={columns * 3}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={library.length ? 'search-outline' : 'library-outline'}
            title={library.length ? t('library.noMatches') : t('library.empty')}
            subtitle={
              library.length
                ? t('library.noMatches.subtitle')
                : t('library.empty.subtitle')
            }
            action={
              library.length ? null : <Button label={t('library.findNovels')} onPress={() => router.push('/(tabs)/catalogs')} />
            }
          />
        }
      />
    </View>
  );
}
