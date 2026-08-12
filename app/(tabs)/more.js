import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { SectionLabel, Surface } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS, THEMES } from '../../theme/theme';

function Row({ icon, title, subtitle, onPress, right, danger }) {
  const theme = useAppTheme();
  const tint = danger ? theme.error : theme.primary;
  return (
    <Ripple onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
        <Ionicons name={icon} size={20} color={tint} style={{ width: 30 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
          {subtitle ? <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        {right ?? <Ionicons name="chevron-forward" size={17} color={theme.textMuted} />}
      </View>
    </Ripple>
  );
}

function Group({ children }) {
  return (
    <Surface level={1} style={{ overflow: 'hidden', marginBottom: 18 }}>
      {children}
    </Surface>
  );
}

function Divider() {
  const theme = useAppTheme();
  return <View style={{ height: 1, backgroundColor: theme.outline, marginLeft: 46 }} />;
}

export default function MoreScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { prefs, setPref, userRepositories, installedExtensions, library } = useStore();

  const cycleColumns = () => setPref('gridColumns', prefs.gridColumns >= 4 ? 2 : prefs.gridColumns + 1);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40 }}>
      <Surface level={1} style={{ padding: 18, marginBottom: 18 }}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>Honya</Text>
        <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>
          {library.length} in library · {Object.keys(installedExtensions).length} extensions · {userRepositories.length}{' '}
          repositories
        </Text>
      </Surface>

      <SectionLabel>Appearance</SectionLabel>
      <Group>
        <Row
          icon="color-palette-outline"
          title="Theme"
          subtitle={THEMES[prefs.theme]?.name ?? 'Theme'}
          onPress={() => router.push('/settings/theme')}
        />
        <Divider />
        <Row
          icon="grid-outline"
          title="Library grid"
          subtitle={`${prefs.gridColumns} columns`}
          onPress={cycleColumns}
          right={<Ionicons name="swap-horizontal" size={18} color={theme.textMuted} />}
        />
      </Group>

      <SectionLabel>Extensions & Sources</SectionLabel>
      <Group>
        <Row
          icon="apps-outline"
          title="Extensions"
          subtitle="Install or manage sources"
          onPress={() => router.push('/settings/extensions')}
        />
        <Divider />
        <Row
          icon="server-outline"
          title="Repositories"
          subtitle="Add or remove plugin sources"
          onPress={() => router.push('/settings/repositories')}
        />
      </Group>

      <SectionLabel>Reading</SectionLabel>
      <Group>
        <Row
          icon="book-outline"
          title="Reader settings"
          subtitle="Font, spacing and background"
          onPress={() => router.push('/settings/reader')}
        />
      </Group>

      <SectionLabel>Application</SectionLabel>
      <Group>
        <Row
          icon="save-outline"
          title="Storage"
          subtitle="Downloads and database"
          onPress={() => router.push('/settings/storage')}
        />
        <Divider />
        <Row icon="information-circle-outline" title="App info" onPress={() => router.push('/settings/about')} />
        <Divider />
        <Row
          icon="refresh-outline"
          title="Reset preferences"
          subtitle="Restore default appearance and reader settings"
          onPress={() =>
            Alert.alert('Reset preferences?', 'Library and extensions are not affected.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => useStore.getState().resetPrefs() },
            ])
          }
          right={<View style={{ width: 1, borderRadius: RADIUS.sm }} />}
        />
      </Group>
    </ScrollView>
  );
}
