import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { migrateNovel } from '../../lib/migrate';
import { decodeNavParam } from '../../lib/navIds';
import * as db from '../../db/database';
import { Button, EmptyState, SearchBar } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';

const DEBOUNCE_MS = 450;

export default function MigrateScreen() {
  const { id } = useLocalSearchParams();
  const sourceId = decodeNavParam(id);
  const theme = useAppTheme();
  const router = useRouter();

  const installedExtensions = useStore((s) => s.installedExtensions);
  const globalSearch = useStore((s) => s.globalSearch);
  const refreshLibrary = useStore((s) => s.refreshLibrary);
  const refreshUpdates = useStore((s) => s.refreshUpdates);

  const [source, setSource] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [migratingId, setMigratingId] = useState(null);
  const debounceRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    (async () => {
      setSource(await db.getNovel(sourceId));
    })();
  }, [sourceId]);

  const runSearch = useCallback(
    async (q) => {
      const clean = q.trim();
      if (!clean) {
        requestRef.current += 1;
        setResults([]);
        setHasSearched(false);
        setSearching(false);
        return;
      }
      const req = ++requestRef.current;
      setSearching(true);
      try {
        const { results: r } = await globalSearch(clean);
        if (req !== requestRef.current) return;
        const filtered = source ? r.filter((x) => x.pluginId !== source.pluginId) : r;
        setResults(filtered);
        setHasSearched(true);
      } catch {
        if (req !== requestRef.current) return;
        setResults([]);
        setHasSearched(true);
      } finally {
        if (req === requestRef.current) setSearching(false);
      }
    },
    [globalSearch, source],
  );

  const onChangeText = useCallback(
    (t) => {
      setQuery(t);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(t), DEBOUNCE_MS);
    },
    [runSearch],
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const onPick = useCallback(
    (item) => {
      Alert.alert(
        'Migrate novel',
        `Move "${source?.title}" to ${item.sourceName}?\n\nRead progress and downloads are kept for chapters that match by name. The original source entry will be removed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Migrate',
            onPress: async () => {
              setMigratingId(item.id);
              try {
                await migrateNovel(source, item, installedExtensions);
                await refreshLibrary();
                await refreshUpdates();
                Alert.alert('Migration complete', `This novel now comes from ${item.sourceName}.`, [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              } catch (e) {
                Alert.alert('Migration failed', e.message);
              } finally {
                setMigratingId(null);
              }
            },
          },
        ],
      );
    },
    [source, installedExtensions, refreshLibrary, refreshUpdates, router],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
        <SearchBar
          value={query}
          onChangeText={onChangeText}
          onClear={() => {
            requestRef.current += 1;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setQuery('');
            setResults([]);
            setHasSearched(false);
            setSearching(false);
          }}
          onSubmit={() => runSearch(query)}
          placeholder={source ? `Search other sources for "${source.title}"` : 'Search other sources'}
        />
      </View>

      {!source ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : searching ? (
        <Text style={{ color: theme.textMuted, fontSize: 12.5, paddingHorizontal: 16, paddingBottom: 10 }}>
          Searching all installed sources…
        </Text>
      ) : hasSearched ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const migrating = migratingId === item.id;
            return (
              <Ripple onPress={() => !migrating && onPick(item)} disabled={migrating}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 }}>
                  <View
                    style={{ width: 42, height: 60, borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: theme.surface2 }}
                  >
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
                  {migrating ? (
                    <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 8 }} />
                  ) : (
                    <Ionicons name="git-compare-outline" size={17} color={theme.textMuted} style={{ marginLeft: 8 }} />
                  )}
                </View>
              </Ripple>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No matches on other sources"
              subtitle={`Nothing matched "${query.trim()}" on another installed source. Try a different title.`}
              action={<Button label="Search again" variant="tonal" onPress={() => runSearch(query)} />}
            />
          }
        />
      ) : (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
            Search every installed source to find this novel elsewhere. Choose a result to move your library entry,
            read progress, and downloads to that source.
          </Text>
        </View>
      )}
    </View>
  );
}
