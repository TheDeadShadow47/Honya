import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { loadPlugin, pluginApi } from '../../lib/pluginEngine';
import { decodeNavParam } from '../../lib/navIds';
import { upsertNovel } from '../../db/database';
import { Button, Chip, EmptyState, Field } from '../../components/MD3';
import NovelCard from '../../components/NovelCard';

const GAP = 12;
const PADDING = 16;

export default function BrowsePluginScreen() {
  const { pluginId } = useLocalSearchParams();
  const id = decodeNavParam(pluginId);
  const theme = useAppTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const record = useStore((s) => s.installedExtensions[id]);
  const columns = useStore((s) => s.prefs.gridColumns);

  const [mode, setMode] = useState('popular');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const instance = useMemo(() => {
    if (!record) return null;
    try {
      return loadPlugin(record);
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [record]);

  useEffect(() => {
    navigation.setOptions({ title: record?.name ?? t('browse.title') });
  }, [navigation, record?.name, t]);

  const load = useCallback(
    async (nextPage, replace) => {
      if (!instance) return;
      setLoading(true);
      setError(null);
      try {
        const raw =
          mode === 'search' && query.trim()
            ? await pluginApi.search(instance, query.trim(), nextPage)
            : mode === 'latest'
              ? await pluginApi.latest(instance, nextPage)
              : await pluginApi.popular(instance, nextPage);

        const mapped = (Array.isArray(raw) ? raw : []).map((n) => ({
          id: `${id}::${n.path ?? n.url ?? n.name}`,
          pluginId: id,
          path: n.path ?? n.url,
          title: n.name ?? n.title ?? 'Untitled',
          cover: n.cover ?? n.coverUrl ?? null,
        }));

        await Promise.all(mapped.map((n) => upsertNovel({ ...n, inLibrary: false })));
        setItems((prev) => (replace ? mapped : [...prev, ...mapped]));
        setPage(nextPage);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [instance, mode, query, id],
  );

  useEffect(() => {
    if (instance && mode !== 'search') load(1, true);
  }, [instance, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!record) {
    return (
      <EmptyState
        icon="apps-outline"
        title={t('browse.notInstalledTitle')}
        subtitle={t('browse.notInstalledSubtitle')}
        action={<Button label={t('browse.openExtensions')} onPress={() => router.push('/settings/extensions')} />}
      />
    );
  }

  const cardWidth = (width - PADDING * 2 - GAP * (columns - 1)) / columns;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: PADDING, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row' }}>
          <Chip label={t('browse.modePopular')} selected={mode === 'popular'} onPress={() => setMode('popular')} />
          <Chip label={t('browse.modeLatest')} selected={mode === 'latest'} onPress={() => setMode('latest')} />
          <Chip label={t('browse.modeSearch')} selected={mode === 'search'} onPress={() => setMode('search')} />
        </View>
        {mode === 'search' ? (
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder={t('browse.searchPlaceholder')}
            returnKeyType="search"
            onSubmitEditing={() => load(1, true)}
          />
        ) : null}
        {mode === 'search' ? (
          <Button label={t('browse.searchAction')} icon={<Ionicons name="search" size={15} color={theme.onPrimary} />} onPress={() => load(1, true)} />
        ) : null}
        {error ? <Text style={{ color: theme.error, fontSize: 12.5 }}>{error}</Text> : null}
      </View>

      <FlatList
        data={items}
        key={`cols-${columns}`}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
        contentContainerStyle={{ padding: PADDING, gap: GAP, flexGrow: 1 }}
        renderItem={({ item }) => <NovelCard novel={item} width={cardWidth} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => !loading && mode !== 'search' && load(page + 1, false)}
        ListFooterComponent={loading ? <ActivityIndicator color={theme.primary} style={{ marginTop: 16 }} /> : null}
        ListEmptyComponent={
          loading ? null : <EmptyState title={t('browse.emptyTitle')} subtitle={t('browse.emptySubtitle')} />
        }
      />
    </View>
  );
}
