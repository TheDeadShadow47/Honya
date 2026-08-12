import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Button, Chip, Dialog, EmptyState, Field, SectionLabel } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';

function ExtensionRow({ meta, installedVersion, busy, onInstall, onUninstall, onOpen }) {
  const theme = useAppTheme();
  const installed = installedVersion != null;
  const updatable = installed && installedVersion !== meta.version;

  return (
    <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: 8 }}>
      <Ripple onPress={installed ? onOpen : onInstall}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            backgroundColor: theme.surface1,
            borderRadius: RADIUS.lg,
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
            {meta.iconUrl ? (
              <Image source={{ uri: meta.iconUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ color: theme.textMuted, fontWeight: '800' }}>{meta.name.slice(0, 1).toUpperCase()}</Text>
            )}
          </View>

          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 14.5 }}>
              {meta.name}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
              {meta.lang} · v{meta.version}
              {updatable ? `  (installed v${installedVersion})` : ''}
            </Text>
          </View>

          {busy ? (
            <ActivityIndicator color={theme.primary} />
          ) : installed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {updatable ? <Button label="Update" variant="tonal" onPress={onInstall} /> : null}
              <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
                <Ripple onPress={onUninstall} borderless>
                  <View style={{ padding: 8 }}>
                    <Ionicons name="trash-outline" size={19} color={theme.error} />
                  </View>
                </Ripple>
              </View>
            </View>
          ) : (
            <Button label="Install" onPress={onInstall} />
          )}
        </View>
      </Ripple>
    </View>
  );
}

export default function ExtensionsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const {
    userRepositories,
    repoCatalog,
    repoLoading,
    repoError,
    installedExtensions,
    addRepository,
    refreshRepositories,
    installExtension,
    uninstallExtension,
  } = useStore();

  const [tab, setTab] = useState('installed');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [repoInput, setRepoInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (userRepositories.length) refreshRepositories();
  }, [userRepositories.length, refreshRepositories]);

  const available = useMemo(() => {
    const flat = Object.values(repoCatalog).flat();
    const q = search.trim().toLowerCase();
    return flat
      .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.lang).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [repoCatalog, search]);

  const installedList = useMemo(
    () => Object.values(installedExtensions).sort((a, b) => a.name.localeCompare(b.name)),
    [installedExtensions],
  );

  const handleAddRepo = async () => {
    setAdding(true);
    try {
      await addRepository(repoInput);
      setDialogOpen(false);
      setRepoInput('');
    } catch (e) {
      Alert.alert('Could not add repository', e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleInstall = useCallback(
    async (meta) => {
      setBusyId(meta.id);
      try {
        await installExtension(meta);
      } catch (e) {
        Alert.alert('Install failed', e.message);
      } finally {
        setBusyId(null);
      }
    },
    [installExtension],
  );

  const handleUninstall = useCallback(
    (id, name) => {
      Alert.alert('Uninstall extension', `Remove "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Uninstall', style: 'destructive', onPress: () => uninstallExtension(id) },
      ]);
    },
    [uninstallExtension],
  );

  const listData = tab === 'available' ? available : installedList;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        {tab === 'available' && !userRepositories.length ? (
          <View
            style={{
              backgroundColor: theme.secondaryContainer,
              borderRadius: RADIUS.md,
              padding: 12,
              marginBottom: 2,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>
              No repositories added yet. Add a plugin list URL to see the sources it offers.
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row' }}>
          <Chip
            label={`Installed (${installedList.length})`}
            selected={tab === 'installed'}
            onPress={() => setTab('installed')}
            icon="checkmark-circle"
          />
          <Chip
            label={`Available (${available.length})`}
            selected={tab === 'available'}
            onPress={() => setTab('available')}
            icon="download"
          />
        </View>

        {tab === 'available' && userRepositories.length > 0 ? (
          <Field value={search} onChangeText={setSearch} placeholder="Search extensions" />
        ) : null}

        {repoError ? <Text style={{ color: theme.error, fontSize: 12, lineHeight: 17 }}>{repoError}</Text> : null}
      </View>

      {repoLoading && tab === 'available' ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : null}

      <FlatList
        data={listData}
        keyExtractor={(item) => `${tab}-${item.id}`}
        contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ExtensionRow
            meta={item}
            installedVersion={installedExtensions[item.id]?.version ?? null}
            busy={busyId === item.id}
            onInstall={() => handleInstall(item)}
            onUninstall={() => handleUninstall(item.id, item.name)}
            onOpen={() => router.push(`/browse/${encodeURIComponent(item.id)}`)}
          />
        )}
        ListHeaderComponent={
          tab === 'available' && userRepositories.length > 0 ? (
            <View style={{ marginBottom: 10 }}>
              <SectionLabel>From your repositories</SectionLabel>
            </View>
          ) : null
        }
        ListEmptyComponent={
          repoLoading ? null : tab === 'available' ? (
            <EmptyState
              icon="server-outline"
              title={
                userRepositories.length
                  ? 'Nothing found in your repositories'
                  : 'No repositories added'
              }
              subtitle={
                userRepositories.length
                  ? 'This repository does not offer anything matching your search.'
                  : 'Add a plugin repository URL to see the sources it offers. Nothing is bundled with the app.'
              }
              action={
                !userRepositories.length ? (
                  <Button label="Add repository" onPress={() => setDialogOpen(true)} />
                ) : null
              }
            />
          ) : (
            <EmptyState
              icon="apps-outline"
              title="No extensions installed"
              subtitle="Install a source from the Available tab to start browsing novels."
              action={
                userRepositories.length ? (
                  <Button label="See available sources" onPress={() => setTab('available')} />
                ) : null
              }
            />
          )
        }
      />

      <Dialog visible={dialogOpen} title="Add plugin repository" onDismiss={() => setDialogOpen(false)}>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 19 }}>
          Paste the URL of a plugin list (JSON). Sources are fetched from this URL only when you install them.
        </Text>
        <Field value={repoInput} onChangeText={setRepoInput} placeholder="https://…/plugins.min.json" multiline autoFocus />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Button label="Cancel" variant="text" onPress={() => setDialogOpen(false)} />
          <Button label="Add" loading={adding} onPress={handleAddRepo} />
        </View>
      </Dialog>
    </View>
  );
}
