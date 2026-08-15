import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { useStore } from '../../store/useStore';
import { Button, SectionLabel, Surface } from '../../components/MD3';
import { relativeTime } from '../../lib/time';
import { formatBytes, pickBackupFile, shareBackupFile, BackupError } from '../../lib/backup';

function Row({ icon, text }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}>
      <Ionicons name={icon} size={16} color={theme.textMuted} style={{ marginTop: 2 }} />
      <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, flex: 1 }}>{text}</Text>
    </View>
  );
}

export default function BackupScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { createBackup, restoreBackup, lastBackup } = useStore();
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const onCreate = async () => {
    setCreating(true);
    try {
      const file = await createBackup();
      await shareBackupFile(file.uri, file.name);
    } catch (e) {
      Alert.alert(t('settingsBackup.createFailed'), e.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  const onRestore = async () => {
    let uri;
    try {
      uri = await pickBackupFile();
    } catch (e) {
      Alert.alert(t('settingsBackup.restoreFailed'), e.message ?? String(e));
      return;
    }
    if (!uri) return;

    Alert.alert(t('settingsBackup.confirmTitle'), t('settingsBackup.confirmBody'), [
      { text: t('more.resetCancel'), style: 'cancel' },
      {
        text: t('settingsBackup.restore'),
        onPress: async () => {
          setRestoring(true);
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
            setRestoring(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionLabel>{t('settingsBackup.create').toUpperCase()}</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18, gap: 12 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>{t('settingsBackup.createSubtitle')}</Text>
        <Button
          label={t('settingsBackup.createAction')}
          icon={<Ionicons name="save-outline" size={17} color={theme.onPrimary} />}
          loading={creating}
          onPress={onCreate}
        />
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          {lastBackup
            ? t('settingsBackup.lastBackup', { time: relativeTime(lastBackup.at), size: formatBytes(lastBackup.size), novels: lastBackup.novels })
            : t('settingsBackup.noBackupYet')}
        </Text>
      </Surface>

      <SectionLabel>{t('settingsBackup.restoreSection').toUpperCase()}</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18, gap: 12 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>{t('settingsBackup.restoreSubtitle')}</Text>
        {restoring ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
            <ActivityIndicator color={theme.primary} />
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>{t('settingsBackup.restoring')}</Text>
          </View>
        ) : (
          <Button
            label={t('settingsBackup.restoreAction')}
            variant="tonal"
            icon={<Ionicons name="folder-open-outline" size={17} color={theme.text} />}
            onPress={onRestore}
          />
        )}
      </Surface>

      <SectionLabel>{t('settingsBackup.included').toUpperCase()}</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18 }}>
        <Row icon="checkmark-circle-outline" text={t('settingsBackup.includedLibrary')} />
        <Row icon="checkmark-circle-outline" text={t('settingsBackup.includedProgress')} />
        <Row icon="checkmark-circle-outline" text={t('settingsBackup.includedSettings')} />
        <Row icon="checkmark-circle-outline" text={t('settingsBackup.includedRepos')} />
        <View style={{ height: 8 }} />
        <Row icon="close-circle-outline" text={t('settingsBackup.excludedDownloads')} />
        <Row icon="close-circle-outline" text={t('settingsBackup.excludedCode')} />
      </Surface>
    </ScrollView>
  );
}
