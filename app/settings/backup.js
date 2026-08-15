import { useCallback, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { useStore } from '../../store/useStore';
import { Button, EmptyState, SectionLabel, Surface } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';
import { relativeTime } from '../../lib/time';
import {
  formatBytes,
  getBackupFolderUri,
  pickBackupFolder,
  listBackups,
  deleteBackupFile,
  shareBackupFile,
  pickBackupFile,
  BackupError,
} from '../../lib/backup';

function Row({ icon, text }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}>
      <Ionicons name={icon} size={16} color={theme.textMuted} style={{ marginTop: 2 }} />
      <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, flex: 1 }}>{text}</Text>
    </View>
  );
}

function IconAction({ icon, color, onPress }) {
  return (
    <Ripple borderless onPress={onPress}>
      <View style={{ padding: 8 }}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
    </Ripple>
  );
}

export default function BackupScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { createBackup, restoreBackup } = useStore();
  const [folderUri, setFolderUri] = useState(null);
  const [backups, setBackups] = useState([]);
  const [creating, setCreating] = useState(false);
  const [busyUri, setBusyUri] = useState(null);

  const load = useCallback(async () => {
    setFolderUri(await getBackupFolderUri());
    setBackups(await listBackups());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onChooseFolder = async () => {
    try {
      const uri = await pickBackupFolder();
      if (uri) await load();
    } catch {
      Alert.alert(t('settingsBackup.createFailed'), t('settingsBackup.restoreFailedBody'));
    }
  };

  const onCreate = async () => {
    setCreating(true);
    try {
      const file = await createBackup();
      await load();
      Alert.alert(t('settingsBackup.createDoneTitle'), file.name);
    } catch (e) {
      const message = e instanceof BackupError ? e.message : t('settingsBackup.restoreFailedBody');
      Alert.alert(t('settingsBackup.createFailed'), message);
    } finally {
      setCreating(false);
    }
  };

  const doRestore = (uri) => {
    Alert.alert(t('settingsBackup.confirmTitle'), t('settingsBackup.confirmBody'), [
      { text: t('more.resetCancel'), style: 'cancel' },
      {
        text: t('settingsBackup.restore'),
        onPress: async () => {
          setBusyUri(uri);
          try {
            const meta = await restoreBackup(uri);
            Alert.alert(
              t('settingsBackup.restoreDoneTitle'),
              t('settingsBackup.restoreDoneBody', { novels: meta.novelCount, chapters: meta.chapterCount }),
            );
          } catch (e) {
            const message = e instanceof BackupError ? e.message : t('settingsBackup.restoreFailedBody');
            Alert.alert(t('settingsBackup.restoreFailed'), message);
          } finally {
            setBusyUri(null);
          }
        },
      },
    ]);
  };

  const onRestoreFromFile = async () => {
    let uri;
    try {
      uri = await pickBackupFile();
    } catch (e) {
      Alert.alert(t('settingsBackup.restoreFailed'), e.message ?? String(e));
      return;
    }
    if (uri) doRestore(uri);
  };

  const onShare = async (item) => {
    try {
      await shareBackupFile(item.uri, item.name);
    } catch (e) {
      const message = e instanceof BackupError ? e.message : t('settingsBackup.restoreFailedBody');
      Alert.alert(t('settingsBackup.createFailed'), message);
    }
  };

  const onDelete = (item) => {
    Alert.alert(t('settingsBackup.deleteTitle'), t('settingsBackup.deleteSubtitle', { name: item.name }), [
      { text: t('more.resetCancel'), style: 'cancel' },
      {
        text: t('settingsBackup.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBackupFile(item.uri);
            await load();
          } catch (e) {
            Alert.alert(t('settingsBackup.deleteFailed'), e.message ?? String(e));
          }
        },
      },
    ]);
  };

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={backups}
      keyExtractor={(item) => item.uri}
      ListHeaderComponent={
        <View>
          <SectionLabel>{t('settingsBackup.folder').toUpperCase()}</SectionLabel>
          <Surface level={1} style={{ padding: 16, marginBottom: 18, gap: 12 }}>
            <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
              {folderUri ? t('settingsBackup.folderSet') : t('settingsBackup.folderNotSet')}
            </Text>
            <Button
              label={folderUri ? t('settingsBackup.changeFolder') : t('settingsBackup.chooseFolder')}
              variant="tonal"
              icon={<Ionicons name="folder-outline" size={17} color={theme.text} />}
              onPress={onChooseFolder}
            />
          </Surface>

          <SectionLabel>{t('settingsBackup.create').toUpperCase()}</SectionLabel>
          <Surface level={1} style={{ padding: 16, marginBottom: 18, gap: 12 }}>
            <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>{t('settingsBackup.createSubtitle')}</Text>
            <Button
              label={t('settingsBackup.createAction')}
              icon={<Ionicons name="save-outline" size={17} color={theme.onPrimary} />}
              loading={creating}
              onPress={onCreate}
            />
          </Surface>

          <SectionLabel>{t('settingsBackup.restoreSection').toUpperCase()}</SectionLabel>
        </View>
      }
      renderItem={({ item }) => (
        <View
          style={{
            backgroundColor: theme.surface1,
            borderRadius: RADIUS.lg,
            padding: 14,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 13 }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
              {relativeTime(item.createdAt)} · {formatBytes(item.size)}
              {item.novelCount != null ? ` · ${item.novelCount}` : ''}
            </Text>
          </View>
          {busyUri === item.uri ? (
            <View style={{ padding: 8 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>{t('settingsBackup.restoring')}</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <IconAction icon="refresh-outline" color={theme.primary} onPress={() => doRestore(item.uri)} />
              <IconAction icon="share-outline" color={theme.text} onPress={() => onShare(item)} />
              <IconAction icon="trash-outline" color={theme.error} onPress={() => onDelete(item)} />
            </View>
          )}
        </View>
      )}
      ListEmptyComponent={
        <EmptyState icon="save-outline" title={t('settingsBackup.noBackups')} subtitle={t('settingsBackup.noBackupsSubtitle')} />
      }
      ListFooterComponent={
        <View>
          <Button
            label={t('settingsBackup.restoreFromFile')}
            variant="text"
            icon={<Ionicons name="folder-open-outline" size={17} color={theme.primary} />}
            onPress={onRestoreFromFile}
            style={{ marginBottom: 18, alignSelf: 'flex-start' }}
          />

          <SectionLabel>{t('settingsBackup.included').toUpperCase()}</SectionLabel>
          <Surface level={1} style={{ padding: 16 }}>
            <Row icon="checkmark-circle-outline" text={t('settingsBackup.includedLibrary')} />
            <Row icon="checkmark-circle-outline" text={t('settingsBackup.includedProgress')} />
            <Row icon="checkmark-circle-outline" text={t('settingsBackup.includedSettings')} />
            <Row icon="checkmark-circle-outline" text={t('settingsBackup.includedRepos')} />
            <View style={{ height: 8 }} />
            <Row icon="close-circle-outline" text={t('settingsBackup.excludedDownloads')} />
            <Row icon="close-circle-outline" text={t('settingsBackup.excludedCode')} />
          </Surface>
        </View>
      }
    />
  );
}
