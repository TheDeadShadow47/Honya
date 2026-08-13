import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { useStore } from '../../store/useStore';
import { Button, SectionLabel, Surface } from '../../components/MD3';
import { clearDownloads, getStorageStats } from '../../db/database';

function Stat({ label, value }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
      <Text style={{ color: theme.textMuted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

export default function StorageScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [stats, setStats] = useState({ novels: 0, chapters: 0, downloaded: 0, plugins: 0 });
  const refreshLibrary = useStore((s) => s.refreshLibrary);

  const load = useCallback(async () => setStats(await getStorageStats()), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16 }}>
      <SectionLabel>{t('settingsStorage.database').toUpperCase()}</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18 }}>
        <Stat label={t('settingsStorage.novelsStored')} value={stats.novels} />
        <Stat label={t('settingsStorage.chaptersIndexed')} value={stats.chapters} />
        <Stat label={t('settingsStorage.chaptersDownloaded')} value={stats.downloaded} />
        <Stat label={t('settingsStorage.installedExtensions')} value={stats.plugins} />
      </Surface>

      <SectionLabel>{t('settingsStorage.cleanup').toUpperCase()}</SectionLabel>
      <Surface level={1} style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
          {t('settingsStorage.cleanupSubtitle')}
        </Text>
        <Button
          label={t('settingsStorage.deleteDownloads')}
          variant="tonal"
          onPress={() =>
            Alert.alert(t('settingsStorage.deleteTitle'), t('settingsStorage.deleteSubtitle'), [
              { text: t('more.resetCancel'), style: 'cancel' },
              {
                text: t('settingsStorage.delete'),
                style: 'destructive',
                onPress: async () => {
                  await clearDownloads();
                  await refreshLibrary();
                  await load();
                },
              },
            ])
          }
        />
      </Surface>
    </ScrollView>
  );
}
