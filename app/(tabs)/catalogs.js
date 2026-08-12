import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { upsertNovel } from '../../db/database';
import { Button, EmptyState, ScreenHeader, SearchBar, SectionLabel, SkeletonList } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';

const DEBOUNCE_MS = 450;

const SourceRow = memo(function SourceRow({ ext, onPress }) {
  const theme = useAppTheme();
  return (
    <Ripple onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 14,
          backgroundColor: theme.surface1,
          borderRadius: RADIUS.lg,
          marginBottom: 10,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: RADIUS.md,
            backgroundColor: theme.surface3,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {ext.iconUrl ? (
            <Image source={{ uri: ext.iconUrl }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Text style={{ color: theme.textMuted, fontWeight: '800' }}>{ext.name.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 14.5 }}>
            {ext.name}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            {ext.lang} · v{ext.version}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={theme.textMuted} />
      </View>
    </Ripple>
  );
});

const SearchResultRow = memo(function SearchResultRow({ item, onPress }) {
  const theme = useAppTheme();
  return (
    <Ripple onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 }}>
        <View style={{ width: 42, height: 60, borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: theme.surface2 }}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : null}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={2} style={{ color: theme.text, fontWeight: '700', fontSize: 14, lineHeight: 18 }}>
            {item.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: RADIUS.sm,
                backgroundColor: theme.secondaryContainer,
              }}
            >
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>{item.sourceName}</Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 8 }} />
      </View>
    </Ripple>
  );
});

export default function CatalogsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const installedExtensions = useStore((s) => s.installedExtensions);
  const globalSearch = useStore((s) => s.globalSearch);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const requestRef = useRef(0);
  const debounceRef = useRef(null);

  const sources = useMemo(
    () => Object.values(installedExtensions).sort((a, b) => a.name.localeCompare(b.name)),
    [installedExtensions],
  );

  const runSearch = useCallback(
    async (q) => {
      const clean = q.trim();
      if (!clean) {
        requestRef.current += 1;
        setResults([]);
        setHasSearched(false);
        setIsSearching(false);
        setErrorCount(0);
        return;
      }
      const req = ++requestRef.current;
      setIsSearching(true);
      try {
        const { results: r, errors } = await globalSearch(clean);
        if (req !== requestRef.current) return;
        setResults(r);
        setHasSearched(true);
        setErrorCount(errors.length);
      } catch (e) {
        if (req !== requestRef.current) return;
        setResults([]);
        setHasSearched(true);
        setErrorCount(1);
      } finally {
        if (req === requestRef.current) setIsSearching(false);
      }
    },
    [globalSearch],
  );

  const onChangeText = useCallback((t) => {
    setQuery(t);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(t), DEBOUNCE_MS);
  }, [runSearch]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const clearSearch = useCallback(() => {
    requestRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setIsSearching(false);
    setErrorCount(0);
  }, []);

  const openResult = useCallback(
    async (item) => {
      try {
        await upsertNovel({ ...item, inLibrary: false });
      } catch {}
      router.push(`/novel/${encodeURIComponent(item.id)}`);
    },
    [router],
  );

  const activeQuery = query.trim();

  let body;
  if (!sources.length) {
    body = (
      <EmptyState
        icon="apps-outline"
        title="No sources installed"
        subtitle="Install a source from More to search for novels across every installed source."
        action={<Button label="Manage sources" onPress={() => router.push('/settings/extensions')} />}
      />
    );
  } else if (isSearching) {
    body = (
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textMuted, fontSize: 12.5, paddingHorizontal: 16, paddingBottom: 10 }}>
          Searching {sources.length} {sources.length === 1 ? 'source' : 'sources'}…
        </Text>
        <SkeletonList count={6} />
      </View>
    );
  } else if (hasSearched) {
    body = (
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <SearchResultRow item={item} onPress={() => openResult(item)} />}
        ListHeaderComponent={
          errorCount > 0 ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
              {errorCount} {errorCount === 1 ? 'source' : 'sources'} did not respond. Showing results from the rest.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="No results found"
            subtitle={`Nothing matched "${activeQuery}". Try a different title or fewer words.`}
            action={<Button label="Search again" variant="tonal" onPress={() => runSearch(query)} />}
          />
        }
      />
    );
  } else {
    body = (
      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <SectionLabel>Browse sources</SectionLabel>
            <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
              Search above to look across every installed source, or open a source to browse its catalog.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <SourceRow ext={item} onPress={() => router.push(`/browse/${encodeURIComponent(item.id)}`)} />
        )}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title="Catalogs"
        subtitle={
          sources.length
            ? `${sources.length} source${sources.length === 1 ? '' : 's'} installed`
            : 'No sources installed yet'
        }
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10 }}>
        <SearchBar
          value={query}
          onChangeText={onChangeText}
          onClear={clearSearch}
          onSubmit={() => runSearch(query)}
          placeholder={sources.length ? 'Search all sources' : 'Search'}
          autoFocus={false}
        />
      </View>
      {body}
    </View>
  );
}
