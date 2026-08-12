import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '../../hooks/useAppTheme';
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
      <SectionLabel>Database</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18 }}>
        <Stat label="Novels stored" value={stats.novels} />
        <Stat label="Chapters indexed" value={stats.chapters} />
        <Stat label="Chapters downloaded" value={stats.downloaded} />
        <Stat label="Installed extensions" value={stats.plugins} />
      </Surface>

      <SectionLabel>Cleanup</SectionLabel>
      <Surface level={1} style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
          Removing downloads keeps your library and read progress; chapter text is refetched from its source when opened.
        </Text>
        <Button
          label="Delete downloaded chapters"
          variant="tonal"
          onPress={() =>
            Alert.alert('Delete downloads?', 'Chapter text will be removed from this device.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
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
