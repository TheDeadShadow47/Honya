import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
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
  const { t } = useI18n();
  const { prefs, setPref, userRepositories, installedExtensions, library } = useStore();

  const cycleColumns = () => setPref('gridColumns', prefs.gridColumns >= 4 ? 2 : prefs.gridColumns + 1);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40 }}>
      <Surface level={1} style={{ padding: 18, marginBottom: 18 }}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>Honya</Text>
        <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>
          {t('more.stats', { library: library.length, extensions: Object.keys(installedExtensions).length, repos: userRepositories.length })}
        </Text>
      </Surface>

      <SectionLabel>{t('more.appearance').toUpperCase()}</SectionLabel>
      <Group>
        <Row
          icon="color-palette-outline"
          title={t('more.theme')}
          subtitle={THEMES[prefs.theme]?.name ?? t('more.theme')}
          onPress={() => router.push('/settings/theme')}
        />
        <Divider />
        <Row
          icon="grid-outline"
          title={t('more.grid')}
          subtitle={`${prefs.gridColumns} columns`}
          onPress={cycleColumns}
          right={<Ionicons name="swap-horizontal" size={18} color={theme.textMuted} />}
        />
      </Group>

      <SectionLabel>{t('settingsExtensions.installed').toUpperCase()}</SectionLabel>
      <Group>
        <Row
          icon="apps-outline"
          title={t('more.extensions')}
          subtitle={t('more.extensionsSubtitle')}
          onPress={() => router.push('/settings/extensions')}
        />
        <Divider />
        <Row
          icon="server-outline"
          title={t('more.repositories')}
          subtitle={t('more.repositoriesSubtitle')}
          onPress={() => router.push('/settings/repositories')}
        />
      </Group>

      <SectionLabel>{t('more.reading').toUpperCase()}</SectionLabel>
      <Group>
        <Row
          icon="book-outline"
          title={t('more.readerSettings')}
          subtitle={t('more.readerSubtitle')}
          onPress={() => router.push('/settings/reader')}
        />
        <Divider />
        <Row
          icon="language-outline"
          title={t('settingsLanguage.title')}
          subtitle={t('settingsLanguage.subtitle')}
          onPress={() => router.push('/settings/language')}
        />
      </Group>

      <SectionLabel>{t('more.application').toUpperCase()}</SectionLabel>
      <Group>
        <Row
          icon="save-outline"
          title={t('more.storage')}
          subtitle={t('more.storageSubtitle')}
          onPress={() => router.push('/settings/storage')}
        />
        <Divider />
        <Row icon="information-circle-outline" title={t('more.about')} onPress={() => router.push('/settings/about')} />
        <Divider />
        <Row
          icon="refresh-outline"
          title={t('more.resetPrefs')}
          subtitle={t('more.resetPrefsSubtitle')}
          onPress={() =>
            Alert.alert(t('more.resetConfirm'), t('more.resetConfirmBody'), [
              { text: t('more.resetCancel'), style: 'cancel' },
              { text: t('more.resetAction'), style: 'destructive', onPress: () => useStore.getState().resetPrefs() },
            ])
          }
          right={<View style={{ width: 1, borderRadius: RADIUS.sm }} />}
        />
      </Group>
    </ScrollView>
  );
}
