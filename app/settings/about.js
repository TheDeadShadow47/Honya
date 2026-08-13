import { ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../hooks/useI18n';
import { SectionLabel, Surface } from '../../components/MD3';

export default function AboutScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { userRepositories, installedExtensions } = useStore();

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16 }}>
      <Surface level={1} style={{ padding: 18, marginBottom: 18 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Honya</Text>
        <Text style={{ color: theme.textMuted, marginTop: 8, fontSize: 13.5, lineHeight: 20 }}>
          {t('settingsAbout.description')}
        </Text>
      </Surface>

      <SectionLabel>{t('settingsAbout.status').toUpperCase()}</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18 }}>
        <Text style={{ color: theme.text, fontSize: 14 }}>
          {t('settingsAbout.version')} 1.1.0
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6 }}>
          {userRepositories.length} {t('settingsAbout.repositories')} ·{' '}
          {Object.keys(installedExtensions).length} {t('settingsAbout.extensionsInstalled')}
        </Text>
      </Surface>

      <SectionLabel>{t('settingsAbout.notice').toUpperCase()}</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 20 }}>
          {t('settingsAbout.noticeText')}
        </Text>
      </Surface>
    </ScrollView>
  );
}
