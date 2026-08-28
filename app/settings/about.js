import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../hooks/useI18n';
import { SectionLabel, Surface } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { getCurrentVersion } from '../../lib/updateManager';

export default function AboutScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { userRepositories, installedExtensions, appUpdateState } = useStore();

  const hasUpdate = appUpdateState.latestRelease && !appUpdateState.downloadedVersion;
  const hasDownloaded = !!appUpdateState.downloadedVersion;

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
          {t('settingsAbout.version')} {getCurrentVersion()}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6 }}>
          {userRepositories.length} {t('settingsAbout.repositories')} ·{' '}
          {Object.keys(installedExtensions).length} {t('settingsAbout.extensionsInstalled')}
        </Text>
      </Surface>

      <SectionLabel>{t('update.title').toUpperCase()}</SectionLabel>
      <Surface level={1} style={{ overflow: 'hidden', marginBottom: 18 }}>
        <Ripple onPress={() => router.push('/settings/update')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Ionicons
              name={hasUpdate ? 'arrow-up-circle' : hasDownloaded ? 'checkmark-circle' : 'refresh-outline'}
              size={20}
              color={hasUpdate ? theme.primary : hasDownloaded ? theme.primary : theme.textMuted}
              style={{ width: 30 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
                {hasUpdate
                  ? t('update.available', { version: appUpdateState.latestRelease.version })
                  : hasDownloaded
                    ? t('update.updateReady')
                    : t('update.checkForUpdates')}
              </Text>
              {(hasUpdate || hasDownloaded) && (
                <Text style={{ color: theme.primary, fontSize: 12.5, marginTop: 2, fontWeight: '600' }}>
                  {hasUpdate ? t('update.updateAvailableBadge') : t('update.updateReadyBody', { version: appUpdateState.downloadedVersion })}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={17} color={theme.textMuted} />
          </View>
        </Ripple>
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
