import { Linking, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useStore } from '../../store/useStore';
import { Button, SectionLabel, Surface } from '../../components/MD3';

export default function AboutScreen() {
  const theme = useAppTheme();
  const { userRepositories, installedExtensions } = useStore();

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16 }}>
      <Surface level={1} style={{ padding: 18, marginBottom: 18 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Honya</Text>
        <Text style={{ color: theme.textMuted, marginTop: 8, fontSize: 13.5, lineHeight: 20 }}>
          A light novel reader with Material Design 3 styling. The app ships with no built-in sources: every source comes
          from a repository you add yourself, and plugin code is downloaded only when you tap Install.
        </Text>
      </Surface>

      <SectionLabel>Status</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18 }}>
        <Text style={{ color: theme.text, fontSize: 14 }}>Version 1.0.0</Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6 }}>
          {userRepositories.length} repositories · {Object.keys(installedExtensions).length} extensions installed
        </Text>
      </Surface>

      <SectionLabel>Notice</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 20 }}>
          Extensions are third-party code. Only add repositories you trust — plugin scripts run inside the app with
          network access.
        </Text>
        <View style={{ marginTop: 14 }}>
          <Button
            label="Expo documentation"
            variant="tonal"
            onPress={() => Linking.openURL('https://docs.expo.dev')}
          />
        </View>
      </Surface>

    </ScrollView>
  );
}
