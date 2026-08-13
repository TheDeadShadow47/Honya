import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { Button, Chip, Dialog, EmptyState, Field, SectionLabel } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';

function ExtensionRow({ meta, installedVersion, busy, onInstall, onUninstall, onOpen }) {
  const theme = useAppTheme();
  const { t } = useI18n();
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
              {updatable ? <Button label={t('more.resetAction')} variant="tonal" onPress={onInstall} /> : null}
              <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
                <Ripple onPress={onUninstall} borderless>
                  <View style={{ padding: 8 }}>
                    <Ionicons name="trash-outline" size={19} color={theme.error} />
                  </View>
                </Ripple>
              </View>
            </View>
          ) : (
            <Button label={t('settingsExtensions.install')} onPress={onInstall} />
          )}
        </View>
      </Ripple>
    </View>
  );
}

export default function ExtensionsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useI18n();
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
      Alert.alert(t('md3.somethingWentWrong'), e.message);
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
        Alert.alert(t('settingsExtensions.installFailed'), e.message);
      } finally {
        setBusyId(null);
      }
    },
    [installExtension, t],
  );

  const handleUninstall = useCallback(
    (id, name) => {
      Alert.alert(t('settingsExtensions.uninstallTitle'), t('settingsExtensions.uninstallConfirm', { name }), [
        { text: t('more.resetCancel'), style: 'cancel' },
        { text: t('settingsExtensions.uninstall'), style: 'destructive', onPress: () => uninstallExtension(id) },
      ]);
    },
    [uninstallExtension, t],
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
              {t('settingsExtensions.noReposHint')}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row' }}>
          <Chip
            label={`${t('settingsExtensions.installed')} (${installedList.length})`}
            selected={tab === 'installed'}
            onPress={() => setTab('installed')}
            icon="checkmark-circle"
          />
          <Chip
            label={`${t('settingsExtensions.available')} (${available.length})`}
            selected={tab === 'available'}
            onPress={() => setTab('available')}
            icon="download"
          />
        </View>

        {tab === 'available' && userRepositories.length > 0 ? (
          <Field value={search} onChangeText={setSearch} placeholder={t('settingsExtensions.search')} />
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
            onOpen={() => router.push(`/browse/${item.id}`)}
          />
        )}
        ListHeaderComponent={
          tab === 'available' && userRepositories.length > 0 ? (
            <View style={{ marginBottom: 10 }}>
              <SectionLabel>{t('settingsExtensions.fromRepos')}</SectionLabel>
            </View>
          ) : null
        }
        ListEmptyComponent={
          repoLoading ? null : tab === 'available' ? (
            <EmptyState
              icon="server-outline"
              title={
                userRepositories.length
                  ? t('settingsExtensions.nothingFound')
                  : t('settingsExtensions.noReposEmpty')
              }
              subtitle={
                userRepositories.length
                  ? t('settingsExtensions.nothingFoundSubtitle')
                  : t('settingsExtensions.noReposEmptySubtitle')
              }
              action={
                !userRepositories.length ? (
                  <Button label={t('settingsExtensions.addRepo')} onPress={() => setDialogOpen(true)} />
                ) : null
              }
            />
          ) : (
            <EmptyState
              icon="apps-outline"
              title={t('settingsExtensions.noExtensions')}
              subtitle={t('settingsExtensions.noExtensionsSubtitle')}
              action={
                userRepositories.length ? (
                  <Button label={t('settingsExtensions.seeAvailable')} onPress={() => setTab('available')} />
                ) : null
              }
            />
          )
        }
      />

      <Dialog visible={dialogOpen} title={t('settingsExtensions.addRepoTitle')} onDismiss={() => setDialogOpen(false)}>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 19 }}>
          {t('settingsExtensions.addRepoSubtitle')}
        </Text>
        <Field value={repoInput} onChangeText={setRepoInput} placeholder="https://…/plugins.min.json" multiline autoFocus />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Button label={t('more.resetCancel')} variant="text" onPress={() => setDialogOpen(false)} />
          <Button label={t('settingsRepositories.add')} loading={adding} onPress={handleAddRepo} />
        </View>
      </Dialog>
    </View>
  );
}
